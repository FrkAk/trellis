import { remark } from 'remark';
import remarkGfm from 'remark-gfm';

const processor = remark().use(remarkGfm);

/**
 * Normalize markdown text via remark + remark-gfm.
 * Idempotent — running twice produces the same output.
 * @param src - Raw markdown source, null, or undefined.
 * @returns Formatted markdown, or null for empty input.
 */
export async function formatMarkdown(src: string | null | undefined): Promise<string | null> {
  if (src == null) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  const file = await processor.process(trimmed);
  return String(file).trim();
}

/**
 * Map-format the `text` field on every item of a criteria/decisions-like array.
 * @param items - Array of objects with an optional `text` field.
 * @returns New array with formatted text values.
 */
export async function formatTextFieldArray<T extends { text?: unknown }>(items: readonly T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const text = item.text;
      if (typeof text !== 'string' || !text.trim()) return item;
      const formatted = await formatMarkdown(text);
      return { ...item, text: formatted ?? text };
    }),
  );
}

const TASK_MARKDOWN_FIELDS = ['description', 'implementationPlan', 'executionRecord'] as const;

/**
 * Format all markdown-bearing fields on a task create/update payload in place on a clone.
 * Covers `description`, `implementationPlan`, `executionRecord`, and the `.text` field
 * of each `acceptanceCriteria` / `decisions` entry.
 * @param input - Task fields to format.
 * @returns New object with formatted fields.
 */
export async function formatTaskMarkdownFields<T extends Record<string, unknown>>(input: T): Promise<T> {
  const result: Record<string, unknown> = { ...input };
  for (const field of TASK_MARKDOWN_FIELDS) {
    const val = result[field];
    if (typeof val === 'string' && val.trim()) {
      result[field] = (await formatMarkdown(val)) ?? val;
    }
  }
  if (Array.isArray(result.acceptanceCriteria)) {
    result.acceptanceCriteria = await formatTextFieldArray(result.acceptanceCriteria as { text?: unknown }[]);
  }
  if (Array.isArray(result.decisions)) {
    result.decisions = await formatTextFieldArray(result.decisions as { text?: unknown }[]);
  }
  return result as T;
}
