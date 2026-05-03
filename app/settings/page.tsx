import { redirect } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { getSession } from '@/lib/auth/session';
import { listOAuthSessionsAction } from '@/lib/actions/oauth-session';
import { listUserTeamsAction } from '@/lib/actions/team-list';
import { SettingsView } from './_components/SettingsView';

/** Force dynamic rendering — this page reads the session and DB. */
export const dynamic = 'force-dynamic';

/**
 * Settings page — three tabs (Profile / Devices / Teams) under the standard
 * page chrome. Renders even when the user has no active team so they can
 * recover by creating one without bouncing through `/onboarding/team`.
 *
 * @returns Server-rendered settings shell with hydrated initial data.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const [sessionsResult, teamsResult] = await Promise.all([
    listOAuthSessionsAction(),
    listUserTeamsAction(),
  ]);

  const initialSessions = sessionsResult.ok ? sessionsResult.data : [];
  const initialTeams = teamsResult.ok ? teamsResult.data : [];

  return (
    <>
      <TopBar />
      <PageShell>
        <header className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted">
            Manage your profile, devices, and teams.
          </p>
        </header>
        <SettingsView
          user={{
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            createdAt: session.user.createdAt,
          }}
          initialSessions={initialSessions}
          initialTeams={initialTeams}
        />
      </PageShell>
    </>
  );
}
