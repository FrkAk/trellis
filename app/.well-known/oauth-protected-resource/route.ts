import { serverClient } from "@/lib/auth/server-client";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const origin = new URL(baseUrl).origin;

/**
 * RFC 9728 Protected Resource Metadata.
 * MCP clients discover this from the WWW-Authenticate header's resource_metadata URL.
 * Points to the authorization server for token acquisition.
 * @param _request - Incoming GET request (unused).
 * @returns Protected resource metadata JSON.
 */
export async function GET() {
  const metadata = await serverClient.getProtectedResourceMetadata({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=15, stale-while-revalidate=15",
    },
  });
}
