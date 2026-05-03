import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";
import { createMcpServer } from "@/lib/mcp/create-server";
import { serverClient } from "@/lib/auth/server-client";
import { makeAuthContext, type AuthContext } from "@/lib/auth/context";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const origin = new URL(baseUrl).origin;
const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;

/** Shape we require from a verified MCP access token payload. */
const accessTokenClaimsSchema = z.looseObject({
  sub: z.uuid(),
});

/**
 * Verify a JWT Bearer token from the Authorization header and return the
 * decoded payload. Uses the resource client with auto-filled issuer/audience
 * from auth config.
 * @param request - Incoming request.
 * @returns JWT payload if valid, null otherwise.
 */
async function verifyMcpAuth(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!token) return null;

  try {
    return await serverClient.verifyAccessToken(token, {
      verifyOptions: {
        audience: [origin, `${origin}/api/mcp`],
        issuer: `${baseUrl}/api/auth`,
      },
      jwksUrl: `${baseUrl}/api/auth/jwks`,
    });
  } catch {
    return null;
  }
}

/**
 * Resolve the MCP auth context from a verified JWT payload. Requires only
 * `sub` (user id) — team scope is resolved per call inside the data layer
 * via membership JOINs, never via a token-bound active-org claim.
 *
 * @param payload - Decoded JWT payload.
 * @returns AuthContext or null when the subject claim is missing.
 */
function authContextFromPayload(payload: unknown): AuthContext | null {
  const parsed = accessTokenClaimsSchema.safeParse(payload);
  if (!parsed.success) return null;
  return makeAuthContext(parsed.data.sub);
}

/**
 * MCP-spec 401 response with WWW-Authenticate header pointing to
 * the protected resource metadata URL (RFC 9728).
 * @returns 401 JSON-RPC error response.
 */
function unauthorized() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized" },
      id: null,
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      },
    },
  );
}

/**
 * Authenticate the request and run an MCP transport request.
 * @param request - Incoming MCP request.
 * @returns MCP response or 401.
 */
async function runMcpRequest(request: Request) {
  const payload = await verifyMcpAuth(request);
  if (!payload) return unauthorized();

  const ctx = authContextFromPayload(payload);
  if (!ctx) return unauthorized();

  const server = createMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * POST handler for MCP JSON-RPC messages via Streamable HTTP transport.
 * Requires a valid JWT Bearer token (subject claim only).
 * @param request - Incoming MCP JSON-RPC request.
 * @returns MCP JSON-RPC response or 401.
 */
export async function POST(request: Request) {
  return runMcpRequest(request);
}

/**
 * GET handler for MCP SSE streams. Requires a valid JWT Bearer token.
 * @param request - Incoming request.
 * @returns SSE stream or 401.
 */
export async function GET(request: Request) {
  return runMcpRequest(request);
}

/**
 * DELETE handler for MCP session termination.
 * No-op in stateless mode.
 * @returns 204 No Content.
 */
export function DELETE() {
  return new Response(null, { status: 204 });
}
