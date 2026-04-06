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
        className="mb-6 flex items-center justify-between rounded-xl border border-accent/20 bg-accent-glow p-4 transition-colors hover:border-accent/40"
      >
        <div>
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
            Continue where you left off
          </p>
          <p className="text-sm font-medium text-text-primary">{projectName}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {lastActiveNode}
            <span className="text-text-muted"> &middot; {lastActive}</span>
          </p>
        </div>
        <span className="text-lg text-accent">&rarr;</span>
      </motion.div>
    </Link>
  );
}

export default ContinueBanner;
