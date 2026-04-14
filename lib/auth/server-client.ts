import "server-only";

import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

/**
 * Resource server client for verifying OAuth JWT tokens.
 * Audience, issuer, and jwksUrl are provided explicitly at call sites
 * since the auto-fill from `auth` doesn't work with betterAuth()'s return type.
 */
export const serverClient = createAuthClient({
  plugins: [oauthProviderResourceClient()],
});
