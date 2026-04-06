import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd());
const MCP_AGENTS_DIR = resolve(PROJECT_ROOT, "mcp/agents");
const ADDENDUMS_DIR = resolve(PROJECT_ROOT, "lib/ai/prompts");

/**
 * Read an MCP agent prompt, stripping YAML frontmatter.
 * @param name - Agent filename (without extension).
 * @returns Agent prompt content without frontmatter.
 */
function readAgent(name: string): string {
  const raw = readFileSync(resolve(MCP_AGENTS_DIR, `${name}.md`), "utf8");
  return raw.replace(/^---[\s\S]*?---\n*/, "");
}

/**
 * Read an addendum template and replace {{placeholders}} with values.
 * @param name - Addendum filename (without extension).
 * @param vars - Key-value map of placeholder replacements.
 * @returns Interpolated addendum string.
 */
function readAddendum(name: string, vars: Record<string, string>): string {
  const raw = readFileSync(resolve(ADDENDUMS_DIR, `${name}.md`), "utf8");
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Build system prompt for brainstorming scope.
 * Base: mcp/agents/brainstorm.md. Addendum: web app tools + UI rules.
 * @param projectId - UUID of the project being brainstormed.
 * @returns Complete system prompt string.
 */
export function brainstorm(projectId: string): string {
  const base = readAgent("brainstorm");
  const addendum = readAddendum("brainstorm-addendum", { projectId });
  return base + "\n\n---\n\n" + addendum;
}

/**
 * Build system prompt for decomposition scope.
 * Base: mcp/agents/decompose.md. Addendum: web app tools + context injection.
 * @param projectId - UUID of the project to decompose.
 * @param context - Optional project overview context.
 * @param brainstormConversation - Optional brainstorm conversation text.
 * @returns Complete system prompt string.
 */
export function decompose(projectId: string, context?: string, brainstormConversation?: string): string {
  const base = readAgent("decompose");
  const contextSection = context
    ? `\n## Project Context\n${context}`
    : "";
  const conversationSection = brainstormConversation
    ? `\n## Brainstorm Conversation\nThis is the full brainstorm conversation. Extract every actionable detail — features, flows, tech choices, data models, constraints, scope decisions — and map them into the tasks you create. Nothing discussed here should be lost.\n\n${brainstormConversation}`
    : "";
  const addendum = readAddendum("decompose-addendum", { projectId, contextSection, conversationSection });
  return base + "\n\n---\n\n" + addendum;
}

/**
 * Build system prompt for refinement scope.
 * Standalone prompt — no MCP agent equivalent (refinement is a web-app-specific workflow).
 * @param projectId - UUID of the project.
 * @param taskId - UUID of the task being refined.
 * @param context - Working context from CRI.
 * @returns Complete system prompt string.
 */
export function refine(projectId: string, taskId: string, context?: string): string {
  const contextSection = context
    ? `\n## Task Context\n${context}`
    : "";
  return readAddendum("refine", { projectId, taskId, contextSection });
}

/**
 * Build system prompt for project-level chat.
 * Base: mcp/agents/manage.md. Addendum: web app tools + context injection.
 * @param projectId - UUID of the project.
 * @param context - Project overview context.
 * @returns Complete system prompt string.
 */
export function projectChat(projectId: string, context?: string): string {
  const base = readAgent("manage");
  const contextSection = context
    ? `\n## Project Structure\n${context}`
    : "";
  const addendum = readAddendum("project-chat-addendum", { projectId, contextSection });
  return base + "\n\n---\n\n" + addendum;
}
