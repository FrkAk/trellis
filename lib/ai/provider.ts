import { createProviderRegistry, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createRateLimitedFetch } from "./rate-limiter";

/** Client-provided settings from localStorage. */
export type AISettings = {
  provider?: string;
  model?: string;
  apiKey?: string;
};

/** Shared rate-limited fetch for Google provider (free tier has 15 RPM). */
const rateLimitedFetch = createRateLimitedFetch();

/** Default model IDs per provider (latest free-tier or best-value). */
const DEFAULT_MODELS: Record<string, string> = {
  google: "gemini-3.1-flash-lite-preview",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4-mini",
  ollama: "qwen3.5",
};

/**
 * Static provider registry using environment variables.
 * Created once at module load time.
 */
const registry = createProviderRegistry({
  google: createGoogleGenerativeAI({ fetch: rateLimitedFetch }),
  anthropic: createAnthropic({}),
  openai: createOpenAI({}),
  ...(process.env.OLLAMA_BASE_URL
    ? {
        ollama: createOpenAICompatible({
          name: "ollama",
          baseURL: `${process.env.OLLAMA_BASE_URL}/v1`,
        }),
      }
    : {}),
});

/**
 * Get the AI model instance using provider registry or custom API key.
 * Uses the static registry for env-var-based config, creates fresh provider
 * instances when a per-request API key is provided.
 * @param settings - Optional client-provided settings from localStorage.
 * @returns A configured AI SDK LanguageModel instance.
 */
export function getModel(settings?: AISettings): LanguageModel {
  const provider = settings?.provider ?? process.env.AI_PROVIDER ?? "google";
  const modelId = settings?.model ?? DEFAULT_MODELS[provider] ?? "gemini-2.5-flash";

  if (settings?.apiKey) {
    switch (provider) {
      case "google":
        return createGoogleGenerativeAI({ apiKey: settings.apiKey, fetch: rateLimitedFetch })(modelId);
      case "anthropic":
        return createAnthropic({ apiKey: settings.apiKey })(modelId);
      case "openai":
        return createOpenAI({ apiKey: settings.apiKey })(modelId);
      default:
        return registry.languageModel(`google:${modelId}`);
    }
  }

  return registry.languageModel(`${provider}:${modelId}` as `google:${string}`);
}
