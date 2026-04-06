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
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="flex h-full min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface p-5 transition-colors hover:border-accent/30 hover:bg-accent-glow"
      >
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z" />
          </svg>
        </div>
        <span className="text-sm font-medium text-text-secondary">New Project</span>
      </motion.div>
    </Link>
  );
}

export default NewProjectCard;
