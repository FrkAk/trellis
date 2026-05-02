import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";
import { member } from "@/lib/db/auth-schema";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

/**
 * Onboarding page for teams (Better Auth organizations). When the caller
 * already has memberships, sets the earliest as active and bounces home.
 * Otherwise renders a form to create a team or accept an invitation by id.
 * If the bounce fails, render an inline error rather than redirecting to
 * `/`, which would loop back through `requireMembership`.
 *
 * @returns Server-rendered onboarding UI.
 */
export default async function OnboardingTeamPage() {
  const session = await requireSession();

  const [earliest] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt))
    .limit(1);

  if (earliest) {
    if (session.session.activeOrganizationId === earliest.organizationId) {
      redirect("/");
    }

    const reqHeaders = await headers();
    let activated = false;
    try {
      await auth.api.setActiveOrganization({
        body: { organizationId: earliest.organizationId },
        headers: reqHeaders,
      });
      activated = true;
    } catch (err) {
      console.error("setActiveOrganization on onboarding bounce failed", err);
    }

    if (activated) {
      redirect("/");
    }
    return <BounceFailedState />;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">
            Pick a team
          </h1>
          <p className="text-sm text-text-muted">
            Mymir is team-scoped. Create a team to start a fresh workspace, or
            paste the 21-character invite code your team admin shared.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}

/**
 * Error state shown when the onboarding bounce path could not activate the
 * caller's existing team. Refreshing retries the activation; if it keeps
 * failing the underlying error is in the server logs.
 */
function BounceFailedState() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">
            Could not activate your team
          </h1>
          <p className="text-sm text-text-muted">
            Something went wrong while switching to your team. Refresh to try
            again — if the problem persists, contact support.
          </p>
        </div>
        <a
          href="/onboarding/team"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-border-strong bg-transparent px-6 py-2 text-sm font-semibold text-text-primary shadow-[var(--shadow-button)] transition-opacity hover:opacity-60"
        >
          Refresh
        </a>
      </div>
    </div>
  );
}
