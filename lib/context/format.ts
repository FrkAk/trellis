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
 * Format acceptance criteria as a checklist, grouped by checked state.
 *
 * Output shape depends on the criteria's state so agents can immediately see
 * what's left to do:
 * - empty: "None"
 * - all unchecked: flat "- [ ] ..." list, no labels
 * - all checked: "All criteria met:" label followed by the checked list
 * - mixed: "Remaining:" section first (primacy for pending work), then "Done:"
 *
 * @param criteria - Array of acceptance criteria.
 * @returns Formatted checklist string, possibly grouped by checked state.
 */
export function formatCriteria(criteria: AcceptanceCriterion[]): string {
  if (criteria.length === 0) return "None";

  const remaining = criteria.filter((c) => !c.checked);
  const done = criteria.filter((c) => c.checked);
  const renderRemaining = () => remaining.map((c) => `- [ ] ${c.text}`).join("\n");
  const renderDone = () => done.map((c) => `- [x] ${c.text}`).join("\n");

  if (done.length === 0) return renderRemaining();
  if (remaining.length === 0) return `All criteria met:\n${renderDone()}`;
  return `Remaining:\n${renderRemaining()}\n\nDone:\n${renderDone()}`;
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


