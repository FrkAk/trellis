"use server";

import { headers } from "next/headers";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";
import { clearOrgMembershipArtifacts } from "@/lib/auth/membership-cleanup";
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
 * @param input - Target member id and new role.
 * @returns Discriminated result.
 */
export async function updateMemberRoleAction(input: {
  memberId: string;
  role: "member" | "admin" | "owner";
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail("unauthorized");
  }
  const parsed = parseOrFail(updateMemberRoleSchema, input);
  if (!parsed.ok) return parsed;

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
