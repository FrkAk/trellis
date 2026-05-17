"use client";

import type { CSSProperties } from "react";

/**
 * Stable hue palette per category — same string maps to the same hue across
 * sessions. Hues are spread for perceptual separation in both dark and light
 * modes; saturation / lightness branches happen in `globals.css` under
 * `.category-dot` so this module stays theme-agnostic.
 */
export const CATEGORY_HUES: readonly number[] = [
  205, 162, 280, 32, 220, 138, 12, 254, 312, 88,
];

/**
 * Hash a string to a non-negative integer suitable for modulus into the hue
 * palette. Deterministic across calls and platforms.
 *
 * @param input - String to hash.
 * @returns Non-negative integer.
 */
export function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Resolve a category name to its deterministic hue.
 *
 * @param name - Category name.
 * @returns HSL hue value in degrees.
 */
export function getCategoryHue(name: string): number {
  return (
    CATEGORY_HUES[hashString(name) % CATEGORY_HUES.length] ?? CATEGORY_HUES[0]!
  );
}

interface CategoryDotProps {
  /** @param name - Category name; drives the deterministic hue and label. */
  name: string;
}

/**
 * Category affordance for list rows — renders as a 6×6 colored swatch at
 * rest and morphs into the full lowercase mono chip when an ancestor with
 * the `group` class is hovered or contains focus. All theme branching and
 * the hover animation live in `globals.css` under `.category-dot`; this
 * component only forwards the deterministic hue via the `--category-hue`
 * custom property.
 *
 * @param props - Category name.
 * @returns Inline-flex element.
 */
export function CategoryDot({ name }: CategoryDotProps) {
  const hue = getCategoryHue(name);
  return (
    <span
      className="category-dot"
      style={{ "--category-hue": String(hue) } as CSSProperties}
      aria-label={`Category: ${name}`}
      title={name}
    >
      <span aria-hidden="true" className="category-name">
        {name.toLowerCase()}
      </span>
    </span>
  );
}
