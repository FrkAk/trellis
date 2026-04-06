import { z } from "zod";
import { NextResponse } from "next/server";

/** Zod schema for a single AI SDK message. */
const messageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system", "tool"]),
  })
  .passthrough();

/** Zod schema for the chat API request body. */
export const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
  scope: z.enum(["brainstorm", "decompose", "refine", "projectChat"]),
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  settings: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      apiKey: z.string().optional(),
    })
    .optional(),
});

/** Zod schema for AI settings (test-connection endpoint). */
export const settingsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

/** Zod schema for the models API request body. */
export const modelsRequestSchema = z.object({
  provider: z.enum(["google", "anthropic", "openai", "ollama"]).optional(),
  apiKey: z.string().optional(),
});

/**
 * Parse data against a Zod schema, returning either parsed data or an error Response.
 * @param schema - The Zod schema to validate against.
 * @param data - The raw data to parse.
 * @returns Discriminated union with either parsed data or error Response.
 */
export function parseOrError<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: NextResponse } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      },
      { status: 400 },
    ),
  };
}
