'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

/**
 * Card that links to the new project brainstorm flow.
 * @returns A styled "new project" call-to-action card.
 */
export function NewProjectCard() {
  return (
    <Link href="/new/brainstorm" className="block no-underline">
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        className="flex h-full min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/60 bg-transparent p-5 transition-all hover:border-accent/30 hover:bg-accent/[0.03]"
      >
        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-text-muted transition-colors group-hover:text-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z" />
          </svg>
        </div>
        <span className="text-xs text-text-muted">New Project</span>
      </motion.div>
    </Link>
  );
}

export default NewProjectCard;
