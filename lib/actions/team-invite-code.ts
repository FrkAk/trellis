"use server";

import { headers } from "next/headers";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teamInviteCodes } from "@/lib/db/team-schema";
import { requireSession } from "@/lib/auth/session";
import { isOrgAdmin } from "@/lib/auth/org-permissions";
import { generateInviteCode, INVITE_CODE_PATTERN } from "@/lib/auth/invite-code";
import {
  mapBetterAuthError,
  TEAM_ACTION_MESSAGES,
} from "@/lib/actions/team-errors";
import { checkActionRateLimit } from "@/lib/actions/rate-limit-action";

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
  | "forbidden"
  | "invalid_input"
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
  | "rate_limited"
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

const FORBIDDEN_MSG = "Only team admins can manage invite codes.";
const NOT_FOUND_MSG = "No invite code exists for this team yet.";

/**
 * Rate-limit policy for `joinTeamByCodeAction`. Defense in depth on top
 * of the 126-bit code entropy: throttles brute-force enumeration, and
 * caps the cost of an attacker who somehow learns a single code.
 *
 * Bucket sizing: a legitimate user redeems once; 5/min/user covers
 * typo-then-retry. 20/min/IP covers small office NATs without rejecting
 * unrelated callers behind the same egress.
 */
const JOIN_RATE_LIMIT = {
  action: "joinTeamByCode",
  windowSeconds: 60,
  perUserMax: 5,
  perIpMax: 20,
} as const;

const joinSchema = z.object({
  code: z.string().trim().regex(INVITE_CODE_PATTERN),
});

const orgInputSchema = z.object({
  organizationId: z.uuid(),
});

/**
 * Resolve auth + admin authorization for an invite-code action against
 * a target team. The target org is supplied by the caller so admins of
 * team T can rotate / revoke T's code while their session is active on
 * a different team U.
 *
 * Mapping: not signed in → unauthorized, not an admin of `organizationId`
 * → forbidden (covers both "regular member" and "non-member" without
 * leaking which one).
 *
 * @param organizationId - Target team UUID (already shape-validated).
 * @returns The signed-in caller's `userId` on success, or a typed failure.
 */
async function resolveAdminContext(
  organizationId: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; code: "unauthorized" | "forbidden"; message: string }
> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return {
      ok: false,
      code: "unauthorized",
      message: TEAM_ACTION_MESSAGES.unauthorized,
    };
  }
  if (!(await isOrgAdmin(organizationId))) {
    return { ok: false, code: "forbidden", message: FORBIDDEN_MSG };
  }
  return { ok: true, userId };
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
 * Return the supplied team's invite code, lazily creating one if missing.
 * The first admin to open the team-settings panel triggers creation; this
 * is intentional, since v1 is one-code-per-team and we'd rather generate
 * codes on demand than seed every existing org up-front.
 *
 * Target-scoped: callers pass `{ organizationId }` so an admin of team
 * T can manage T's code while their session is active on team U.
 *
 * @param input - `{ organizationId }` of the team whose code to load.
 * @returns Code metadata or a typed failure.
 */
export async function getOrCreateTeamInviteCodeAction(input: {
  organizationId: string;
}): Promise<InviteCodeResult> {
  const parsed = orgInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? TEAM_ACTION_MESSAGES.invalid_input,
    };
  }
  const orgId = parsed.data.organizationId;

  const authResult = await resolveAdminContext(orgId);
  if (!authResult.ok) return authResult;
  const { userId } = authResult;

  const [existing] = await db
    .select()
    .from(teamInviteCodes)
    .where(eq(teamInviteCodes.organizationId, orgId))
    .limit(1);
  if (existing) return { ok: true, data: toMetadata(existing) };

  try {
    const [created] = await db
      .insert(teamInviteCodes)
      .values({
        organizationId: orgId,
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
        .where(eq(teamInviteCodes.organizationId, orgId))
        .limit(1);
      if (row) return { ok: true, data: toMetadata(row) };
    }
    console.error("getOrCreateTeamInviteCodeAction failed", err);
    return {
      ok: false,
      code: "unknown",
      message: TEAM_ACTION_MESSAGES.unknown,
    };
  }
}

/**
 * Rotate the supplied team's invite code. Replaces the value, resets
 * `use_count` to 0, and clears any `revoked_at`. Old codes stop working
 * immediately because lookups are by `code` (UNIQUE).
 *
 * @param input - `{ organizationId }` of the team whose code to rotate.
 * @returns Updated metadata or a typed failure.
 */
export async function regenerateTeamInviteCodeAction(input: {
  organizationId: string;
}): Promise<InviteCodeResult> {
  const parsed = orgInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? TEAM_ACTION_MESSAGES.invalid_input,
    };
  }
  const orgId = parsed.data.organizationId;

  const authResult = await resolveAdminContext(orgId);
  if (!authResult.ok) return authResult;
  const { userId } = authResult;

  const [updated] = await db
    .update(teamInviteCodes)
    .set({
      code: generateInviteCode(),
      useCount: 0,
      revokedAt: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(teamInviteCodes.organizationId, orgId))
    .returning();
  if (updated) return { ok: true, data: toMetadata(updated) };

  try {
    const [created] = await db
      .insert(teamInviteCodes)
      .values({
        organizationId: orgId,
        code: generateInviteCode(),
        createdBy: userId,
      })
      .returning();
    return { ok: true, data: toMetadata(created) };
  } catch (err) {
    // 23505 here is almost always the org_id UNIQUE — a concurrent
    // first-rotate just landed a row. Retry as UPDATE with a freshly
    // generated code so a (vanishingly rare) code collision can't loop.
    if ((err as { code?: string } | null)?.code === "23505") {
      const [retried] = await db
        .update(teamInviteCodes)
        .set({
          code: generateInviteCode(),
          useCount: 0,
          revokedAt: null,
          updatedAt: sql`NOW()`,
        })
        .where(eq(teamInviteCodes.organizationId, orgId))
        .returning();
      if (retried) return { ok: true, data: toMetadata(retried) };
    }
    console.error("regenerateTeamInviteCodeAction failed", err);
    return {
      ok: false,
      code: "unknown",
      message: TEAM_ACTION_MESSAGES.unknown,
    };
  }
}

/**
 * Mark the supplied team's invite code as revoked. Subsequent join-by-code
 * attempts fail (anti-enumeration: same generic error as missing/expired).
 * `regenerateTeamInviteCodeAction` clears `revoked_at` if the admin later
 * wants to issue a fresh code.
 *
 * @param input - `{ organizationId }` of the team whose code to revoke.
 * @returns Updated metadata or a typed failure.
 */
export async function revokeTeamInviteCodeAction(input: {
  organizationId: string;
}): Promise<InviteCodeResult> {
  const parsed = orgInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? TEAM_ACTION_MESSAGES.invalid_input,
    };
  }
  const orgId = parsed.data.organizationId;

  const authResult = await resolveAdminContext(orgId);
  if (!authResult.ok) return authResult;

  const [updated] = await db
    .update(teamInviteCodes)
    .set({ revokedAt: sql`NOW()`, updatedAt: sql`NOW()` })
    .where(eq(teamInviteCodes.organizationId, orgId))
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
 * both succeed.
 *
 * Saga shape: only `addMember` rejection compensates — once membership
 * exists the slot is permanently consumed, so a `setActiveOrganization`
 * failure is logged and the redemption returns success (the next
 * request lands the user on onboarding to pick the active team).
 *
 * Rate-limited per-user (5/min) AND per-IP (20/min) as defense in depth
 * on top of the 126-bit code entropy.
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
    return {
      ok: false,
      code: "unauthorized",
      message: TEAM_ACTION_MESSAGES.unauthorized,
    };
  }

  // Rate-limit before schema parse on purpose: malformed input still
  // costs a slot so brute-force enumeration can't dodge the limiter by
  // sending shape-violating payloads.
  const limit = await checkActionRateLimit(JOIN_RATE_LIMIT, userId);
  if (!limit.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: TEAM_ACTION_MESSAGES.rate_limited,
    };
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
    // Fire-and-forget: keeping the diagnostic SELECT off the response
    // path prevents its latency from leaking whether the code matched a
    // row (timing side-channel on top of anti-enumeration).
    void diagnoseInvalidCode(code).then(
      (cause) => console.warn("joinTeamByCode rejected", { cause }),
      (err) =>
        console.warn("joinTeamByCode rejected (diagnose failed)", { err }),
    );
    return {
      ok: false,
      code: "invalid_code",
      message: GENERIC_INVALID_CODE_MSG,
    };
  }

  const reqHeaders = await headers();

  try {
    await auth.api.addMember({
      body: {
        userId,
        organizationId: reserved.orgId,
        role: reserved.defaultRole,
      },
      headers: reqHeaders,
    });
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
      return {
        ok: false,
        code: "already_member",
        message: TEAM_ACTION_MESSAGES.already_member,
      };
    }
    if (mapped === "membership_limit_reached") {
      return {
        ok: false,
        code: "membership_limit_reached",
        message: TEAM_ACTION_MESSAGES.membership_limit_reached,
      };
    }
    console.error("joinTeamByCodeAction addMember failed", {
      err,
      orgId: reserved.orgId,
    });
    return {
      ok: false,
      code: "unknown",
      message: TEAM_ACTION_MESSAGES.unknown,
    };
  }

  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: reserved.orgId },
      headers: reqHeaders,
    });
  } catch (err) {
    console.error(
      "joinTeamByCodeAction setActiveOrganization failed (membership succeeded)",
      { err, orgId: reserved.orgId, userId },
    );
  }

  return { ok: true, data: { organizationId: reserved.orgId } };
}
