'use server';

import { headers } from 'next/headers';
import { inArray } from 'drizzle-orm';
import { z } from 'zod/v4';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/auth-schema';
import { getAuthContext, NoActiveTeamError } from '@/lib/auth/context';
import { requireSession } from '@/lib/auth/session';
import { isOrgAdmin } from '@/lib/auth/org-permissions';
import {
  mapBetterAuthError,
  parseOrFail,
  teamFail,
  type TeamActionResult,
} from '@/lib/actions/team-errors';
import {
  toInvitationView,
  type BetterAuthInvitationRow,
  type InvitationView,
} from '@/lib/actions/team-invitations-map';

const cancelSchema = z.object({
  invitationId: z.uuid(),
});

/**
 * List pending invitations for the caller's active team. Filters out
 * already-accepted, rejected, and expired rows so the admin only sees
 * actionable items.
 *
 * Inviter names are resolved via a single batched user lookup since BA
 * returns only `inviterId` on the listInvitations row.
 *
 * Defense-in-depth: BA's `listInvitations` endpoint only checks team
 * membership, NOT role. Without the explicit `isOrgAdmin()` gate here a
 * regular member who calls the action directly (server-action POST from
 * the browser) could harvest invitee emails for the active team. Page
 * UI already hides the panel for non-admins, but the action surface is
 * independently callable and must enforce its own authorization.
 *
 * @returns Discriminated result; `data` is the pending list (newest first).
 */
export async function listPendingInvitationsAction(): Promise<
  TeamActionResult<InvitationView[]>
> {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) return teamFail('no_active_team');
    return teamFail('unauthorized');
  }

  if (!(await isOrgAdmin(ctx.activeOrgId))) return teamFail('forbidden');

  let raw: BetterAuthInvitationRow[];
  try {
    const result = await auth.api.listInvitations({
      query: { organizationId: ctx.activeOrgId },
      headers: await headers(),
    });
    raw = (result ?? []) as BetterAuthInvitationRow[];
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === 'unknown') {
      console.error('listPendingInvitationsAction failed', err);
    }
    return teamFail(code);
  }

  const now = Date.now();
  const pending = raw.filter((row) => {
    if (row.status !== 'pending') return false;
    const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
    return expiresAt.getTime() > now;
  });

  if (pending.length === 0) return { ok: true, data: [] };

  const inviterIds = Array.from(new Set(pending.map((row) => row.inviterId)));
  const inviters = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, inviterIds));
  const nameById = new Map(inviters.map((u) => [u.id, u.name]));

  const data = pending
    .map((row) =>
      toInvitationView(row, nameById.get(row.inviterId) ?? 'Unknown'),
    )
    .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf());

  return { ok: true, data };
}

/**
 * Cancel a pending invitation. BA enforces `invitation:cancel`
 * (admin+owner) at the endpoint and scopes by the invitation's own
 * organization, so cross-team cancels are rejected.
 *
 * Defense-in-depth: an explicit `isOrgAdmin()` check runs first so the
 * action's authorization does not single-source from BA's specific
 * error code shape, and a regular member is rejected with a typed
 * `forbidden` before any BA call.
 *
 * @param input - `{ invitationId }` to cancel.
 * @returns Discriminated result.
 */
export async function cancelInvitationAction(input: {
  invitationId: string;
}): Promise<TeamActionResult> {
  try {
    await requireSession();
  } catch {
    return teamFail('unauthorized');
  }

  const parsed = parseOrFail(cancelSchema, input);
  if (!parsed.ok) return parsed;

  if (!(await isOrgAdmin())) return teamFail('forbidden');

  try {
    await auth.api.cancelInvitation({
      body: { invitationId: parsed.data.invitationId },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === 'unknown') {
      console.error('cancelInvitationAction failed', err);
    }
    return teamFail(code);
  }
}
