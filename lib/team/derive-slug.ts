import { RESERVED_SLUGS, SLUG_MAX, SLUG_MIN } from './slug-rules';

/** Random-suffixed fallback used when the input cannot produce a valid slug. */
function fallbackSlug(): string {
  return `team-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Derive a URL-safe team slug from a free-form display name.
 *
 * @param name - Team display name entered by the user.
 * @returns Lowercase URL slug candidate for server validation.
 */
export function deriveTeamSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base || RESERVED_SLUGS.has(base)) return fallbackSlug();
  const slug = base.slice(0, SLUG_MAX).replace(/-+$/, '');
  if (slug.length < SLUG_MIN) return fallbackSlug();
  return slug;
}
