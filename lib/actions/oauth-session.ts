'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth/session';
import { checkActionRateLimit } from '@/lib/actions/rate-limit-action';
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
  organization,
} from '@/lib/db/auth-schema';
import {
  parseOrFail,
  teamFail,
  type TeamActionResult,
} from '@/lib/actions/team-errors';

/**
 * UI-facing shape of an active OAuth (MCP device) session.
 *
 * Two timestamps are reported:
 * - `authorizedAt` reads `authTime` — when the user first consented. It
 *   stays stable across refresh-token rotations.
 * - `lastActiveAt` reads the active row's own `createdAt` — every refresh
 *   rotation creates a new row, so this updates whenever the integration
 *   exchanges a refresh for a new access token. We do NOT aggregate
 *   `oauthAccessToken` because BA's provider deletes access tokens on
 *   each rotation, so that table is effectively empty for live clients.
 */
export type OAuthSessionView = {
  /** Refresh token id — stable identifier passed to revoke. */
  id: string;
  /** OAuth client id (string, not UUID — BA mints these via DCR). */
  clientId: string;
  /** Display name from oauthClient.name; falls back to clientId. */
  clientName: string;
  /** Active organization scope, if the token is org-scoped. */
  organizationId: string | null;
  /** Display name of the organization, if joinable. */
  organizationName: string | null;
  /** Granted OAuth scopes. */
  scopes: string[];
  /** When the user authorized this client (consent time). */
  authorizedAt: Date;
  /** When this refresh row was last rotated — proxy for "last active". */
  lastActiveAt: Date;
  /** When the refresh token expires (null = no expiry set). */
  expiresAt: Date | null;
};

/**
 * List all active OAuth refresh tokens (device sessions) the caller owns.
 * Filters out revoked and expired tokens. Joins `oauthClient` for display
 * names and `organization` for org scope.
 *
 * @returns Discriminated result; `data` is the list of active sessions.
 */
export async function listOAuthSessionsAction(): Promise<
  TeamActionResult<OAuthSessionView[]>
> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return teamFail('unauthorized');
  }

  try {
    const rows = await db
      .select({
        id: oauthRefreshToken.id,
        clientId: oauthRefreshToken.clientId,
        clientName: oauthClient.name,
        organizationId: oauthRefreshToken.referenceId,
        organizationName: organization.name,
        scopes: oauthRefreshToken.scopes,
        authorizedAt: sql<Date>`coalesce(${oauthRefreshToken.authTime}, ${oauthRefreshToken.createdAt})`,
        lastActiveAt: oauthRefreshToken.createdAt,
        expiresAt: oauthRefreshToken.expiresAt,
      })
      .from(oauthRefreshToken)
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthRefreshToken.clientId))
      .leftJoin(
        organization,
        // referenceId is text; org.id is uuid — cast to compare safely
        sql`${organization.id}::text = ${oauthRefreshToken.referenceId}`,
      )
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          isNull(oauthRefreshToken.revoked),
          or(
            isNull(oauthRefreshToken.expiresAt),
            gt(oauthRefreshToken.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(oauthRefreshToken.createdAt));

    const data: OAuthSessionView[] = rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.clientName ?? row.clientId,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      scopes: row.scopes ?? [],
      authorizedAt: new Date(row.authorizedAt),
      lastActiveAt: new Date(row.lastActiveAt),
      expiresAt: row.expiresAt,
    }));

    return { ok: true, data };
  } catch (err) {
    console.error('listOAuthSessionsAction failed', err);
    return teamFail('unknown');
  }
}

const revokeSessionSchema = z.object({
  sessionId: z.uuid('Invalid session id'),
});

/**
 * Revoke a specific OAuth refresh token owned by the caller. Treats foreign
 * or missing tokens as `not_found` (anti-enumeration). Marks the refresh
 * row revoked and deletes any in-flight access tokens minted from it.
 *
 * @param input - `{ sessionId }` (refresh token UUID).
 * @returns Discriminated result.
 */
export async function revokeOAuthSessionAction(input: {
  sessionId: string;
}): Promise<TeamActionResult> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return teamFail('unauthorized');
  }

  const parsed = parseOrFail(revokeSessionSchema, input);
  if (!parsed.ok) return parsed;

  const limit = await checkActionRateLimit(
    { action: 'oauth.revoke', windowSeconds: 60, perUserMax: 20, perIpMax: 60 },
    userId,
  );
  if (!limit.ok) return teamFail('rate_limited');

  try {
    const owned = await db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.id, parsed.data.sessionId),
          eq(oauthRefreshToken.userId, userId),
          isNull(oauthRefreshToken.revoked),
        ),
      )
      .limit(1);

    if (owned.length === 0) return teamFail('not_found');

    await db.transaction(async (tx) => {
      await tx
        .update(oauthRefreshToken)
        .set({ revoked: new Date() })
        .where(eq(oauthRefreshToken.id, parsed.data.sessionId));
      await tx
        .delete(oauthAccessToken)
        .where(eq(oauthAccessToken.refreshId, parsed.data.sessionId));
    });

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    console.error('revokeOAuthSessionAction failed', err);
    return teamFail('unknown');
  }
}
