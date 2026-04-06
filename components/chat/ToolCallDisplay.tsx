'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { CopyButton } from '@/components/shared/CopyButton';

interface ToolCallDisplayProps {
  /** @param name - Tool function name. */
  name: string;
  /** @param args - Tool call arguments. */
  args: Record<string, unknown>;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Inline expandable tool call indicator.
 * @param props - Tool call display configuration.
 * @returns A compact tool call badge that expands to show arguments.
 */
export function ToolCallDisplay({ name, args, className = '' }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const argSummary = Object.values(args).map(String).join(', ');

  return (
    <div className={className}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer rounded border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text-muted transition-colors hover:bg-surface-hover"
      >
        [Tool: {name}({argSummary})]
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1 overflow-hidden rounded border border-border bg-surface"
          >
            <div className="flex justify-end px-2 pt-1.5">
              <CopyButton text={JSON.stringify(args, null, 2)} label="Copy" className="text-[10px] py-0.5 px-1.5" />
            </div>
            <pre className="px-2 py-1.5 font-mono text-xs text-text-muted">
              {JSON.stringify(args, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ToolCallDisplay;
