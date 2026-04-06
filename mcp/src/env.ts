import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Load .env.local from the project root into process.env.
 * Only sets variables that aren't already defined, so explicit env vars take precedence.
 * Uses import.meta.url to resolve the project root regardless of cwd.
 */
export function loadEnvLocal(): void {
  const thisDir = resolve(fileURLToPath(import.meta.url), "..");
  const envPath = resolve(thisDir, "../../.env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}
