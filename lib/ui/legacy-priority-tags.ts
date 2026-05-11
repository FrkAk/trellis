/**
 * Legacy priority strings that lived in `tasks.tags` before MYMR-190
 * promoted priority to a first-class column. MYMR-190 intentionally
 * left these values in the tags array during a dual-life window;
 * MYMR-195 will strip them server-side. Until then, the UI filters
 * them client-side so the workspace stops emitting both the new
 * column and the legacy tag.
 */
export const LEGACY_PRIORITY_TAGS: ReadonlySet<string> = new Set([
  'release-blocker',
  'core',
  'normal',
  'backlog',
]);

/**
 * Predicate: true when `tag` is one of the four legacy priority strings
 * that should no longer render in any tag surface.
 *
 * @param tag - Raw tag string.
 * @returns Whether the tag belongs to the legacy priority vocabulary.
 */
export function isLegacyPriorityTag(tag: string): boolean {
  return LEGACY_PRIORITY_TAGS.has(tag);
}
