import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { truncateAll } from "@/tests/setup/schema";
import { seedUserOrgProject } from "@/tests/setup/seed";
import { getConnectionString } from "@/tests/setup/container";
import { withAppUserDb } from "@/tests/setup/rls";
import { makeAuthContext } from "@/lib/auth/context";
import {
  createTeamInviteCode,
  findTeamInviteCode,
  revokeTeamInviteCode,
  rotateTeamInviteCode,
} from "@/lib/data/team-invite-code";

/**
 * Discipline tests for the data-ring's RLS contract: every public-schema
 * mutation that takes an `AuthContext` (or an admin `userId`) MUST run
 * inside `withUserContext` so the `app.user_id` GUC satisfies the policy
 * USING/WITH CHECK clauses.
 *
 * Why this file exists: `tests/setup/global.ts` points `DATABASE_URL` at
 * the testcontainer superuser (`mymir`), which has implicit BYPASSRLS, so
 * the existing 221-test suite silently bypasses RLS. A future PR that
 * lands a new data-ring mutation without `withUserContext` would still go
 * green in CI. These tests pin the global `db` Proxy to an `app_user`
 * connection for the call and assert the mutation succeeds — the only
 * way that mutation succeeds is if its function body opens a transaction
 * with `set_config('app.user_id', ..., true)`.
 *
 * Coverage is concentrated on the 4 team-invite-code admin helpers
 * (`findTeamInviteCode`, `createTeamInviteCode`, `rotateTeamInviteCode`,
 * `revokeTeamInviteCode`) because they neither traverse
 * `assertProjectAccess`/`assertTaskAccess` (which read on the bare `db`
 * client without their own `withUserContext` frame) nor depend on
 * `appendTaskHistory`. That isolation makes them the cleanest probe for
 * "this helper runs under the GUC". The edge / project mutation sites
 * (`createEdge`, `updateEdge`, `removeEdge`, `deleteProject`) are wired
 * through the same `withUserContext` pattern; once the read-path
 * assertions also move under `withUserContext` (deferred follow-up
 * tracked in the PR description), the same shape extends to them.
 */

beforeAll(() => {
  // Sanity: the global setup must have provisioned the app_user role and
  // pointed DATABASE_URL at the superuser. We rely on both.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set; tests/setup/global.ts didn't run");
  }
});

afterEach(async () => {
  await truncateAll();
});

describe("RLS data-ring discipline — withUserContext wrappers", () => {
  test("findTeamInviteCode succeeds under app_user (uses withUserContext)", async () => {
    const fx = await seedUserOrgProject("dr-find");

    // Seed an existing invite code via the superuser bypass.
    const seedSql = postgres(getConnectionString(), { max: 1 });
    try {
      await seedSql`
        INSERT INTO team_invite_code (organization_id, code, created_by)
        VALUES (${fx.organizationId}, ${"SEED-FIND-CODE"}, ${fx.userId})
      `;
    } finally {
      await seedSql.end({ timeout: 5 });
    }

    const row = await withAppUserDb(() =>
      findTeamInviteCode(fx.organizationId, fx.userId),
    );

    expect(row).not.toBeNull();
    expect(row?.code).toBe("SEED-FIND-CODE");
  });

  test("findTeamInviteCode returns null under app_user when GUC user is cross-team", async () => {
    const teamA = await seedUserOrgProject("dr-find-a");
    const teamB = await seedUserOrgProject("dr-find-b");

    const seedSql = postgres(getConnectionString(), { max: 1 });
    try {
      await seedSql`
        INSERT INTO team_invite_code (organization_id, code, created_by)
        VALUES (${teamA.organizationId}, ${"TEAM-A-CODE"}, ${teamA.userId})
      `;
    } finally {
      await seedSql.end({ timeout: 5 });
    }

    // teamB's admin should NOT see teamA's invite-code row. The policy
    // joins through neon_auth.member, which has no (teamA.org, teamB.user)
    // pairing, so the USING predicate filters the row out.
    const leak = await withAppUserDb(() =>
      findTeamInviteCode(teamA.organizationId, teamB.userId),
    );

    expect(leak).toBeNull();
  });

  test("createTeamInviteCode succeeds under app_user (uses withUserContext)", async () => {
    const fx = await seedUserOrgProject("dr-create");

    const created = await withAppUserDb(() =>
      createTeamInviteCode({
        organizationId: fx.organizationId,
        code: "NEW-CREATE-CODE",
        createdBy: fx.userId,
      }),
    );

    expect(created.code).toBe("NEW-CREATE-CODE");
    expect(created.organizationId).toBe(fx.organizationId);

    // Confirm the row really landed (read via the superuser bypass to
    // sidestep the policy and prove the write itself happened).
    const verify = postgres(getConnectionString(), { max: 1 });
    try {
      const rows =
        await verify<{ code: string }[]>`SELECT code FROM team_invite_code WHERE organization_id = ${fx.organizationId}`;
      expect(rows.length).toBe(1);
      expect(rows[0].code).toBe("NEW-CREATE-CODE");
    } finally {
      await verify.end({ timeout: 5 });
    }
  });

  test("rotateTeamInviteCode succeeds under app_user (uses withUserContext)", async () => {
    const fx = await seedUserOrgProject("dr-rotate");

    const seedSql = postgres(getConnectionString(), { max: 1 });
    try {
      await seedSql`
        INSERT INTO team_invite_code (organization_id, code, created_by, use_count)
        VALUES (${fx.organizationId}, ${"OLD-ROTATE-CODE"}, ${fx.userId}, 3)
      `;
    } finally {
      await seedSql.end({ timeout: 5 });
    }

    const rotated = await withAppUserDb(() =>
      rotateTeamInviteCode({
        organizationId: fx.organizationId,
        newCode: "NEW-ROTATE-CODE",
        adminUserId: fx.userId,
      }),
    );

    expect(rotated).not.toBeNull();
    expect(rotated?.code).toBe("NEW-ROTATE-CODE");
    expect(rotated?.useCount).toBe(0);
    expect(rotated?.revokedAt).toBeNull();
  });

  test("revokeTeamInviteCode succeeds under app_user (uses withUserContext)", async () => {
    const fx = await seedUserOrgProject("dr-revoke");

    const seedSql = postgres(getConnectionString(), { max: 1 });
    try {
      await seedSql`
        INSERT INTO team_invite_code (organization_id, code, created_by)
        VALUES (${fx.organizationId}, ${"REVOKE-ME"}, ${fx.userId})
      `;
    } finally {
      await seedSql.end({ timeout: 5 });
    }

    const revoked = await withAppUserDb(() =>
      revokeTeamInviteCode(fx.organizationId, fx.userId),
    );

    expect(revoked).not.toBeNull();
    expect(revoked?.revokedAt).not.toBeNull();
  });

  test("rotateTeamInviteCode under app_user with cross-team GUC mutates zero rows", async () => {
    const teamA = await seedUserOrgProject("dr-cross-a");
    const teamB = await seedUserOrgProject("dr-cross-b");

    const seedSql = postgres(getConnectionString(), { max: 1 });
    try {
      await seedSql`
        INSERT INTO team_invite_code (organization_id, code, created_by)
        VALUES (${teamA.organizationId}, ${"TEAM-A-ROTATE"}, ${teamA.userId})
      `;
    } finally {
      await seedSql.end({ timeout: 5 });
    }

    // Driving rotateTeamInviteCode against teamA's org with teamB's
    // admin user as the GUC must NOT mutate teamA's row — the policy
    // USING predicate filters the UPDATE's target out.
    const rotated = await withAppUserDb(() =>
      rotateTeamInviteCode({
        organizationId: teamA.organizationId,
        newCode: "LEAKED-ROTATE",
        adminUserId: teamB.userId,
      }),
    );

    expect(rotated).toBeNull();

    // Confirm teamA's row is unchanged.
    const verify = postgres(getConnectionString(), { max: 1 });
    try {
      const rows =
        await verify<{ code: string }[]>`SELECT code FROM team_invite_code WHERE organization_id = ${teamA.organizationId}`;
      expect(rows.length).toBe(1);
      expect(rows[0].code).toBe("TEAM-A-ROTATE");
    } finally {
      await verify.end({ timeout: 5 });
    }
  });

  test("AuthContext factory still mints expected userId shape", () => {
    // Smoke check that the AuthContext brand contract hasn't drifted —
    // the team-invite-code helpers don't take an AuthContext directly
    // (they take adminUserId), but the wider edge/project helpers do,
    // and they accept any value minted by makeAuthContext.
    const ctx = makeAuthContext("00000000-0000-0000-0000-000000000001");
    expect(ctx.userId).toBe("00000000-0000-0000-0000-000000000001");
  });
});
