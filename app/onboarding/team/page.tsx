import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { member } from "@/lib/db/auth-schema";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

/**
 * Onboarding page for teams (Better Auth organizations). When the caller
 * already belongs to any team, redirect home — the workspace spans every
 * team they're a member of, so there is nothing to "activate". Otherwise
 * render a form to create a team or accept an invitation by code.
 *
 * @returns Server-rendered onboarding UI.
 */
export default async function OnboardingTeamPage() {
  const session = await requireSession();

  const [any] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1);

  if (any) redirect("/");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">
            Pick a team
          </h1>
          <p className="text-sm text-text-muted">
            mymir is team-scoped. Create a team to start a fresh workspace, or
            paste the 21-character invite code your team admin shared.
          </p>
        </div>
        <OnboardingForm userName={session.user.name} />
      </div>
    </div>
  );
}
