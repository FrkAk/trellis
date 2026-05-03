'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { member } from '@/lib/db/auth-schema';
import { requireSession } from '@/lib/auth/session';
import { checkActionRateLimit } from '@/lib/actions/rate-limit-action';
import {
  mapBetterAuthError,
  parseOrFail,
  teamFail,
  type TeamActionResult,
} from '@/lib/actions/team-errors';

const switchSchema = z.object({
  organizationId: z.uuid('Invalid team id'),
});

/**
 * Switch the caller's active team for this session. Verifies membership
 * before delegating to BA's `setActiveOrganization` so cross-team probes
 * surface a typed `forbidden` rather than a generic auth error.
 *
 * Revalidates the entire `/` layout because team scope changes the data
 * surfaced on every page.
 *
 * @param input - `{ organizationId }` of the team to activate.
 * @returns Discriminated result.
 */
export async function switchActiveTeamAction(input: {
  organizationId: string;
}): Promise<TeamActionResult> {
  let userId: string;
  let currentActive: string | undefined;
  try {
    const session = await requireSession();
    userId = session.user.id;
    currentActive = session.session.activeOrganizationId ?? undefined;
  } catch {
    return teamFail('unauthorized');
  }

  const parsed = parseOrFail(switchSchema, input);
  if (!parsed.ok) return parsed;

  if (currentActive === parsed.data.organizationId) {
    return { ok: true };
  }

  const limit = await checkActionRateLimit(
    { action: 'team.switch', windowSeconds: 60, perUserMax: 30, perIpMax: 90 },
    userId,
  );
  if (!limit.ok) return teamFail('rate_limited');

  const [membershipRow] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, parsed.data.organizationId),
      ),
    )
    .limit(1);

  if (!membershipRow) return teamFail('forbidden');

  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: parsed.data.organizationId },
      headers: await headers(),
    });
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === 'unknown') {
      console.error('switchActiveTeamAction failed', err);
    }
    return teamFail(code);
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
