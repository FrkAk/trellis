'use server';

import { headers } from 'next/headers';
import { inArray } from 'drizzle-orm';
import { z } from 'zod/v4';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/auth-schema';
import { getAuthContext, NoActiveTeamError } from '@/lib/auth/context';
import { requireSession } from '@/lib/auth/session';
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
 * Page-level guard already enforces admin+owner gating before this is
 * called, so no extra role check here. BA's listInvitations endpoint
 * itself runs through `orgSessionMiddleware` for the session check.
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
 * Cancel a pending invitation. BA enforces that the caller has
 * `invitation:cancel` permission (admin+owner) — we surface BA's authz
 * rejection as a typed `forbidden` via `mapBetterAuthError`.
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
