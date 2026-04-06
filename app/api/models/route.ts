import { ok } from "@/lib/api/response";
import { modelsRequestSchema, parseOrError } from "@/lib/api/validation";

/** Hardcoded fallbacks when API listing is unavailable. */
const FALLBACK_MODELS: Record<string, string[]> = {
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro-preview",
  ],
  anthropic: [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ],
  openai: [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o3",
    "o3-pro",
    "o4-mini",
  ],
  ollama: [
    "qwen3",
    "llama4",
    "deepseek-r1",
    "llama3.3",
    "mistral",
    "gemma3",
    "qwen2.5-coder",
  ],
};

/** Only allow core Gemini chat models: {version}-{flash|pro|flash-lite}[-preview]. */
const GOOGLE_ALLOW = /^gemini-\d+(\.\d+)?-(flash|pro|flash-lite)(-preview)?$/;

/**
 * Fetch available Google Gemini models via the API.
 * Filters to only core chat-capable models (no TTS, image, robotics, dated previews).
 * @param apiKey - Google AI API key.
 * @returns Array of model ID strings, newest first.
 */
async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) return FALLBACK_MODELS.google;
  const data = await res.json();
  const models = (data.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((m: { name: string }) => m.name.replace("models/", ""))
    .filter((id: string) => GOOGLE_ALLOW.test(id))
    .sort((a: string, b: string) => b.localeCompare(a));
  return models;
}

/**
 * Fetch available OpenAI models via the API.
 * @param apiKey - OpenAI API key.
 * @returns Array of model ID strings.
 */
async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return FALLBACK_MODELS.openai;
  const data = await res.json();
  return (data.data ?? [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => /^(gpt-|o[0-9])/.test(id))
    .sort();
}

/**
 * Fetch locally available Ollama models.
 * @param baseUrl - Ollama server base URL.
 * @returns Array of model name strings.
 */
async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) return FALLBACK_MODELS.ollama;
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) =>
    m.name.replace(/:latest$/, ""),
  );
}

/**
 * POST handler to list available models for a provider.
 * Fetches dynamically from provider APIs when possible, falls back to hardcoded lists.
 * @param req - Request with provider and optional apiKey in JSON body.
 * @returns JSON with models array.
 */
export async function POST(req: Request) {
  const parsed = parseOrError(modelsRequestSchema, await req.json());
  if (!parsed.success) return parsed.error;
  const { apiKey } = parsed.data;
  const provider = parsed.data.provider ?? "google";

  try {
    switch (provider) {
      case "google": {
        const key = apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (key) {
          const models = await fetchGoogleModels(key);
          if (models.length > 0) return ok({ models });
        }
        break;
      }
      case "openai": {
        const key = apiKey ?? process.env.OPENAI_API_KEY;
        if (key) {
          const models = await fetchOpenAIModels(key);
          if (models.length > 0) return ok({ models });
        }
        break;
      }
      case "ollama": {
        const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
        const models = await fetchOllamaModels(baseUrl);
        if (models.length > 0) return ok({ models });
        break;
      }
    }
  } catch {
    // Fall through to hardcoded fallback
  }

  return ok({ models: FALLBACK_MODELS[provider] ?? [] });
}
