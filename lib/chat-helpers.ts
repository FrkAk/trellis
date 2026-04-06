import type { UIMessage } from "ai";
import type { Message } from "@/lib/types";

/**
 * Extract text content from a UIMessage's parts array.
 * @param message - A UIMessage from the AI SDK.
 * @returns The concatenated text content.
 */
export function getMessageText(message: UIMessage): string {
  return message.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") ?? "";
}

/**
 * Convert persisted DB messages to UIMessage format for useChat initialMessages.
 * @param messages - Array of persisted Message objects from the conversations table.
 * @returns Array of UIMessage objects compatible with AI SDK's useChat.
 */
export function convertPersistedToUIMessages(messages: Message[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: [{ type: "text" as const, text: m.content }],
    createdAt: new Date(m.createdAt),
  }));
}
