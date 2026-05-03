'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { auth } from '@/lib/auth';
import { requireSession } from '@/lib/auth/session';
import { checkActionRateLimit } from '@/lib/actions/rate-limit-action';
import {
  mapBetterAuthError,
  parseOrFail,
  teamFail,
  type TeamActionResult,
} from '@/lib/actions/team-errors';

const NAME_MAX = 80;

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(NAME_MAX),
});

/**
 * Update the signed-in user's display name. Email changes are not supported
 * here — Better Auth requires a verification round-trip for email and we
 * lock that path in v1.
 *
 * @param input - `{ name }` from the profile form.
 * @returns Discriminated `TeamActionResult`.
 */
export async function updateProfileAction(input: {
  name: string;
}): Promise<TeamActionResult> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return teamFail('unauthorized');
  }

  const parsed = parseOrFail(updateProfileSchema, input);
  if (!parsed.ok) return parsed;

  const limit = await checkActionRateLimit(
    { action: 'profile.update', windowSeconds: 60, perUserMax: 10, perIpMax: 30 },
    userId,
  );
  if (!limit.ok) return teamFail('rate_limited');

  try {
    await auth.api.updateUser({
      body: { name: parsed.data.name },
      headers: await headers(),
    });
  } catch (err) {
    const code = mapBetterAuthError(err);
    if (code === 'unknown') {
      console.error('updateProfileAction failed', err);
    }
    return teamFail(code);
  }

  revalidatePath('/settings');
  return { ok: true };
}
