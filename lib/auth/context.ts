import "server-only";

import { requireSession } from "@/lib/auth/session";

declare const authContextBrand: unique symbol;

/**
 * Authenticated request context. Holds the user identity and the active
 * team (organization) the user picked for this session. All mutations and
 * queries in the graph layer require an `AuthContext` so authorization
 * cannot be skipped at the application layer.
 *
 * Branded — only `getAuthContext` (web) and `makeAuthContext` (MCP) can
 * mint a value. Callers cannot fabricate one with a plain object literal,
 * so any function that takes an `AuthContext` sees a value the auth layer
 * has actually verified.
 */
export type AuthContext = {
  readonly userId: string;
  readonly activeOrgId: string;
  readonly [authContextBrand]: true;
};

/**
 * Thrown when the caller is signed in but has no active team selected
 * (no membership yet, or session.activeOrganizationId was cleared).
 * Web layer maps this to a redirect to `/onboarding/team`.
 * MCP maps this to a "no active team — re-authorize" error.
 */
export class NoActiveTeamError extends Error {
  constructor() {
    super("No active team selected for this session.");
    this.name = "NoActiveTeamError";
  }
}

/**
 * Mint an `AuthContext` from already-verified credentials. Only call from
 * code paths that have validated the principal (session, JWT). Application
 * code should depend on `AuthContext` values handed in, not construct them.
 * @param userId - Verified user id (e.g. `session.user.id`, JWT `sub`).
 * @param activeOrgId - Active organization id (session, JWT `active_org`).
 * @returns Branded auth context.
 */
export function makeAuthContext(
  userId: string,
  activeOrgId: string,
): AuthContext {
  return { userId, activeOrgId } as unknown as AuthContext;
}

/**
 * Resolve the current request's auth context from the Better Auth session.
 * @returns The authenticated user id and active organization id.
 * @throws Error from requireSession when not authenticated.
 * @throws NoActiveTeamError when session has no activeOrganizationId.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const session = await requireSession();
  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) throw new NoActiveTeamError();
  return makeAuthContext(session.user.id, activeOrgId);
}
