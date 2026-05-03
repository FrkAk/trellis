/**
 * Extract a 1-2 character initials string from a display name or email.
 * Used for avatars when no image is available.
 *
 * @param input - Object with optional name and/or email fields.
 * @returns Uppercase initials, 1-2 characters. Falls back to '?' for empty input.
 */
export function initials(input: { name?: string | null; email?: string | null }): string {
  const source = (input.name?.trim() || input.email?.split('@')[0] || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
