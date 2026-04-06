'use client';

import { motion } from 'motion/react';
import { type ReactNode } from 'react';

/** Button size presets. */
const sizes = {
  sm: 'px-3 py-1.5 text-xs min-h-9',
  md: 'px-4 py-2 text-sm min-h-10',
  lg: 'px-6 py-3 text-base min-h-11',
} as const;

/** Button variant style maps. */
const variants = {
  primary:
    'bg-gradient-to-r from-accent to-accent-light text-white font-semibold hover:brightness-110',
  secondary:
    'bg-surface-raised text-text-primary/80 border border-border-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
  copy: 'font-mono border border-border-strong hover:border-accent text-text-secondary text-xs',
} as const;

type ButtonVariant = keyof typeof variants;
type ButtonSize = keyof typeof sizes;

interface ButtonProps {
  /** @param variant - Visual style of the button. */
  variant?: ButtonVariant;
  /** @param size - Size preset. */
  size?: ButtonSize;
  /** @param disabled - Whether the button is disabled. */
  disabled?: boolean;
  /** @param isLoading - Show loading dots and disable interaction. */
  isLoading?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
  /** @param children - Button content. */
  children: ReactNode;
  /** @param onClick - Click handler. */
  onClick?: () => void;
  /** @param type - HTML button type attribute. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Animated button with variant styles.
 * @param props - Button props including variant, size, and standard button attributes.
 * @returns A motion-animated button element.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  isLoading,
  className = '',
  children,
  onClick,
  type = 'button',
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      aria-disabled={isDisabled || undefined}
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-[--radius-md] transition-colors ${variants[variant]} ${sizes[size]} ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {isLoading ? (
        <span className="flex items-center gap-1">
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : children}
    </motion.button>
  );
}

export default Button;
