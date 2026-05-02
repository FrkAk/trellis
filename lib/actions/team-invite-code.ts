"use server";

import { headers } from "next/headers";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teamInviteCodes } from "@/lib/db/team-schema";
import { requireSession } from "@/lib/auth/session";
import { getAuthContext, NoActiveTeamError } from "@/lib/auth/context";
import { isOrgAdmin } from "@/lib/auth/org-permissions";
import { generateInviteCode, INVITE_CODE_PATTERN } from "@/lib/auth/invite-code";
import { mapBetterAuthError } from "@/lib/actions/team-errors";

/** Public-facing metadata for a team invite code. Hides internal fields. */
export type InviteCodeMetadata = {
  code: string;
  defaultRole: "member" | "admin";
  expiresAt: Date | null;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
  createdAt: Date;
};

type InviteCodeFailureCode =
  | "unauthorized"
  | "no_active_team"
  | "forbidden"
  | "not_found"
  | "unknown";

export type InviteCodeResult =
  | { ok: true; data: InviteCodeMetadata }
  | { ok: false; code: InviteCodeFailureCode; message: string };

type JoinFailureCode =
  | "unauthorized"
  | "invalid_code"
  | "already_member"
  | "membership_limit_reached"
  | "unknown";

export type JoinByCodeResult =
  | { ok: true; data: { organizationId: string } }
  | { ok: false; code: JoinFailureCode; message: string };

/**
 * Single error message for every "this code can't be used" failure mode.
 * Anti-enumeration: an attacker brute-forcing codes cannot tell from the
 * response whether the code never existed, was revoked, expired, or hit
 * its use limit. The structured cause is logged server-side only.
 */
const GENERIC_INVALID_CODE_MSG =
  "That invite code isn't valid. Ask the team admin for a fresh one.";

const ALREADY_MEMBER_MSG = "You're already a member of this team.";

const MEMBERSHIP_LIMIT_MSG =
  "This team has reached its member limit. Contact the owner.";

const UNAUTHORIZED_MSG = "You must be signed in to perform this action.";
const NO_ACTIVE_TEAM_MSG =
  "Pick a team before continuing — visit /onboarding/team to create or join one.";
const FORBIDDEN_MSG = "Only team admins can manage invite codes.";
const NOT_FOUND_MSG = "No invite code exists for this team yet.";
const UNKNOWN_MSG = "Something went wrong. Please try again.";

const joinSchema = z.object({
  code: z.string().trim().regex(INVITE_CODE_PATTERN),
});

/**
 * Resolve auth context for an admin-only invite-code action. Mapping:
 * not signed in → unauthorized, no active team → no_active_team,
 * not an admin → forbidden.
 */
async function resolveAdminContext(): Promise<
  | { ok: true; ctx: Awaited<ReturnType<typeof getAuthContext>> }
  | { ok: false; code: "unauthorized" | "no_active_team" | "forbidden"; message: string }
> {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) {
      return { ok: false, code: "no_active_team", message: NO_ACTIVE_TEAM_MSG };
    }
    return { ok: false, code: "unauthorized", message: UNAUTHORIZED_MSG };
  }
  if (!(await isOrgAdmin(ctx))) {
    return { ok: false, code: "forbidden", message: FORBIDDEN_MSG };
  }
  return { ok: true, ctx };
}

/** Project a row to the public metadata shape. */
function toMetadata(row: typeof teamInviteCodes.$inferSelect): InviteCodeMetadata {
  return {
    code: row.code,
    defaultRole: row.defaultRole,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    maxUses: row.maxUses,
    useCount: row.useCount,
    createdAt: row.createdAt,
  };
}

/**
 * Return the active team's invite code, lazily creating one if missing.
 * The first admin to open the team-settings panel triggers creation; this
 * is intentional, since v1 is one-code-per-team and we'd rather generate
 * codes on demand than seed every existing org up-front.
 *
 * @returns Code metadata or a typed failure.
 */
export async function getOrCreateTeamInviteCodeAction(): Promise<InviteCodeResult> {
  const authResult = await resolveAdminContext();
  if (!authResult.ok) return authResult;
  const { activeOrgId, userId } = authResult.ctx;

  const [existing] = await db
    .select()
    .from(teamInviteCodes)
    .where(eq(teamInviteCodes.organizationId, activeOrgId))
    .limit(1);
  if (existing) return { ok: true, data: toMetadata(existing) };

  try {
    const [created] = await db
      .insert(teamInviteCodes)
      .values({
        organizationId: activeOrgId,
        code: generateInviteCode(),
        createdBy: userId,
      })
      .returning();
    return { ok: true, data: toMetadata(created) };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "23505") {
      const [row] = await db
        .select()
        .from(teamInviteCodes)
        .where(eq(teamInviteCodes.organizationId, activeOrgId))
        .limit(1);
      if (row) return { ok: true, data: toMetadata(row) };
    }
    console.error("getOrCreateTeamInviteCodeAction failed", err);
    return { ok: false, code: "unknown", message: UNKNOWN_MSG };
  }
}

/**
 * Rotate the active team's invite code. Replaces the value, resets
 * `use_count` to 0, and clears any `revoked_at`. Old codes stop working
 * immediately because lookups are by `code` (UNIQUE).
 *
 * @returns Updated metadata or a typed failure.
 */
export async function regenerateTeamInviteCodeAction(): Promise<InviteCodeResult> {
  const authResult = await resolveAdminContext();
  if (!authResult.ok) return authResult;
  const { activeOrgId, userId } = authResult.ctx;

  const newCode = generateInviteCode();
  const [updated] = await db
    .update(teamInviteCodes)
    .set({
      code: newCode,
      useCount: 0,
      revokedAt: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(teamInviteCodes.organizationId, activeOrgId))
    .returning();
  if (updated) return { ok: true, data: toMetadata(updated) };

  try {
    const [created] = await db
      .insert(teamInviteCodes)
      .values({
        organizationId: activeOrgId,
        code: newCode,
        createdBy: userId,
      })
      .returning();
    return { ok: true, data: toMetadata(created) };
  } catch (err) {
    console.error("regenerateTeamInviteCodeAction failed", err);
    return { ok: false, code: "unknown", message: UNKNOWN_MSG };
  }
}

/**
 * Mark the active team's invite code as revoked. Subsequent join-by-code
 * attempts fail (anti-enumeration: same generic error as missing/expired).
 * `regenerateTeamInviteCodeAction` clears `revoked_at` if the admin later
 * wants to issue a fresh code.
 *
 * @returns Updated metadata or a typed failure.
 */
export async function revokeTeamInviteCodeAction(): Promise<InviteCodeResult> {
  const authResult = await resolveAdminContext();
  if (!authResult.ok) return authResult;
  const { activeOrgId } = authResult.ctx;

  const [updated] = await db
    .update(teamInviteCodes)
    .set({ revokedAt: sql`NOW()`, updatedAt: sql`NOW()` })
    .where(eq(teamInviteCodes.organizationId, activeOrgId))
    .returning();
  if (!updated) {
    return { ok: false, code: "not_found", message: NOT_FOUND_MSG };
  }
  return { ok: true, data: toMetadata(updated) };
}

/**
 * Best-effort lookup for ops triage when an invite code is rejected. The
 * cause is logged but NEVER returned to the user — anti-enumeration.
 */
async function diagnoseInvalidCode(
  code: string,
): Promise<"not_found" | "revoked" | "expired" | "exhausted" | "unknown"> {
  try {
    const [row] = await db
      .select({
        revokedAt: teamInviteCodes.revokedAt,
        expiresAt: teamInviteCodes.expiresAt,
        maxUses: teamInviteCodes.maxUses,
        useCount: teamInviteCodes.useCount,
      })
      .from(teamInviteCodes)
      .where(eq(teamInviteCodes.code, code))
      .limit(1);
    if (!row) return "not_found";
    if (row.revokedAt) return "revoked";
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return "expired";
    if (row.maxUses !== null && row.useCount >= row.maxUses) return "exhausted";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Redeem an invite code: add the caller as a member of the target team
 * and switch their active org. Atomic UPDATE-RETURNING reserves the slot
 * (use_count++) inline with the validity guards (revoked / expired /
 * max_uses), so two concurrent redemptions of a `maxUses=1` code can't
 * both succeed. On post-reservation failure (e.g. addMember rejects with
 * already_member), we run a compensating decrement.
 *
 * @param input - `{ code }` from the join form. Must match `INVITE_CODE_PATTERN`.
 * @returns Discriminated result; `data.organizationId` on success.
 */
export async function joinTeamByCodeAction(input: {
  code: string;
}): Promise<JoinByCodeResult> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return { ok: false, code: "unauthorized", message: UNAUTHORIZED_MSG };
  }

  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_code",
      message: GENERIC_INVALID_CODE_MSG,
    };
  }
  const { code } = parsed.data;

  const [reserved] = await db
    .update(teamInviteCodes)
    .set({
      useCount: sql`${teamInviteCodes.useCount} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(teamInviteCodes.code, code),
        isNull(teamInviteCodes.revokedAt),
        or(
          isNull(teamInviteCodes.expiresAt),
          gt(teamInviteCodes.expiresAt, sql`NOW()`),
        ),
        or(
          isNull(teamInviteCodes.maxUses),
          lt(teamInviteCodes.useCount, teamInviteCodes.maxUses),
        ),
      ),
    )
    .returning({
      id: teamInviteCodes.id,
      orgId: teamInviteCodes.organizationId,
      defaultRole: teamInviteCodes.defaultRole,
    });

  if (!reserved) {
    const cause = await diagnoseInvalidCode(code);
    console.warn("joinTeamByCode rejected", { cause });
    return {
      ok: false,
      code: "invalid_code",
      message: GENERIC_INVALID_CODE_MSG,
    };
  }

  try {
    const reqHeaders = await headers();
    await auth.api.addMember({
      body: {
        userId,
        organizationId: reserved.orgId,
        role: reserved.defaultRole,
      },
      headers: reqHeaders,
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: reserved.orgId },
      headers: reqHeaders,
    });
    return { ok: true, data: { organizationId: reserved.orgId } };
  } catch (err) {
    await db
      .update(teamInviteCodes)
      .set({
        useCount: sql`GREATEST(${teamInviteCodes.useCount} - 1, 0)`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(teamInviteCodes.id, reserved.id));

    const mapped = mapBetterAuthError(err);
    if (mapped === "already_member") {
      return { ok: false, code: "already_member", message: ALREADY_MEMBER_MSG };
    }
    if (mapped === "membership_limit_reached") {
      return {
        ok: false,
        code: "membership_limit_reached",
        message: MEMBERSHIP_LIMIT_MSG,
      };
    }
    console.error("joinTeamByCodeAction addMember failed", {
      err,
      orgId: reserved.orgId,
    });
    return { ok: false, code: "unknown", message: UNKNOWN_MSG };
  }
}
