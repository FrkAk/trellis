import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Get the current session, validated against the DB.
 * Wrapped with React cache() to deduplicate within a single request.
 * @returns Session object or null if not authenticated.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Get the current session, throwing if not authenticated.
 * Use in server components where redirect is preferred over 401.
 * @returns Validated session object.
 * @throws Error if no active session.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
