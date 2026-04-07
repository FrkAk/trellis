'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

interface ContinueBannerProps {
  /** @param projectId - UUID or stub ID of the project. */
  projectId: string;
  /** @param projectName - Display name of the project. */
  projectName: string;
  /** @param lastActiveNode - Description of where the user left off. */
  lastActiveNode: string;
  /** @param lastActive - Relative time string (e.g. "2 hours ago"). */
  lastActive: string;
}

/**
 * Accent-tinted banner showing the most recent project with a continue link.
 * @param props - Banner data.
 * @returns A styled continue banner element.
 */
export function ContinueBanner({
  projectId,
  projectName,
  lastActiveNode,
  lastActive,
}: ContinueBannerProps) {
  return (
    <Link href={`/project/${projectId}`} className="block no-underline">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="group mb-6 flex items-center gap-4 rounded-xl border border-accent/15 bg-accent/[0.04] px-5 py-3.5 transition-all hover:border-accent/30 hover:bg-accent/[0.06]"
      >
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent mb-0.5">
            Continue where you left off
          </p>
          <p className="text-sm font-medium text-text-primary truncate">{projectName}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {lastActiveNode} &middot; {lastActive}
          </p>
        </div>
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-accent/40 transition-all group-hover:text-accent group-hover:translate-x-0.5">
          <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </motion.div>
    </Link>
  );
}

export default ContinueBanner;
