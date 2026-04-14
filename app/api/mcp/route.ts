import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/create-server";
import { serverClient } from "@/lib/auth/server-client";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const origin = new URL(baseUrl).origin;
const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;

/**
 * Verify a JWT Bearer token from the Authorization header.
 * Uses the resource client with auto-filled issuer/audience from auth config.
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
 * POST handler for MCP JSON-RPC messages via Streamable HTTP transport.
 * Requires valid JWT Bearer token.
 * @param request - Incoming MCP JSON-RPC request.
 * @returns MCP JSON-RPC response or 401.
 */
export async function POST(request: Request) {
  const session = await verifyMcpAuth(request);
  if (!session) return unauthorized();

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * GET handler for MCP SSE streams.
 * Requires valid JWT Bearer token.
 * @param request - Incoming request.
 * @returns SSE stream or 401.
 */
export async function GET(request: Request) {
  const session = await verifyMcpAuth(request);
  if (!session) return unauthorized();

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * DELETE handler for MCP session termination.
 * No-op in stateless mode.
 * @returns 204 No Content.
 */
export function DELETE() {
  return new Response(null, { status: 204 });
}
