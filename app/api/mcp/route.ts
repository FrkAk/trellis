import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/create-server";

/**
 * POST handler for MCP JSON-RPC messages via Streamable HTTP transport.
 * Stateless — creates a fresh server per request.
 * @param request - Incoming MCP JSON-RPC request.
 * @returns MCP JSON-RPC response.
 */
export async function POST(request: Request) {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * GET handler for MCP SSE streams.
 * @param request - Incoming request.
 * @returns SSE stream or error.
 */
export async function GET(request: Request) {
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
