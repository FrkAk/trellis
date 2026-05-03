'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listTeamMembersAction } from '@/lib/actions/team-members';
import { listPendingInvitationsAction } from '@/lib/actions/team-invitations';
import {
  getOrCreateTeamInviteCodeAction,
  type InviteCodeMetadata,
} from '@/lib/actions/team-invite-code';
import type { MemberView } from '@/lib/actions/team-members-map';
import type { InvitationView } from '@/lib/actions/team-invitations-map';
import type { organization as orgTable } from '@/lib/db/auth-schema';
import { TeamHero } from './TeamHero';
import { MembersSection } from './MembersSection';
import { InviteSection } from './InviteSection';
import { IdentitySection } from './IdentitySection';
import { DangerZone } from './DangerZone';

type Team = typeof orgTable.$inferSelect;

interface TeamSettingsViewProps {
  /** Authorized organization row from the server. */
  team: Team;
  /** Caller's role string for this team. */
  memberRole: string;
  /** True for owner or admin — gates Invite + Identity sections. */
  isAdminOrOwner: boolean;
  /** True for owner — gates Danger Zone. */
  isOwner: boolean;
  /** Caller's user id, used for self-row detection in members. */
  currentUserId: string;
  /** True when this team is the user's active session team. */
  isActive: boolean;
  /** Initial member list, hydrated server-side. */
  initialMembers: MemberView[];
  /** Initial pending invitation list (admin/owner only; empty otherwise). */
  initialInvitations: InvitationView[];
  /** Initial invite-code metadata (admin/owner + active team only). */
  initialInviteCode: InviteCodeMetadata | null;
}

/**
 * Sort members so owners surface first, admins next, then members.
 * Within a role, alphabetical by name keeps the list scannable.
 */
function sortMembers(list: MemberView[]): MemberView[] {
  const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  return [...list].sort((a, b) => {
    const ra = order[a.role] ?? 3;
    const rb = order[b.role] ?? 3;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Client shell coordinating the per-team admin page. Holds state for
 * members + invitations + invite-code, exposes refresh callbacks to
 * sub-sections, and centralizes error display so any section can surface
 * a failure into the page-level alert.
 *
 * @param props - Hydrated server data + identity slice.
 * @returns Sectioned page body with role-gated content.
 */
export function TeamSettingsView({
  team,
  memberRole,
  isAdminOrOwner,
  isOwner,
  currentUserId,
  isActive,
  initialMembers,
  initialInvitations,
  initialInviteCode,
}: TeamSettingsViewProps) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberView[]>(() => sortMembers(initialMembers));
  const [invitations, setInvitations] = useState<InvitationView[]>(initialInvitations);
  const [inviteCode, setInviteCode] = useState<InviteCodeMetadata | null>(initialInviteCode);
  const [teamName, setTeamName] = useState(team.name);
  const [teamSlug, setTeamSlug] = useState(team.slug);
  const [error, setError] = useState<string | null>(null);
  const [glowMemberId, setGlowMemberId] = useState<string | null>(null);

  const refreshMembers = useCallback(async () => {
    const result = await listTeamMembersAction({ organizationId: team.id });
    if (result.ok) setMembers(sortMembers(result.data));
  }, [team.id]);

  const refreshInvitations = useCallback(async () => {
    const result = await listPendingInvitationsAction();
    if (result.ok) setInvitations(result.data);
  }, []);

  const refreshInviteCode = useCallback(async () => {
    const result = await getOrCreateTeamInviteCodeAction();
    if (result.ok) setInviteCode(result.data);
  }, []);

  const handleRoleChanged = useCallback(
    (memberId: string, newRole: 'member' | 'admin' | 'owner') => {
      setError(null);
      setMembers((prev) =>
        sortMembers(prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))),
      );
      setGlowMemberId(memberId);
      window.setTimeout(() => setGlowMemberId(null), 900);
    },
    [],
  );

  const handleMemberRemoved = useCallback((memberId: string) => {
    setError(null);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }, []);

  const handleRenamed = useCallback(
    (next: { name?: string; slug?: string }) => {
      setError(null);
      if (next.name !== undefined) setTeamName(next.name);
      if (next.slug !== undefined) setTeamSlug(next.slug);
      router.refresh();
    },
    [router],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/settings?tab=teams"
          className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3 w-3">
            <path d="M9.78 12.78a.75.75 0 01-1.06 0L4.47 8.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 111.06 1.06L6.06 8l3.72 3.72a.75.75 0 010 1.06z" />
          </svg>
          Settings
        </Link>
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">{teamName}</h1>
          <p className="text-sm text-text-muted">Team settings · members, invitations, identity</p>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-xs text-cancelled"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-8">
        <TeamHero
          name={teamName}
          slug={teamSlug}
          teamId={team.id}
          memberRole={memberRole}
          isActive={isActive}
          memberCount={members.length}
        />

        <MembersSection
          members={members}
          currentUserId={currentUserId}
          viewerRole={memberRole}
          glowMemberId={glowMemberId}
          onRoleChanged={handleRoleChanged}
          onRemoved={handleMemberRemoved}
          onError={setError}
        />

        {isAdminOrOwner ? (
          <InviteSection
            invitations={invitations}
            inviteCode={inviteCode}
            isActive={isActive}
            onInvitationsChanged={refreshInvitations}
            onInviteCodeChanged={(next) => setInviteCode(next)}
            onRefreshInviteCode={refreshInviteCode}
            onRefreshMembers={refreshMembers}
            onError={setError}
          />
        ) : null}

        {isAdminOrOwner ? (
          <IdentitySection
            organizationId={team.id}
            currentName={teamName}
            currentSlug={teamSlug}
            onRenamed={handleRenamed}
            onError={setError}
          />
        ) : null}

        {isOwner ? (
          <DangerZone teamId={team.id} teamName={teamName} onError={setError} />
        ) : null}
      </div>
    </div>
  );
}
