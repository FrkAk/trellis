'use client';

import { motion } from 'motion/react';

interface ProgressBarProps {
  /** @param value - Progress percentage (0-100). */
  value: number;
  /** @param status - Controls fill color: accent for in-progress, green for done. */
  status: 'in-progress' | 'done';
  /** @param className - Additional CSS classes. */
  className?: string;
}

const fillStyles = {
  'in-progress': 'bg-gradient-to-r from-accent to-done',
  done: 'bg-done',
} as const;

const glowStyles = {
  'in-progress': 'shadow-[var(--shadow-glow-accent)]',
  done: 'shadow-[var(--shadow-glow-done)]',
} as const;

/**
 * Animated horizontal progress bar.
 * @param props - Progress bar configuration.
 * @returns A styled progress bar element.
 */
export function ProgressBar({ value, status, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={`h-2 w-full rounded-full bg-border ${className}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`h-full rounded-full ${fillStyles[status]} ${clamped > 0 ? glowStyles[status] : ''} ${clamped > 0 && clamped < 100 ? 'progress-shimmer' : ''}`}
      />
    </div>
  );
}

export default ProgressBar;
