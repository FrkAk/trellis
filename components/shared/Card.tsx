'use client';

import { motion } from 'motion/react';
import { type ReactNode, type KeyboardEvent } from 'react';

interface CardProps {
  /** @param hover - Enable glow hover effect. */
  hover?: boolean;
  /** @param animated - Enable entrance animation. */
  animated?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
  /** @param children - Card content. */
  children: ReactNode;
  /** @param onClick - Click handler. */
  onClick?: () => void;
}

const baseClasses =
  'bg-surface border border-border rounded-xl transition-colors';

const hoverClasses = 'hover:border-border-strong glow-card';

/**
 * Card container with optional glow hover and entrance animation.
 * @param props - Card configuration props.
 * @returns A styled card element.
 */
export function Card({
  hover = false,
  animated = false,
  className = '',
  children,
  onClick,
}: CardProps) {
  const classes = `${baseClasses} ${hover ? hoverClasses : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`;
  const interactive = !!onClick;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const a11yProps = interactive ? { role: 'button' as const, tabIndex: 0, onKeyDown: handleKeyDown, 'aria-label': 'Interactive card' } : {};

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
