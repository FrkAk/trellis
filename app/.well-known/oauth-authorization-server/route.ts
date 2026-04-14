import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/**
 * RFC 8414 OAuth Authorization Server Metadata.
 * MCP clients discover this at {origin}/.well-known/oauth-authorization-server.
 * @param request - Incoming GET request.
 * @returns Authorization server metadata JSON.
 */
export const GET = oauthProviderAuthServerMetadata(auth);
