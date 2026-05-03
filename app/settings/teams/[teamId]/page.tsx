import { notFound, redirect } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { getSession } from '@/lib/auth/session';
import { getAuthContext, NoActiveTeamError } from '@/lib/auth/context';
import { requireTeamMembership } from '@/lib/auth/membership';
import { ForbiddenError } from '@/lib/auth/authorization';
import { listTeamMembersAction } from '@/lib/actions/team-members';
import { listPendingInvitationsAction } from '@/lib/actions/team-invitations';
import { getOrCreateTeamInviteCodeAction } from '@/lib/actions/team-invite-code';
import { TeamSettingsView } from './_components/TeamSettingsView';

interface TeamSettingsPageProps {
  /** Route params — `[teamId]` resolves to the target team's UUID. */
  params: Promise<{ teamId: string }>;
}

/** Force dynamic rendering — every load reads session and DB state. */
export const dynamic = 'force-dynamic';

/**
 * Per-team admin drill-in. Resolves the session, asserts team membership
 * via a single JOIN (anti-enumeration: non-members get `notFound()`), then
 * conditionally fetches admin-only data based on role.
 *
 * @param props - Route params containing `teamId`.
 * @returns Server-rendered settings shell hydrated with role-gated data.
 */
export default async function TeamSettingsPage({ params }: TeamSettingsPageProps) {
  const { teamId } = await params;

  const session = await getSession();
  if (!session) redirect('/sign-in');

  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) redirect('/onboarding/team');
    throw err;
  }

  let membership: Awaited<ReturnType<typeof requireTeamMembership>>;
  try {
    membership = await requireTeamMembership(teamId, ctx);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }

  const isAdminOrOwner =
    membership.memberRole === 'owner' || membership.memberRole === 'admin';
  const isOwner = membership.memberRole === 'owner';
  const isActive = session.session.activeOrganizationId === teamId;

  const [membersResult, invitationsResult, inviteCodeResult] = await Promise.all([
    listTeamMembersAction({ organizationId: teamId }),
    isAdminOrOwner && isActive ? listPendingInvitationsAction() : Promise.resolve(null),
    isAdminOrOwner && isActive
      ? getOrCreateTeamInviteCodeAction()
      : Promise.resolve(null),
  ]);

  return (
    <>
      <TopBar />
      <PageShell>
        <TeamSettingsView
          team={membership.organization}
          memberRole={membership.memberRole}
          isAdminOrOwner={isAdminOrOwner}
          isOwner={isOwner}
          currentUserId={session.user.id}
          isActive={isActive}
          initialMembers={membersResult.ok ? membersResult.data : []}
          initialInvitations={
            invitationsResult && invitationsResult.ok ? invitationsResult.data : []
          }
          initialInviteCode={
            inviteCodeResult && inviteCodeResult.ok ? inviteCodeResult.data : null
          }
        />
      </PageShell>
    </>
  );
}
