"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { member } from "@/lib/db/auth-schema";
import { getAuthContext, NoActiveTeamError } from "@/lib/auth/context";
import { requireSession } from "@/lib/auth/session";
import { clearOrgMembershipArtifacts } from "@/lib/auth/membership-cleanup";
import { isOrgAdmin, isOrgOwner } from "@/lib/auth/org-permissions";
import {
  mapBetterAuthError,
  parseOrFail,
  teamFail,
  type TeamActionResult,
} from "@/lib/actions/team-errors";
import {
  RESERVED_SLUGS,
  SLUG_MAX,
  SLUG_MIN,
  SLUG_PATTERN,
  TEAM_NAME_MAX,
} from "@/lib/team/slug-rules";

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(TEAM_NAME_MAX),
  slug: z
    .string()
    .trim()
    .min(SLUG_MIN)
    .max(SLUG_MAX)
    .regex(SLUG_PATTERN, "Slug must be lowercase alphanumeric with hyphens")
    .refine((s) => !RESERVED_SLUGS.has(s), {
      message: "That URL slug is reserved. Try a different one.",
    }),
});

/**
 * Lenient runtime guard for `auth.api.acceptInvitation`'s response. BA
 * doesn't export a stable result type for this endpoint, so we parse
 * the only field we actually consume. Mismatches surface as `unknown`
 * rather than throwing through the call site.
 */
const acceptInvitationResponseSchema = z.object({
  invitation: z.object({
    organizationId: z.uuid(),
  }),
});

const memberRoleSchema = z.enum(["member", "admin", "owner"]);
const uuidSchema = z.uuid();
const emailSchema = z.email();

const inviteMemberSchema = z.object({
  email: emailSchema,
  role: memberRoleSchema.optional(),
});

const removeMemberSchema = z.object({
  memberIdOrEmail: z.string().trim().min(1),
});

const updateMemberRoleSchema = z.object({
  memberId: uuidSchema,
  role: memberRoleSchema,
});

const leaveTeamSchema = z.object({
  organizationId: uuidSchema,
});

const acceptInvitationSchema = z.object({
  invitationId: uuidSchema,
});

const slugSchema = z
  .string()
  .trim()
  .min(SLUG_MIN)
  .max(SLUG_MAX)
  .regex(SLUG_PATTERN, "Slug must be lowercase alphanumeric with hyphens")
  .refine((s) => !RESERVED_SLUGS.has(s), {
    message: "That URL slug is reserved. Try a different one.",
  });

const updateTeamSchema = z
  .object({
    organizationId: uuidSchema,
    name: z.string().trim().min(1, "Team name is required").max(TEAM_NAME_MAX).optional(),
    slug: slugSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: "Provide at least one field to update",
  });

const deleteTeamSchema = z.object({
  organizationId: uuidSchema,
});

/**
 * Create a new organization (team) for the signed-in user and set it as
 * the active org for the session. The caller does NOT need an active team
 * already — this is the bootstrap path used by onboarding.
 *
 * @param input - `{ name, slug }` from the form.
 * @returns Discriminated result; `data.organizationId` on success.
 */
export async function createTeamAction(input: {
  name: string;
  slug: string;
}): Promise<TeamActionResult<{ organizationId: string }>> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(createTeamSchema, input);
  if (!parsed.ok) return parsed;

  try {
    const reqHeaders = await headers();
    const created = await auth.api.createOrganization({
      body: { name: parsed.data.name, slug: parsed.data.slug },
      headers: reqHeaders,
    });
    if (!created) return teamFail("unknown");
    await auth.api.setActiveOrganization({
      body: { organizationId: created.id },
      headers: reqHeaders,
    });
    return { ok: true, data: { organizationId: created.id } };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("createTeamAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Send an email invitation to join the caller's active team. Better Auth
 * enforces the recipient-email check at acceptance time; this action just
 * creates the invitation row and (in the future) hands it to a mailer.
 *
 * Defense-in-depth: an explicit `isOrgAdmin()` check runs first so the
 * action's authorization does not single-source from BA's specific
 * error code shape. BA also enforces `invitation:create` (admin+owner)
 * at the endpoint.
 *
 * @param input - Recipient email and optional role (defaults to `member`).
 * @returns Discriminated result.
 */
export async function inviteMemberAction(input: {
  email: string;
  role?: "member" | "admin" | "owner";
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(inviteMemberSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgAdmin())) return teamFail("forbidden");

  try {
    const reqHeaders = await headers();
    await auth.api.createInvitation({
      body: {
        email: parsed.data.email,
        role: parsed.data.role ?? "member",
      },
      headers: reqHeaders,
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("inviteMemberAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Remove a member from the caller's active team. Better Auth fires
 * `afterRemoveMember` which clears stale OAuth tokens and active-org
 * pointers via `clearOrgMembershipArtifacts` — see lib/auth.ts.
 *
 * Defense-in-depth: explicit `isOrgAdmin()` check runs first so the
 * action's authorization does not single-source from BA. BA scopes the
 * remove to the caller's `activeOrganizationId` and additionally
 * enforces `member:delete` (admin+owner) at the endpoint.
 *
 * @param input - `memberIdOrEmail` to remove.
 * @returns Discriminated result.
 */
export async function removeMemberAction(input: {
  memberIdOrEmail: string;
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(removeMemberSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgAdmin())) return teamFail("forbidden");

  try {
    const reqHeaders = await headers();
    await auth.api.removeMember({
      body: { memberIdOrEmail: parsed.data.memberIdOrEmail },
      headers: reqHeaders,
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("removeMemberAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Change a member's role within the caller's active team.
 *
 * Layered authorization:
 * 1. Explicit `isOrgAdmin()` check — defense-in-depth so authz doesn't
 *    single-source from BA's error code shape.
 * 2. Cross-team probe rejection — target's `member.organizationId` must
 *    match the caller's `ctx.activeOrgId`. Returns `forbidden` (404-shaped)
 *    so a probe cannot tell membership apart from non-existence.
 * 3. Last-owner guard — if target is the org's only owner and the new
 *    role is not owner, surface a typed `cannot_leave_only_owner`. BA's
 *    own check only fires on self-demote; this catches an
 *    owner-A-demotes-owner-B race where both reads see two owners.
 * 4. BA's `updateMemberRole` enforces `member:update` (admin+owner) at
 *    the endpoint plus its own creator-role/last-owner safeguards.
 *
 * `member.role` is comma-separated in BA — we split + `.includes('owner')`
 * to mirror BA's parsing (see `crud-members.mjs:255`).
 *
 * @param input - Target member id and new role.
 * @returns Discriminated result.
 */
export async function updateMemberRoleAction(input: {
  memberId: string;
  role: "member" | "admin" | "owner";
}): Promise<TeamActionResult> {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) return teamFail("no_active_team");
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(updateMemberRoleSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgAdmin(ctx.activeOrgId))) return teamFail("forbidden");

  const [target] = await db
    .select({
      id: member.id,
      role: member.role,
      organizationId: member.organizationId,
    })
    .from(member)
    .where(eq(member.id, parsed.data.memberId))
    .limit(1);
  if (!target) return teamFail("not_found");
  if (target.organizationId !== ctx.activeOrgId) return teamFail("forbidden");

  const targetIsOwner = target.role.split(",").includes("owner");
  const newIsOwner = parsed.data.role === "owner";
  if (targetIsOwner && !newIsOwner) {
    const owners = await db
      .select({ role: member.role })
      .from(member)
      .where(eq(member.organizationId, target.organizationId));
    const ownerCount = owners.filter((m) =>
      m.role.split(",").includes("owner"),
    ).length;
    if (ownerCount <= 1) return teamFail("cannot_leave_only_owner");
  }

  try {
    const reqHeaders = await headers();
    await auth.api.updateMemberRole({
      body: { memberId: parsed.data.memberId, role: parsed.data.role },
      headers: reqHeaders,
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("updateMemberRoleAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Leave the named organization. Better Auth's `leaveOrganization` does NOT
 * fire `afterRemoveMember`, so we call `clearOrgMembershipArtifacts` here
 * directly to wipe OAuth tokens and other-session active-org pointers.
 *
 * @param input - Organization id to leave.
 * @returns Discriminated result.
 */
export async function leaveTeamAction(input: {
  organizationId: string;
}): Promise<TeamActionResult> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return teamFail("unauthorized");
  }

  const parsed = parseOrFail(leaveTeamSchema, input);
  if (!parsed.ok) return parsed;

  try {
    const reqHeaders = await headers();
    await auth.api.leaveOrganization({
      body: { organizationId: parsed.data.organizationId },
      headers: reqHeaders,
    });
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("leaveTeamAction failed", err);
    }
    return teamFail(code);
  }

  // Cleanup is best-effort. The user is already out of the org;
  // surfacing a 500 here would be confusing and offer no recovery
  // path. Stale OAuth tokens linger until cron / next prune.
  try {
    await clearOrgMembershipArtifacts(userId, parsed.data.organizationId);
  } catch (err) {
    console.error("leaveTeamAction cleanup failed", {
      err,
      userId,
      orgId: parsed.data.organizationId,
    });
  }
  return { ok: true };
}

/**
 * Accept an emailed invitation by id. Better Auth enforces that the
 * session user's email matches `invitation.email` — wrong-recipient maps
 * to the typed `wrong_recipient` failure code.
 *
 * @param input - Invitation UUID.
 * @returns Discriminated result; `data.organizationId` on success.
 */
export async function acceptEmailInvitationAction(input: {
  invitationId: string;
}): Promise<TeamActionResult<{ organizationId: string }>> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(acceptInvitationSchema, input);
  if (!parsed.ok) return parsed;

  try {
    const reqHeaders = await headers();
    const accepted = await auth.api.acceptInvitation({
      body: { invitationId: parsed.data.invitationId },
      headers: reqHeaders,
    });
    const shape = acceptInvitationResponseSchema.safeParse(accepted);
    if (!shape.success) {
      console.error("acceptEmailInvitationAction unexpected response shape", {
        accepted,
        issues: shape.error.issues,
      });
      return teamFail("unknown");
    }
    const { organizationId } = shape.data.invitation;
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: reqHeaders,
    });
    return { ok: true, data: { organizationId } };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("acceptEmailInvitationAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Rename a team. BA enforces `organization:update` (admin + owner) at the
 * endpoint; we surface BA's authz rejection as a typed `forbidden` via
 * `mapBetterAuthError`. Either `name` or `slug` (or both) may be provided —
 * the schema rejects an empty payload before we hit BA.
 *
 * Defense-in-depth: explicit `isOrgAdmin(organizationId)` check runs
 * first, scoped to the supplied target team rather than the caller's
 * session active org. A regular member or non-member of the target team
 * surfaces a typed `forbidden` before any BA call.
 *
 * @param input - `{ organizationId, name?, slug? }`.
 * @returns Discriminated result.
 */
export async function updateTeamAction(input: {
  organizationId: string;
  name?: string;
  slug?: string;
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(updateTeamSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgAdmin(parsed.data.organizationId))) return teamFail("forbidden");

  const data: { name?: string; slug?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;

  try {
    await auth.api.updateOrganization({
      body: { data, organizationId: parsed.data.organizationId },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("updateTeamAction failed", err);
    }
    return teamFail(code);
  }
}

/**
 * Delete a team and cascade every dependent resource. Owner-only — we
 * gate explicitly via `isOrgOwner()` BEFORE calling BA so admins get a
 * predictable `forbidden` failure (BA also rejects, but the upstream
 * check avoids depending on BA's specific error code shape for this
 * destructive action).
 *
 * Side effects (already wired upstream — no work here):
 * - `beforeDeleteOrganization` hook in `lib/auth.ts` clears OAuth
 *   artifacts for every member.
 * - FK `ON DELETE CASCADE` wipes projects → tasks → task_edges,
 *   invitations, team_invite_code, and member rows.
 * - User accounts are NOT cascaded — members keep their accounts.
 *
 * @param input - `{ organizationId }` to delete.
 * @returns Discriminated result.
 */
export async function deleteTeamAction(input: {
  organizationId: string;
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(deleteTeamSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgOwner(parsed.data.organizationId))) return teamFail("forbidden");

  try {
    await auth.api.deleteOrganization({
      body: { organizationId: parsed.data.organizationId },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === "unknown") {
      console.error("deleteTeamAction failed", err);
    }
    return teamFail(code);
  }
}

/** Cascade preview shown in the delete-team confirm dialog. */
export type TeamDeletePreview = {
  /** Number of projects that will be removed. */
  projectCount: number;
  /** Number of tasks across those projects. */
  taskCount: number;
};

/**
 * Count the rows that the delete-team cascade will wipe. Surfaces in
 * the confirm dialog so the user understands the blast radius before
 * typing the team name. Owner-only — same gate as `deleteTeamAction`
 * since the count itself can leak organization size.
 *
 * @param input - `{ organizationId }` to preview.
 * @returns Discriminated result; `data` is `{ projectCount, taskCount }`.
 */
export async function previewTeamDeleteAction(input: {
  organizationId: string;
}): Promise<TeamActionResult<TeamDeletePreview>> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(deleteTeamSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgOwner(parsed.data.organizationId))) return teamFail("forbidden");

  try {
    const [projectsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.organizationId, parsed.data.organizationId));
    const [tasksRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(projects.organizationId, parsed.data.organizationId));
    return {
      ok: true,
      data: {
        projectCount: projectsRow?.count ?? 0,
        taskCount: tasksRow?.count ?? 0,
      },
    };
  } catch (err) {
    console.error("previewTeamDeleteAction failed", err);
    return teamFail("unknown");
  }
}
