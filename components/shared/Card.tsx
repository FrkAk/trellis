'use client';

import { motion } from 'motion/react';
import { type ReactNode, type KeyboardEvent } from 'react';

interface CardProps {
  /** @param hover - Enable border + shadow + accent glow on hover. */
  hover?: boolean;
  /** @param animated - Enable a one-shot fade/slide entrance animation. */
  animated?: boolean;
  /** @param padded - Apply default 16px internal padding. Defaults to false so cards can render their own header/body chrome. */
  padded?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
  /** @param children - Card content. */
  children: ReactNode;
  /** @param onClick - Click handler. Adds keyboard activation and `role="button"`. */
  onClick?: () => void;
}

const baseClasses = 'bg-surface border border-border rounded-lg shadow-[var(--shadow-card)] transition-all';
const hoverClasses = 'hover:border-border-strong hover:shadow-[var(--shadow-card-hover)] glow-card';

/**
 * Card container with optional accent-tinted glow hover and entrance animation.
 * @param props - Card configuration props.
 * @returns A styled card element.
 */
export function Card({
  hover = false,
  animated = false,
  padded = false,
  className = '',
  children,
  onClick,
}: CardProps) {
  const padClass = padded ? 'p-4' : '';
  const cursorClass = onClick ? 'cursor-pointer' : '';
  const classes = `${baseClasses} ${hover ? hoverClasses : ''} ${padClass} ${cursorClass} ${className}`.trim();
  const interactive = !!onClick;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const a11yProps = interactive
    ? { role: 'button' as const, tabIndex: 0, onKeyDown: handleKeyDown, 'aria-label': 'Interactive card' }
    : {};

  if (animated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={classes}
        onClick={onClick}
        {...a11yProps}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={classes} onClick={onClick} {...a11yProps}>
      {children}
    </div>
  );
}

export default Card;
