'use client';

import { motion } from 'motion/react';

interface ProgressBarProps {
  /** @param value - Progress percentage (0-100). */
  value: number;
  /** @param status - Controls fill color: in-progress uses the brand gradient; done uses the green status colour. */
  status: 'in-progress' | 'done';
  /** @param className - Additional CSS classes. */
  className?: string;
  /** @param height - Pixel height. Defaults to 6 to match new lifecycle bars. */
  height?: 4 | 6 | 8;
}

const fillBackground = {
  'in-progress': 'var(--color-accent-grad)',
  done: 'var(--color-done)',
} as const;

const glowShadow = {
  'in-progress': 'var(--shadow-glow-accent)',
  done: 'var(--shadow-glow-done)',
} as const;

/**
 * Animated horizontal progress bar.
 * @param props - Progress bar configuration.
 * @returns A styled progress bar element.
 */
export function ProgressBar({ value, status, className = '', height = 6 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const animated = clamped > 0 && clamped < 100;

  return (
    <div
      className={`w-full overflow-hidden rounded-full ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ height, background: 'var(--color-border)' }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`h-full rounded-full ${animated ? 'progress-shimmer' : ''}`}
        style={{
          background: fillBackground[status],
          boxShadow: clamped > 0 ? glowShadow[status] : undefined,
        }}
      />
    </div>
  );
}

export default ProgressBar;
