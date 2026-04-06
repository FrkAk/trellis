import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { settingsSchema, parseOrError } from "@/lib/api/validation";
import { ok, error } from "@/lib/api/response";

/**
 * POST handler for testing LLM provider connectivity.
 * @param req - Request with provider settings.
 * @returns 200 on success, 502 when the upstream provider is unreachable.
 */
export async function POST(req: Request) {
  try {
    const parsed = parseOrError(settingsSchema, await req.json());
    if (!parsed.success) return parsed.error;
    const settings = parsed.data;
    const model = getModel(settings);

    await generateText({
      model,
      prompt: "Reply with the single word: connected",
      maxOutputTokens: 16,
    });

    return ok({ connected: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(message, 502);
  }
}
