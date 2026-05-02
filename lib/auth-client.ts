import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/**
 * Better Auth client instance.
 * Auto-discovers API at /api/auth (same origin).
 * Includes organization and OAuth provider plugins. Role-based permissions
 * are deferred to MYMR-69; defaults are sufficient until then.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient(), oauthProviderClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
