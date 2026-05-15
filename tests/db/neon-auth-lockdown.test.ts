import { afterEach, describe, expect, test } from "bun:test";
import { truncateAll } from "@/tests/setup/schema";
import { appUserConnect, seedUserOrgProject } from "@/tests/setup/seed";

afterEach(async () => {
  await truncateAll();
});

describe("app_user neon_auth lockdown", () => {
  const tables = [
    "user",
    "session",
    "account",
    "verification",
    "organization",
    "member",
    "invitation",
    "oauthAccessToken",
    "oauthRefreshToken",
    "oauthConsent",
    "oauthClient",
    "jwks",
  ];

  for (const t of tables) {
    test(`app_user cannot SELECT from neon_auth.${t}`, async () => {
      const c = appUserConnect();
      try {
        await expect(
          c.unsafe(`SELECT 1 FROM neon_auth."${t}" LIMIT 1`),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await c.end({ timeout: 5 });
      }
    });
  }

  test("app_user can call public.current_user_has_any_membership() — returns false with no GUC", async () => {
    const c = appUserConnect();
    try {
      const rows = await c<{ current_user_has_any_membership: boolean }[]>`
        SELECT public.current_user_has_any_membership()
      `;
      expect(rows[0].current_user_has_any_membership).toBe(false);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("app_user can call public.current_user_org_ids() — empty with no GUC", async () => {
    const c = appUserConnect();
    try {
      const rows = await c<{ current_user_org_ids: string[] | null }[]>`
        SELECT public.current_user_org_ids()
      `;
      const arr = rows[0].current_user_org_ids ?? [];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBe(0);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("public.current_user_org_ids() returns the caller's orgs under the right GUC", async () => {
    const fx = await seedUserOrgProject("lockdown-org-ids");
    const c = appUserConnect();
    try {
      await c.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${fx.userId}, true)`;
        const rows = await tx<{ current_user_org_ids: string[] }[]>`
          SELECT public.current_user_org_ids()
        `;
        expect(rows[0].current_user_org_ids).toContain(fx.organizationId);
      });
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("public.current_user_org_ids() does NOT leak another team's org under the wrong GUC", async () => {
    const teamA = await seedUserOrgProject("lockdown-leak-a");
    const teamB = await seedUserOrgProject("lockdown-leak-b");
    const c = appUserConnect();
    try {
      await c.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${teamB.userId}, true)`;
        const rows = await tx<{ current_user_org_ids: string[] }[]>`
          SELECT public.current_user_org_ids()
        `;
        expect(rows[0].current_user_org_ids).not.toContain(teamA.organizationId);
      });
    } finally {
      await c.end({ timeout: 5 });
    }
  });
});
