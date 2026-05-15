import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { executeRaw, executeRawDiscard } from "@/lib/db/raw";
import { withUserContext } from "@/lib/db/rls";
import { teamInviteCodes } from "@/lib/db/team-schema";

/** Full invite-code row, inferred from the schema. */
export type InviteCodeRow = typeof teamInviteCodes.$inferSelect;

/**
 * Look up the existing invite-code row for a team.
 *
 * Runs under the supplied admin's `app.user_id` GUC so the row passes the
 * RLS policy's membership predicate. The action layer
 * (`lib/actions/team-invite-code.ts`) verifies the caller is an org admin
 * via {@link isOrgAdmin} before invoking this helper, which guarantees the
 * admin is a member of the target org.
 *
 * @param organizationId - UUID of the team.
 * @param adminUserId - UUID of the org admin performing the lookup.
 * @returns The row, or null when the team has no code yet.
 */
export async function findTeamInviteCode(
  organizationId: string,
  adminUserId: string,
): Promise<InviteCodeRow | null> {
  return withUserContext(adminUserId, async (tx) => {
    const [row] = await tx
      .select()
      .from(teamInviteCodes)
      .where(eq(teamInviteCodes.organizationId, organizationId))
      .limit(1);
    return row ?? null;
  });
}

/** Inputs for creating a fresh invite code row. */
export type CreateInviteCodeInput = {
  organizationId: string;
  code: string;
  createdBy: string;
};

/**
 * Insert a new invite-code row. Caller supplies the generated code value.
 * Surfaces the underlying driver error (notably `23505` on the org_id
 * UNIQUE) so the caller can run its retry-as-lookup compensation.
 *
 * Runs under `createdBy`'s GUC — the action layer enforces that `createdBy`
 * is an admin of `organizationId`, which satisfies the policy WITH CHECK
 * clause's membership predicate.
 *
 * @param input - Team UUID, generated code, and creator user id.
 * @returns The inserted row.
 */
export async function createTeamInviteCode(
  input: CreateInviteCodeInput,
): Promise<InviteCodeRow> {
  return withUserContext(input.createdBy, async (tx) => {
    const [row] = await tx
      .insert(teamInviteCodes)
      .values({
        organizationId: input.organizationId,
        code: input.code,
        createdBy: input.createdBy,
      })
      .returning();
    return row;
  });
}

/** Inputs for rotating a team's invite code. */
export type RotateInviteCodeInput = {
  organizationId: string;
  newCode: string;
  adminUserId: string;
};

/**
 * Rotate the team's existing code: replace `code`, reset `use_count`, clear
 * `revoked_at`. Old codes stop working immediately because lookups are by
 * `code` (UNIQUE).
 *
 * Runs under `adminUserId`'s GUC; the action layer enforces admin
 * membership of `organizationId` before this helper runs.
 *
 * @param input - Team UUID, freshly generated code, and admin user id.
 * @returns The updated row, or null when the team has no row to update.
 */
export async function rotateTeamInviteCode(
  input: RotateInviteCodeInput,
): Promise<InviteCodeRow | null> {
  return withUserContext(input.adminUserId, async (tx) => {
    const [row] = await tx
      .update(teamInviteCodes)
      .set({
        code: input.newCode,
        useCount: 0,
        revokedAt: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(teamInviteCodes.organizationId, input.organizationId))
      .returning();
    return row ?? null;
  });
}

/**
 * Mark the team's invite code as revoked. Subsequent join attempts fail.
 *
 * Runs under `adminUserId`'s GUC; the action layer enforces admin
 * membership of `organizationId` before this helper runs.
 *
 * @param organizationId - UUID of the team.
 * @param adminUserId - UUID of the org admin performing the revoke.
 * @returns The updated row, or null when the team has no row to revoke.
 */
export async function revokeTeamInviteCode(
  organizationId: string,
  adminUserId: string,
): Promise<InviteCodeRow | null> {
  return withUserContext(adminUserId, async (tx) => {
    const [row] = await tx
      .update(teamInviteCodes)
      .set({ revokedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(teamInviteCodes.organizationId, organizationId))
      .returning();
    return row ?? null;
  });
}

/** Reservation handle returned by {@link reserveInviteCodeSlot}. */
export type InviteCodeReservation = {
  id: string;
  orgId: string;
  defaultRole: "member" | "admin";
};

/**
 * Atomically reserve a slot on an invite code: increments `use_count` if
 * the code is non-revoked, non-expired, and below `max_uses`. Returns the
 * row's `{id, orgId, defaultRole}` on success, null when the code is
 * invalid or exhausted.
 *
 * Anti-enumeration: a null result hides which validity guard failed.
 *
 * @param code - Raw invite code string (already shape-validated).
 * @returns Reservation handle, or null on failure.
 */
export async function reserveInviteCodeSlot(
  code: string,
): Promise<InviteCodeReservation | null> {
  const rows = await executeRaw<{
    id: string;
    organization_id: string;
    default_role: "member" | "admin";
  }>(
    db,
    sql`SELECT id, organization_id, default_role FROM public.reserve_team_invite_code_slot(${code})`,
  );
  const reserved = rows[0];
  if (!reserved) return null;
  return {
    id: reserved.id,
    orgId: reserved.organization_id,
    defaultRole: reserved.default_role,
  };
}

/**
 * Decrement a reserved slot when the downstream membership add fails.
 * Saga compensation — never drops below zero.
 *
 * @param id - UUID of the invite-code row whose slot was reserved.
 */
export async function releaseInviteCodeSlot(id: string): Promise<void> {
  await executeRawDiscard(
    db,
    sql`SELECT public.release_team_invite_code_slot(${id}::uuid)`,
  );
}

/** Diagnostic outcome categories. */
export type InviteCodeDiagnosis =
  | "not_found"
  | "revoked"
  | "expired"
  | "exhausted"
  | "unknown";

/**
 * Best-effort diagnostic for ops triage when a code lookup fails. NEVER
 * surfaced to end users — anti-enumeration. Catches all errors so a
 * diagnostic miss never disrupts the calling action.
 *
 * @param code - Raw invite code string.
 * @returns Classification of why the code is invalid.
 */
export async function diagnoseTeamInviteCode(
  code: string,
): Promise<InviteCodeDiagnosis> {
  try {
    const rows = await executeRaw<{
      revoked_at: Date | string | null;
      expires_at: Date | string | null;
      max_uses: number | null;
      use_count: number;
    }>(
      db,
      sql`SELECT revoked_at, expires_at, max_uses, use_count FROM public.lookup_team_invite_code(${code})`,
    );
    const row = rows[0];
    if (!row) return "not_found";
    if (row.revoked_at) return "revoked";
    if (row.expires_at) {
      const expiresAtMs =
        row.expires_at instanceof Date
          ? row.expires_at.getTime()
          : new Date(row.expires_at).getTime();
      if (expiresAtMs <= Date.now()) return "expired";
    }
    if (row.max_uses !== null && row.use_count >= row.max_uses) return "exhausted";
    return "unknown";
  } catch {
    return "unknown";
  }
}
