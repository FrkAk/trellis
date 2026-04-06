/** Client-side settings reader for the AI provider configuration. */

const STORAGE_KEY = 'mymir-settings';

/** Saved AI settings shape. */
export type MymirSettings = {
  provider: string;
  model: string;
  apiKey: string;
};

/**
 * Read AI settings from localStorage.
 * @returns Settings object, or undefined if not set.
 */
export function getSettings(): MymirSettings | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MymirSettings;
  } catch (err) { console.warn("[settings] Failed to parse stored settings:", err); }
  return undefined;
}
