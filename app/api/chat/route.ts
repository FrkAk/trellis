import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { eq, and, sql } from "drizzle-orm";
import { getModel } from "@/lib/ai/provider";
import { allTools, decomposeTools, refineScopedTools, brainstormTools } from "@/lib/ai/tools";
import { RateLimitError } from "@/lib/ai/rate-limiter";
import * as prompts from "@/lib/ai/system-prompts";
import { buildWorkingContext, formatWorkingContext } from "@/lib/context/working";
import { buildProjectOverview } from "@/lib/context/overview";
import { db } from "@/lib/db";
import { conversations, projects } from "@/lib/db/schema";
import { chatRequestSchema, parseOrError } from "@/lib/api/validation";
import type { Message } from "@/lib/types";

/**
 * POST handler for AI chat streaming.
 * @param req - Incoming request with chat payload.
 * @returns Streaming UI message response.
 */
export async function POST(req: Request) {
  try {
    const parsed = parseOrError(chatRequestSchema, await req.json());
    if (!parsed.success) return parsed.error;
    const { messages: rawMessages, scope, taskId, projectId, settings } = parsed.data;
    const messages = rawMessages as unknown as UIMessage[];

    // Build the system prompt based on scope
    let systemPrompt: string;

    switch (scope) {
      case "brainstorm": {
        systemPrompt = prompts.brainstorm(projectId);
        break;
      }
      case "decompose": {
        let context: string | undefined;
        let brainstormConversation: string | undefined;
        try {
          const [project] = await db
            .select({ title: projects.title, description: projects.description })
            .from(projects)
            .where(eq(projects.id, projectId));
          if (project) {
            const overview = await buildProjectOverview(projectId);
            context = overview
              ? JSON.stringify(overview, null, 2)
              : `Project: ${project.title}\nDescription: ${project.description}`;
          }
          const [convo] = await db
            .select({ messages: conversations.messages })
            .from(conversations)
            .where(and(
              eq(conversations.projectId, projectId),
              sql`${conversations.taskId} IS NULL`,
            ));
          if (convo?.messages?.length) {
            brainstormConversation = convo.messages
              .map((m: Message) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
              .join('\n\n');
          }
        } catch (err) { console.warn("[chat] context build failed:", err); }
        systemPrompt = prompts.decompose(projectId, context, brainstormConversation);
        break;
      }
      case "refine": {
        let context: string | undefined;
        if (taskId) {
          try {
            const ctx = await buildWorkingContext(taskId, projectId);
            context = await formatWorkingContext(ctx);
          } catch (err) { console.warn("[chat] context build failed:", err); }
        }
        systemPrompt = prompts.refine(projectId, taskId ?? "", context);
        break;
      }
      case "projectChat": {
        let context: string | undefined;
        try {
          const overview = await buildProjectOverview(projectId);
          if (overview) context = JSON.stringify(overview, null, 2);
        } catch (err) { console.warn("[chat] context build failed:", err); }
        systemPrompt = prompts.projectChat(projectId, context);
        break;
      }
      default:
        systemPrompt = prompts.brainstorm(projectId);
    }

    const modelMessages = await convertToModelMessages(messages);
    const tools = scope === "brainstorm"
      ? brainstormTools(projectId)
      : scope === "decompose"
        ? decomposeTools(projectId)
        : scope === "refine" && taskId
          ? refineScopedTools(taskId, projectId)
          : allTools(projectId);

    const maxSteps = scope === "decompose" ? 30 : 10;

    const result = streamText({
      model: getModel(settings),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(maxSteps),
      onFinish: async ({ text }) => {
        try {
          await persistConversation(projectId, taskId, messages, text);
        } catch (err) {
          console.warn("[chat] conversation persist failed:", err);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return new Response(
        JSON.stringify({ error: error.message, cooldownSeconds: error.cooldownSeconds }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(error.cooldownSeconds) } },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const isRateLimit = message.toLowerCase().includes("rate") || message.includes("429") || message.includes("quota");
    console.error("[chat/route] Error:", message);
    return new Response(
      JSON.stringify({ error: message, cooldownSeconds: isRateLimit ? 30 : undefined }),
      { status: isRateLimit ? 429 : 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Persist or update conversation in the database.
 * @param projectId - UUID of the project.
 * @param taskId - Optional UUID of the task.
 * @param messages - The UI message history.
 * @param assistantText - The final assistant response text.
 */
async function persistConversation(
  projectId: string,
  taskId: string | undefined,
  messages: UIMessage[],
  assistantText: string,
) {
  const newMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: assistantText,
    createdAt: new Date().toISOString(),
  };

  const condition = taskId
    ? and(
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, taskId),
      )
    : and(
        eq(conversations.projectId, projectId),
        sql`${conversations.taskId} IS NULL`,
      );

  const [existing] = await db
    .select()
    .from(conversations)
    .where(condition);

  if (existing) {
    // Append new user messages that aren't already persisted
    const existingIds = new Set(existing.messages.map((m) => m.id));
    const newUserMessages: Message[] = messages
      .filter((m) => m.role === "user")
      .map((m) => ({
        id: m.id,
        role: "user" as const,
        content: m.parts?.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n") ?? "",
        createdAt: new Date().toISOString(),
      }))
      .filter((m) => !existingIds.has(m.id));

    await db
      .update(conversations)
      .set({
        messages: [...existing.messages, ...newUserMessages, newMessage],
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, existing.id));
  } else {
    const userMessages: Message[] = messages
      .filter((m) => m.role === "user")
      .map((m) => ({
        id: crypto.randomUUID(),
        role: "user" as const,
        content: m.parts?.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n") ?? "",
        createdAt: new Date().toISOString(),
      }));

    await db.insert(conversations).values({
      projectId,
      taskId: taskId ?? null,
      messages: [...userMessages, newMessage],
    });
  }
}
