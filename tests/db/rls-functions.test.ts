import { afterEach, describe, expect, test } from "bun:test";
import { truncateAll } from "@/tests/setup/schema";
import {
  appUserConnect,
  seedUserOrgProject,
  serviceRoleConnect,
} from "@/tests/setup/seed";

afterEach(async () => {
  await truncateAll();
});

/**
 * Tests for the SECURITY DEFINER helper functions in docker/rls-functions.sql.
 * Functions execute under their owner's privileges so they can read/write
 * team_invite_code rows without requiring the calling user to be a member
 * of the target org.
 */
describe("invite-code SECURITY DEFINER functions", () => {
  async function seedCode(opts: {
    orgId: string;
    code: string;
    maxUses?: number | null;
    expiresAt?: Date | null;
    revokedAt?: Date | null;
    useCount?: number;
  }): Promise<{ id: string }> {
    const sr = serviceRoleConnect();
    try {
      const rows = await sr<{ id: string }[]>`
        INSERT INTO team_invite_code (
          organization_id, code, default_role, max_uses, expires_at, revoked_at, use_count
        ) VALUES (
          ${opts.orgId}, ${opts.code}, 'member',
          ${opts.maxUses ?? null}, ${opts.expiresAt ?? null}, ${opts.revokedAt ?? null},
          ${opts.useCount ?? 0}
        )
        RETURNING id
      `;
      return rows[0];
    } finally {
      await sr.end({ timeout: 5 });
    }
  }

  test("lookup_team_invite_code returns the four diagnostic fields when run as app_user without GUC", async () => {
    const fx = await seedUserOrgProject("lookup-1");
    await seedCode({
      orgId: fx.organizationId,
      code: "LOOKUP1",
      maxUses: 5,
      useCount: 2,
    });
    const c = appUserConnect();
    try {
      const rows = await c<Array<{
        revoked_at: Date | null;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
      }>>`SELECT revoked_at, expires_at, max_uses, use_count FROM public.lookup_team_invite_code(${"LOOKUP1"})`;
      expect(rows.length).toBe(1);
      expect(rows[0].revoked_at).toBeNull();
      expect(rows[0].max_uses).toBe(5);
      expect(rows[0].use_count).toBe(2);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("lookup_team_invite_code does NOT return id / organization_id / default_role", async () => {
    const fx = await seedUserOrgProject("lookup-shape");
    await seedCode({ orgId: fx.organizationId, code: "LOOKUPSHAPE" });
    const c = appUserConnect();
    try {
      await expect(
        c`SELECT id FROM public.lookup_team_invite_code(${"LOOKUPSHAPE"})`,
      ).rejects.toThrow(/column "id" does not exist/i);
      await expect(
        c`SELECT organization_id FROM public.lookup_team_invite_code(${"LOOKUPSHAPE"})`,
      ).rejects.toThrow(/column "organization_id" does not exist/i);
      await expect(
        c`SELECT default_role FROM public.lookup_team_invite_code(${"LOOKUPSHAPE"})`,
      ).rejects.toThrow(/column "default_role" does not exist/i);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("reserve_team_invite_code_slot increments use_count on a valid code", async () => {
    const fx = await seedUserOrgProject("reserve-1");
    const seeded = await seedCode({
      orgId: fx.organizationId,
      code: "RESERVE1",
      useCount: 0,
    });
    const c = appUserConnect();
    try {
      const rows = await c<Array<{ id: string }>>`
        SELECT id FROM public.reserve_team_invite_code_slot(${"RESERVE1"})
      `;
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(seeded.id);
    } finally {
      await c.end({ timeout: 5 });
    }
    const sr = serviceRoleConnect();
    try {
      const [row] = await sr<Array<{ use_count: number }>>`
        SELECT use_count FROM team_invite_code WHERE id = ${seeded.id}
      `;
      expect(row.use_count).toBe(1);
    } finally {
      await sr.end({ timeout: 5 });
    }
  });

  test("reserve_team_invite_code_slot returns empty when code is revoked", async () => {
    const fx = await seedUserOrgProject("reserve-2");
    await seedCode({
      orgId: fx.organizationId,
      code: "REVOKED1",
      revokedAt: new Date(),
    });
    const c = appUserConnect();
    try {
      const rows = await c`SELECT * FROM public.reserve_team_invite_code_slot(${"REVOKED1"})`;
      expect(rows.length).toBe(0);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("reserve_team_invite_code_slot returns empty when code is expired", async () => {
    const fx = await seedUserOrgProject("reserve-3");
    await seedCode({
      orgId: fx.organizationId,
      code: "EXPIRED1",
      expiresAt: new Date(Date.now() - 1000),
    });
    const c = appUserConnect();
    try {
      const rows = await c`SELECT * FROM public.reserve_team_invite_code_slot(${"EXPIRED1"})`;
      expect(rows.length).toBe(0);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("reserve_team_invite_code_slot returns empty when use_count >= max_uses", async () => {
    const fx = await seedUserOrgProject("reserve-4");
    await seedCode({
      orgId: fx.organizationId,
      code: "EXHAUSTED1",
      maxUses: 1,
      useCount: 1,
    });
    const c = appUserConnect();
    try {
      const rows = await c`SELECT * FROM public.reserve_team_invite_code_slot(${"EXHAUSTED1"})`;
      expect(rows.length).toBe(0);
    } finally {
      await c.end({ timeout: 5 });
    }
  });

  test("release_team_invite_code_slot decrements use_count, floored at zero", async () => {
    const fx = await seedUserOrgProject("release-1");
    const seeded = await seedCode({
      orgId: fx.organizationId,
      code: "RELEASE1",
      useCount: 1,
    });
    const c = appUserConnect();
    try {
      await c`SELECT public.release_team_invite_code_slot(${seeded.id}::uuid)`;
    } finally {
      await c.end({ timeout: 5 });
    }
    const sr = serviceRoleConnect();
    try {
      const [row] = await sr<Array<{ use_count: number }>>`
        SELECT use_count FROM team_invite_code WHERE id = ${seeded.id}
      `;
      expect(row.use_count).toBe(0);
    } finally {
      await sr.end({ timeout: 5 });
    }

    const c2 = appUserConnect();
    try {
      await c2`SELECT public.release_team_invite_code_slot(${seeded.id}::uuid)`;
    } finally {
      await c2.end({ timeout: 5 });
    }
    const sr2 = serviceRoleConnect();
    try {
      const [row] = await sr2<Array<{ use_count: number }>>`
        SELECT use_count FROM team_invite_code WHERE id = ${seeded.id}
      `;
      expect(row.use_count).toBe(0);
    } finally {
      await sr2.end({ timeout: 5 });
    }
  });

  test("reserve_team_invite_code_slot sets reserved_until ~15 minutes ahead", async () => {
    const fx = await seedUserOrgProject("ttl-1");
    await seedCode({ orgId: fx.organizationId, code: "TTL1", useCount: 0 });
    const c = appUserConnect();
    try {
      await c`SELECT * FROM public.reserve_team_invite_code_slot(${"TTL1"})`;
    } finally {
      await c.end({ timeout: 5 });
    }
    const sr = serviceRoleConnect();
    try {
      const [row] = await sr<Array<{ reserved_until: Date | null }>>`
        SELECT reserved_until FROM team_invite_code WHERE code = ${"TTL1"}
      `;
      expect(row.reserved_until).not.toBeNull();
      const aheadMs = (row.reserved_until as Date).getTime() - Date.now();
      expect(aheadMs).toBeGreaterThan(14 * 60_000);
      expect(aheadMs).toBeLessThan(16 * 60_000);
    } finally {
      await sr.end({ timeout: 5 });
    }
  });

  test("reserve sweeps a stale (crashed) reservation before a new attempt — maxUses=1 case", async () => {
    const fx = await seedUserOrgProject("ttl-sweep");
    const seeded = await seedCode({
      orgId: fx.organizationId,
      code: "SWEEP1",
      maxUses: 1,
      useCount: 1,
    });
    const sr = serviceRoleConnect();
    try {
      await sr`UPDATE team_invite_code SET reserved_until = NOW() - interval '1 minute' WHERE id = ${seeded.id}`;
    } finally {
      await sr.end({ timeout: 5 });
    }

    const c = appUserConnect();
    let reservedRows: Array<{ id: string }> = [];
    try {
      reservedRows = await c<Array<{ id: string }>>`
        SELECT id FROM public.reserve_team_invite_code_slot(${"SWEEP1"})
      `;
    } finally {
      await c.end({ timeout: 5 });
    }
    expect(reservedRows.length).toBe(1);

    const sr2 = serviceRoleConnect();
    try {
      const [row] = await sr2<Array<{ use_count: number; reserved_until: Date | null }>>`
        SELECT use_count, reserved_until FROM team_invite_code WHERE id = ${seeded.id}
      `;
      expect(row.use_count).toBe(1);
      expect(row.reserved_until).not.toBeNull();
    } finally {
      await sr2.end({ timeout: 5 });
    }
  });

  test("release finalizes (clears reserved_until without decrementing) when caller is already a member", async () => {
    const fx = await seedUserOrgProject("finalize-1");
    const seeded = await seedCode({
      orgId: fx.organizationId,
      code: "FINAL1",
      useCount: 1,
    });
    const sr = serviceRoleConnect();
    try {
      await sr`UPDATE team_invite_code SET reserved_until = NOW() + interval '15 minutes' WHERE id = ${seeded.id}`;
    } finally {
      await sr.end({ timeout: 5 });
    }

    const c = appUserConnect();
    try {
      await c.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${fx.userId}, true)`;
        await tx`SELECT public.release_team_invite_code_slot(${seeded.id}::uuid)`;
      });
    } finally {
      await c.end({ timeout: 5 });
    }

    const sr2 = serviceRoleConnect();
    try {
      const [row] = await sr2<Array<{ use_count: number; reserved_until: Date | null }>>`
        SELECT use_count, reserved_until FROM team_invite_code WHERE id = ${seeded.id}
      `;
      expect(row.use_count).toBe(1);
      expect(row.reserved_until).toBeNull();
    } finally {
      await sr2.end({ timeout: 5 });
    }
  });

  test("EXECUTE is granted to app_user only (no PUBLIC, no service_role)", async () => {
    // Tighter and faster than spinning up a throwaway role: query the
    // catalog directly. has_function_privilege returns false for any role
    // that wasn't granted EXECUTE. We assert: app_user has it; PUBLIC and
    // service_role do not. (service_role keeps DML on the table but is not
    // expected to call these functions — it can bypass RLS directly.)
    const sr = serviceRoleConnect();
    try {
      const fns = [
        "public.lookup_team_invite_code(text)",
        "public.reserve_team_invite_code_slot(text)",
        "public.release_team_invite_code_slot(uuid)",
      ];
      for (const fn of fns) {
        const [row] = await sr<
          Array<{ app_user: boolean; public_role: boolean; service_role: boolean }>
        >`
          SELECT has_function_privilege('app_user', ${fn}, 'EXECUTE') AS app_user,
                 has_function_privilege('public', ${fn}, 'EXECUTE') AS public_role,
                 has_function_privilege('service_role', ${fn}, 'EXECUTE') AS service_role
        `;
        expect(row.app_user).toBe(true);
        expect(row.public_role).toBe(false);
        expect(row.service_role).toBe(false);
      }
    } finally {
      await sr.end({ timeout: 5 });
    }
  });
});
