'use client';

import { motion } from 'motion/react';

interface DecisionCardProps {
  /** @param decisions - List of decision strings to display. */
  decisions: string[];
}

/**
 * Inline card displaying captured decisions during brainstorming.
 * @param props - Decision card configuration.
 * @returns A styled decisions list card.
 */
export function DecisionCard({ decisions }: DecisionCardProps) {
  if (decisions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-lg border border-accent/20 bg-accent-glow px-4 py-3"
    >
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
        Decisions
      </p>
      <ul className="m-0 list-none p-0 space-y-1">
        {decisions.map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {d}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default DecisionCard;
