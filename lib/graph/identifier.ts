/**
 * Project identifier helpers for human-readable task references (e.g. "MYM-123").
 *
 * The composed taskRef is `{project.identifier}-{task.sequenceNumber}` — computed
 * at read time, not stored. This module handles the prefix portion only.
 */

/**
 * Derive a short uppercase prefix from a project title.
 *
 * Multi-word titles yield initials (e.g. "Mymir Platform" → "MP").
 * Single-word titles yield the full cleaned word (e.g. "Mymir" → "MYMIR").
 * Result is uppercase alphanumeric, capped at 12 characters.
 *
 * @param title - Project title.
 * @returns Derived identifier. Empty string if title has no alphanumerics.
 */
export function deriveIdentifier(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]).join("").toUpperCase().slice(0, 12);
  }
  return words[0].toUpperCase().slice(0, 12);
}

/**
 * Validate a user-supplied project identifier.
 *
 * @param id - Candidate identifier.
 * @returns Error message if invalid, or null if valid.
 */
export function validateIdentifier(id: string): string | null {
  if (id.length < 2 || id.length > 12) return "identifier must be 2-12 characters";
  if (!/^[A-Z0-9]+$/.test(id)) return "identifier must be uppercase alphanumeric only";
  return null;
}

/**
 * Compose a human-readable task reference from its parts.
 *
 * @param identifier - Project prefix (e.g. "MYM").
 * @param sequenceNumber - Per-project sequence number.
 * @returns Composed taskRef (e.g. "MYM-123").
 */
export function composeTaskRef(identifier: string, sequenceNumber: number): string {
  return `${identifier}-${sequenceNumber}`;
}
