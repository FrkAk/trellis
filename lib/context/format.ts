import type {
  Decision,
  AcceptanceCriterion,
} from "@/lib/types";

/**
 * Format a section header for structured text output.
 * @param title - Section title.
 * @returns Markdown-style header string.
 */
export function section(title: string): string {
  return `\n## ${title}\n`;
}

/**
 * Format decisions as compressed one-liners.
 * @param decisions - Array of decisions.
 * @returns Formatted string with one decision per line.
 */
export function formatDecisions(decisions: Decision[]): string {
  if (decisions.length === 0) return "None";
  return decisions.map((d) => `- [${d.source}] ${d.text}`).join("\n");
}

/**
 * Format acceptance criteria as a checklist.
 * @param criteria - Array of acceptance criteria.
 * @returns Formatted checklist string.
 */
export function formatCriteria(criteria: AcceptanceCriterion[]): string {
  if (criteria.length === 0) return "None";
  return criteria
    .map((c) => `- [${c.checked ? "x" : " "}] ${c.text}`)
    .join("\n");
}

/**
 * Compress a string to a max length, appending ellipsis if truncated.
 * @param text - Input text.
 * @param max - Maximum character length.
 * @returns Possibly truncated text.
 */
export function compress(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}


