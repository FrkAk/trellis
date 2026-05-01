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
    if (session.session.activeOrganizationId !== earliest.organizationId) {
      const reqHeaders = await headers();
      try {
        await auth.api.setActiveOrganization({
          body: { organizationId: earliest.organizationId },
          headers: reqHeaders,
        });
      } catch (err) {
        console.error("setActiveOrganization on onboarding bounce failed", err);
      }
    }
    redirect("/");
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Pick a team
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Mymir is team-scoped. Create a team to start a fresh workspace, or
            paste an invitation id from someone who shared theirs with you.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
