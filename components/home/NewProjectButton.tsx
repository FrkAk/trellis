'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { GetStartedModal } from '@/components/home/GetStartedModal';

interface NewProjectButtonProps {
  /** Switches the modal between first-time and returning copy. */
  hasProjects: boolean;
}

/**
 * Primary CTA in the home-page header. Opens {@link GetStartedModal} where
 * the install / "talk to your agent" copy lives. Project creation itself
 * happens in the user's coding agent via MCP — the button is a pointer,
 * not a form. Sits in the header (Linear-style) rather than as a grid
 * placeholder so the project cards aren't interrupted by an empty slot.
 *
 * @param props - Button configuration.
 * @returns Pill-shaped CTA paired with the modal it triggers.
 */
export function NewProjectButton({ hasProjects }: NewProjectButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-transparent px-4 py-1.5 text-xs font-semibold text-text-primary shadow-[var(--shadow-button)] transition-opacity hover:opacity-60"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3 w-3">
          <path d="M8 2.75a.75.75 0 01.75.75v3.75h3.75a.75.75 0 010 1.5H8.75v3.75a.75.75 0 01-1.5 0V8.75H3.5a.75.75 0 010-1.5h3.75V3.5A.75.75 0 018 2.75z" />
        </svg>
        New project
      </motion.button>
      <GetStartedModal
        open={open}
        onClose={() => setOpen(false)}
        hasProjects={hasProjects}
      />
    </>
  );
}

export default NewProjectButton;
