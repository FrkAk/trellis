"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";

/** Discriminated result type for onboarding-team server actions. */
export type OnboardResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "invalid_input" | "unknown"; message: string };

const TEAM_NAME_MAX = 64;
const SLUG_MAX = 32;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(TEAM_NAME_MAX),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(SLUG_MAX)
    .regex(SLUG_PATTERN, "Slug must be lowercase alphanumeric with optional hyphens"),
});

const acceptInvitationSchema = z.object({
  invitationId: z.uuid("Invitation id must be a UUID"),
});

/**
 * Create a new organization (team) and set it as the active org for the
 * current session. Used by the onboarding form when a user has no team.
 * @param input - Team name and slug from the form.
 * @returns Discriminated result; on success the action redirects to "/".
 */
export async function createTeam(input: {
  name: string;
  slug: string;
}): Promise<OnboardResult> {
  try {
    await requireSession();
  } catch {
    return {
      ok: false,
      code: "unauthorized",
      message: "You must be signed in to perform this action.",
    };
  }

  const parsed = createTeamSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const reqHeaders = await headers();
    const created = await auth.api.createOrganization({
      body: { name: parsed.data.name, slug: parsed.data.slug },
      headers: reqHeaders,
    });
    if (!created) {
      return { ok: false, code: "unknown", message: "Failed to create team." };
    }
    await auth.api.setActiveOrganization({
      body: { organizationId: created.id },
      headers: reqHeaders,
    });
  } catch (err) {
    console.error("createTeam failed", err);
    return {
      ok: false,
      code: "unknown",
      message:
        "Could not create team. Try a different slug, or refresh and retry.",
    };
  }

  redirect("/");
}

/**
 * Accept an invitation by id and set the joined organization as active.
 * Magic invite codes are out of scope here (MYMR-68).
 * @param input - Invitation UUID from the form.
 * @returns Discriminated result; on success the action redirects to "/".
 */
export async function acceptInvitation(input: {
  invitationId: string;
}): Promise<OnboardResult> {
  try {
    await requireSession();
  } catch {
    return {
      ok: false,
      code: "unauthorized",
      message: "You must be signed in to perform this action.",
    };
  }

  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const reqHeaders = await headers();
    const accepted = await auth.api.acceptInvitation({
      body: { invitationId: parsed.data.invitationId },
      headers: reqHeaders,
    });
    const organizationId =
      (accepted as { invitation?: { organizationId?: string } } | null | undefined)
        ?.invitation?.organizationId;
    if (organizationId) {
      await auth.api.setActiveOrganization({
        body: { organizationId },
        headers: reqHeaders,
      });
    }
  } catch (err) {
    console.error("acceptInvitation failed", err);
    return {
      ok: false,
      code: "unknown",
      message: "Could not accept invitation. Confirm the id and try again.",
    };
  }

  redirect("/");
}
