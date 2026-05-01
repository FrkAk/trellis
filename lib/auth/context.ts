import "server-only";

import { requireSession } from "@/lib/auth/session";

/**
 * Authenticated request context. Holds the user identity and the active
 * team (organization) the user picked for this session. All mutations and
 * queries in the graph layer require an `AuthContext` so authorization
 * cannot be skipped at the application layer.
 */
export type AuthContext = {
  userId: string;
  activeOrgId: string;
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
 * Resolve the current request's auth context from the Better Auth session.
 * @returns The authenticated user id and active organization id.
 * @throws Error from requireSession when not authenticated.
 * @throws NoActiveTeamError when session has no activeOrganizationId.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const session = await requireSession();
  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) throw new NoActiveTeamError();
  return { userId: session.user.id, activeOrgId };
}
