import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { ac, owner, admin, member } from "@/lib/auth/permissions";

/**
 * Better Auth client instance.
 * Auto-discovers API at /api/auth (same origin).
 * Includes organization and OAuth provider plugins.
 */
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
    oauthProviderClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
