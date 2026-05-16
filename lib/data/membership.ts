import "server-only";
import { sql } from "drizzle-orm";
import { serviceRoleDb } from "@/lib/db";
import { executeRaw, uuidArray } from "@/lib/db/raw";
import { withUserContext, type Tx } from "@/lib/db/rls";
import { decodeCursor, encodeCursor, type Cursor } from "@/lib/data/cursor";
import { acquireOwnerDemoteLock } from "@/lib/db/raw/acquire-owner-demote-lock";
import {
  previewTeamCascade,
  type TeamCascadePreview,
} from "@/lib/db/raw/preview-team-cascade";

// app_user has no grants on neon_auth.*. Every helper in this file reads
// auth data via the `public.current_user_*` and `public.team_*_visible`
// SECURITY DEFINER functions, which read `app.user_id` from the GUC that
// `withUserContext` sets and scope rows accordingly.

/** Shape of a single membership row returned to the team-list UI. */
export type MembershipRow = {
  organizationId: string;
  name: string;
  slug: string;
  organizationCreatedAt: Date;
  membershipCreatedAt: Date;
  role: string;
};

/** Driver-shape of a row returned by `public.current_user_orgs()`. */
type CurrentUserOrgsRow = {
  org_id: string;
  name: string;
  slug: string;
  member_role: string;
  member_count: number;
  member_created_at: string | Date;
  org_created_at: string | Date;
};

/**
 * Fetch a page of teams the caller belongs to, with org metadata, member
 * role, and total member count. Sorted by
 * `(organization.createdAt DESC, organization.id DESC)`. The cursor's
 * `updatedAt` field encodes `organization.createdAt`.
 *
 * Implementation pulls the full membership list once via
 * `public.current_user_orgs()` and slices in JS. Typical users have <50
 * teams; the in-memory slice is cheaper than threading cursor params into
 * the SDF and pays one roundtrip instead of two.
 *
 * @param userId - Verified user id.
 * @param opts - Pagination options.
 * @returns Memberships, countByOrg map, and cursor for the next page.
 */
export async function listMembershipsWithCounts(
  userId: string,
  opts: { limit?: number; cursor?: Cursor | string | null } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const after = decodeCursor(opts.cursor);

  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<CurrentUserOrgsRow>(
      tx,
      sql`SELECT org_id, name, slug, member_role, member_count, member_created_at, org_created_at FROM public.current_user_orgs()`,
    ),
  );

  const ordered = rows
    .map((r) => ({
      organizationId: r.org_id,
      name: r.name,
      slug: r.slug,
      organizationCreatedAt: new Date(r.org_created_at),
      membershipCreatedAt: new Date(r.member_created_at),
      role: r.member_role,
      memberCount: Number(r.member_count),
    }))
    .sort((a, b) => {
      const t = b.organizationCreatedAt.getTime() - a.organizationCreatedAt.getTime();
      return t !== 0 ? t : a.organizationId < b.organizationId ? 1 : -1;
    });

  const filtered = after
    ? ordered.filter((r) => {
        const at = r.organizationCreatedAt.getTime();
        const af = after.updatedAt.getTime();
        if (at < af) return true;
        if (at > af) return false;
        return r.organizationId < after.id;
      })
    : ordered;

  const sliced = filtered.slice(0, limit + 1);
  const hasMore = sliced.length > limit;
  const trimmed = hasMore ? sliced.slice(0, limit) : sliced;
  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          updatedAt: last.organizationCreatedAt,
          id: last.organizationId,
        })
      : null;

  const memberships: MembershipRow[] = trimmed.map((r) => ({
    organizationId: r.organizationId,
    name: r.name,
    slug: r.slug,
    organizationCreatedAt: r.organizationCreatedAt,
    membershipCreatedAt: r.membershipCreatedAt,
    role: r.role,
  }));
  const countByOrg = new Map(trimmed.map((r) => [r.organizationId, r.memberCount]));
  return { memberships, countByOrg, nextCursor };
}

/**
 * Check whether a user belongs to at least one organization. Drives the
 * onboarding RSC's skip-create-form decision.
 *
 * @param userId - Verified user id.
 * @returns True when the user has at least one membership row.
 */
export async function userHasAnyMembership(userId: string): Promise<boolean> {
  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<{ current_user_has_any_membership: boolean }>(
      tx,
      sql`SELECT public.current_user_has_any_membership()`,
    ),
  );
  return rows[0]?.current_user_has_any_membership ?? false;
}

/** Member row returned to admin flows. `organizationId` lets the action layer
 * verify the row belongs to the targeted team. */
export type VisibleMember = {
  id: string;
  role: string;
  organizationId: string;
};

/**
 * Resolve a member row by id IF the caller shares an organization with
 * the member. Returns null on both "doesn't exist" and "cross-team" so
 * the action layer cannot distinguish them (anti-enumeration).
 *
 * @param userId - Verified user id of the caller.
 * @param memberId - UUID of the member row.
 * @returns The row when visible to the caller, null otherwise.
 */
export async function findMemberById(
  userId: string,
  memberId: string,
): Promise<VisibleMember | null> {
  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<{ id: string; role: string; organization_id: string }>(
      tx,
      sql`SELECT id, role, organization_id FROM public.current_user_visible_member(${memberId}::uuid)`,
    ),
  );
  const row = rows[0];
  return row
    ? { id: row.id, role: row.role, organizationId: row.organization_id }
    : null;
}

/**
 * Inside a transaction frame (already running under `withUserContext`),
 * fetch a single member row by id. Same scoping as {@link findMemberById}.
 *
 * @param tx - Active RLS transaction handle.
 * @param memberId - UUID of the member row.
 * @returns The row when visible to the caller, null otherwise.
 */
export async function findMemberByIdTx(
  tx: Tx,
  memberId: string,
): Promise<VisibleMember | null> {
  const rows = await executeRaw<{
    id: string;
    role: string;
    organization_id: string;
  }>(
    tx,
    sql`SELECT id, role, organization_id FROM public.current_user_visible_member(${memberId}::uuid)`,
  );
  const row = rows[0];
  return row
    ? { id: row.id, role: row.role, organizationId: row.organization_id }
    : null;
}

/**
 * Inside a transaction frame, fetch the roles of every member of an org
 * the caller can see. Returns an empty array when the caller is not a
 * member.
 *
 * @param tx - Active RLS transaction handle.
 * @param organizationId - UUID of the team.
 * @returns Roles of every visible member.
 */
export async function listMemberRolesTx(
  tx: Tx,
  organizationId: string,
): Promise<Array<{ role: string }>> {
  return executeRaw<{ role: string }>(
    tx,
    sql`SELECT role FROM public.team_member_roles_visible(${organizationId}::uuid)`,
  );
}

/**
 * Admin/system lookup: user ids of every member of an org, NOT scoped by
 * the caller's membership. Used by the better-auth `beforeDeleteOrganization`
 * hook which iterates every member to wipe OAuth artifacts AFTER the org
 * row is queued for deletion (so a user-scoped lookup would race the
 * cascade and miss the trailing edge).
 *
 * Routes through the SECURITY DEFINER `find_org_member_user_ids_as_admin`
 * which is EXECUTE-restricted to `service_role`. The JS data ring MUST
 * call this via `serviceRoleDb`.
 *
 * @param orgId - UUID of the organization.
 * @returns Array of user ids in the organization.
 */
export async function findOrgMemberUserIdsAsAdmin(
  orgId: string,
): Promise<string[]> {
  const rows = await executeRaw<{ user_id: string }>(
    serviceRoleDb,
    sql`SELECT user_id FROM public.find_org_member_user_ids_as_admin(${orgId}::uuid)`,
  );
  return rows.map((r) => r.user_id);
}

/**
 * Look up display names for a batch of user ids, scoped to users who
 * share at least one org with the caller. Non-shared users are silently
 * filtered out so callers cannot probe for user existence.
 *
 * @param userId - Verified caller user id.
 * @param userIds - Candidate user ids.
 * @returns Map of user id to display name (only for shared-org users).
 */
export async function lookupUserNames(
  userId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<{ id: string; name: string }>(
      tx,
      sql`SELECT id, name FROM public.lookup_user_names_in_shared_orgs(${uuidArray(userIds)})`,
    ),
  );
  return new Map(rows.map((u) => [u.id, u.name]));
}

/**
 * Read the caller's role string for a given organization.
 *
 * @param userId - Verified user id.
 * @param organizationId - UUID of the organization.
 * @returns Role string, or null when the caller has no membership.
 */
export async function findMemberRole(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<{ current_user_org_role: string | null }>(
      tx,
      sql`SELECT public.current_user_org_role(${organizationId}::uuid)`,
    ),
  );
  return rows[0]?.current_user_org_role ?? null;
}

/** Resolved team-scope returned by {@link findTeamMembership}. */
export type TeamMembershipRow = {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
  };
  memberRole: string;
};

/**
 * Membership-gated team lookup. Returns null when the team doesn't exist
 * or the caller is not a member of it.
 *
 * Implemented as a filter over `current_user_orgs()` so we get the org
 * row and the caller's role in a single round-trip. Typical users have
 * <50 memberships — the per-call cost is negligible.
 *
 * @param userId - Verified user id.
 * @param teamId - UUID of the team to authorize.
 * @returns Team-scope row or null.
 */
export async function findTeamMembership(
  userId: string,
  teamId: string,
): Promise<TeamMembershipRow | null> {
  const rows = await withUserContext(userId, async (tx) =>
    executeRaw<CurrentUserOrgsRow>(
      tx,
      sql`SELECT org_id, name, slug, member_role, member_count, member_created_at, org_created_at FROM public.current_user_orgs() WHERE org_id = ${teamId}::uuid`,
    ),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    organization: {
      id: row.org_id,
      name: row.name,
      slug: row.slug,
      createdAt: new Date(row.org_created_at),
    },
    memberRole: row.member_role,
  };
}

/** Outcome of a guarded member-demote attempt. */
export type DemoteOutcome =
  | { kind: "ok" }
  | { kind: "fail"; code: "not_found" | "forbidden" | "cannot_leave_only_owner" }
  | { kind: "callback_error"; err: unknown };

/**
 * Atomically demote (or otherwise change the role of) a member, holding
 * the per-org owner-demote advisory lock so concurrent demotes serialize.
 * The actual role change is performed by the supplied `demote` callback
 * — which lets actions thread Better Auth's `updateMemberRole` through
 * the lock without `lib/data/` taking a dep on `auth.api`.
 *
 * The callback runs inside the transaction window but on its own
 * connection (BA's adapter is autocommit), so it doesn't deadlock against
 * the lock — the lock simply serializes other actions waiting on the
 * same gate.
 *
 * @param userId - Verified caller user id (used to scope the visible
 *   member + roles lookups under RLS).
 * @param input - Target team, member id, and role change parameters.
 * @param demote - Callback that performs the actual role change.
 * @returns Outcome discriminating success, validation failures, and callback errors.
 */
export async function demoteMemberWithGuard(
  userId: string,
  input: {
    organizationId: string;
    memberId: string;
    role: "member" | "admin" | "owner";
    roleIncludesOwner: (role: string) => boolean;
  },
  demote: () => Promise<void>,
): Promise<DemoteOutcome> {
  return withUserContext(userId, async (tx) => {
    await acquireOwnerDemoteLock(tx, input.organizationId);

    const latest = await findMemberByIdTx(tx, input.memberId);
    if (!latest) return { kind: "fail", code: "not_found" };
    if (latest.organizationId !== input.organizationId) {
      return { kind: "fail", code: "forbidden" };
    }

    const targetIsOwner = input.roleIncludesOwner(latest.role);
    const newIsOwner = input.role === "owner";
    if (targetIsOwner && !newIsOwner) {
      const owners = await listMemberRolesTx(tx, latest.organizationId);
      const ownerCount = owners.filter((m) => input.roleIncludesOwner(m.role))
        .length;
      if (ownerCount <= 1) {
        return { kind: "fail", code: "cannot_leave_only_owner" };
      }
    }

    try {
      await demote();
      return { kind: "ok" };
    } catch (err) {
      return { kind: "callback_error", err };
    }
  });
}

/**
 * Snapshot the project + task counts that a team-delete cascade will
 * wipe. Wraps the public.* SQL in `withUserContext` so the RLS predicate
 * on `projects` / `tasks` evaluates the caller's GUC — non-members see
 * zero counts.
 *
 * @param userId - Verified caller user id.
 * @param organizationId - UUID of the team.
 * @returns Project and task counts (zero on non-member access).
 */
export async function previewTeamDelete(
  userId: string,
  organizationId: string,
): Promise<TeamCascadePreview> {
  return withUserContext(userId, async (tx) =>
    previewTeamCascade(tx, organizationId),
  );
}
