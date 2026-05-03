'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { TabSwitcher } from '@/components/shared/TabSwitcher';
import type { OAuthSessionView } from '@/lib/actions/oauth-session';
import type { TeamView } from '@/lib/actions/team-list';
import { ProfileTab } from './ProfileTab';
import { DevicesTab } from './DevicesTab';
import { TeamsTab } from './TeamsTab';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'devices', label: 'Devices' },
  { id: 'teams', label: 'Teams' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TAB_IDS: ReadonlySet<TabId> = new Set(TABS.map((t) => t.id));

/** Coerce a search-param string into one of the known tab ids. */
function resolveTab(raw: string | null): TabId {
  if (raw && (TAB_IDS as Set<string>).has(raw)) return raw as TabId;
  return 'profile';
}

interface SettingsViewProps {
  /** Signed-in user's identity slice — name, email, createdAt for display. */
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date | string;
  };
  /** Initial OAuth device sessions, fetched server-side. */
  initialSessions: OAuthSessionView[];
  /** Initial team memberships, fetched server-side. */
  initialTeams: TeamView[];
}

/**
 * Client shell for the settings page. URL-syncs the active tab via
 * `?tab=profile|devices|teams` so deep links and refresh both work.
 *
 * @param props - Hydrated server data + identity slice.
 * @returns Tab switcher with animated content swap.
 */
export function SettingsView({
  user,
  initialSessions,
  initialTeams,
}: SettingsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));

  const handleTabChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'profile') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <TabSwitcher
        tabs={[...TABS]}
        activeTab={tab}
        onTabChange={handleTabChange}
        className="w-fit"
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {tab === 'profile' && <ProfileTab user={user} />}
          {tab === 'devices' && <DevicesTab initialSessions={initialSessions} />}
          {tab === 'teams' && (
            <TeamsTab
              initialTeams={initialTeams}
              userName={user.name}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
