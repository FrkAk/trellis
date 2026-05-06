/**
 * Fixed saturation and lightness for project brand colours. Tuned to read
 * on both dark and light surfaces — saturated enough to differentiate
 * projects in the sidebar dot, soft enough that the home grid `BrandMark`
 * gradient (mixed with `--color-accent-2`) doesn't fight the card chrome.
 */
const SATURATION = 65;
const LIGHTNESS = 60;

/**
 * 32-bit FNV-1a hash — mirrors `lib/ui/team-color.ts` so both colour
 * systems hash identifiers identically. `>>> 0` keeps the running value in
 * unsigned 32-bit space so the multiplication doesn't drift negative.
 *
 * @param str - String to hash.
 * @returns 32-bit unsigned integer hash.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Deterministic project brand colour. Hashes the identifier into one of
 * 360 hue stops at fixed saturation and lightness so every project gets
 * its own distinct hue without a curated palette to outgrow. Same
 * identifier always yields the same colour across reloads, devices, and
 * SSR/client renders.
 *
 * Used by the sidebar dot, home grid `BrandMark`, and the PropRail
 * project chip — anywhere a project needs a stable visual identity.
 *
 * @param identifier - Project identifier (e.g. `MYMR`).
 * @returns Stable `hsl(...)` string suitable for any CSS colour slot.
 */
export function projectColor(identifier: string): string {
  const hue = fnv1a(identifier) % 360;
  return `hsl(${hue} ${SATURATION}% ${LIGHTNESS}%)`;
}
