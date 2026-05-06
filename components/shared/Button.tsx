'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

/** Pixel sizing per `size` preset. Heights match prototype: sm 24, md 28, lg 36. */
const SIZES = {
  sm: { height: 24, padX: 8, font: 12 },
  md: { height: 28, padX: 10, font: 12.5 },
  lg: { height: 36, padX: 14, font: 13 },
} as const;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'copy' | 'danger';
type ButtonSize = keyof typeof SIZES;

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
  /** @param icon - Optional leading icon. */
  icon?: ReactNode;
  /** @param kbd - Optional trailing keyboard hint, rendered as a Kbd chip. */
  kbd?: ReactNode;
  /** @param fullWidth - Stretch to fill the parent's inline size. */
  fullWidth?: boolean;
}

/** Visual style values per variant. Returned as a `React.CSSProperties` object so the inline style merges cleanly with Tailwind utility classes. */
function variantStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--color-accent-grad)',
        color: '#0b0c10',
        border: '1px solid transparent',
        fontWeight: 600,
      };
    case 'secondary':
      return {
        background: 'var(--color-surface-raised)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-strong)',
        boxShadow: 'var(--shadow-button)',
        fontWeight: 500,
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid transparent',
        fontWeight: 500,
      };
    case 'copy':
      return {
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-strong)',
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
      };
    case 'danger':
      return {
        background: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',
        color: 'var(--color-danger)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)',
        fontWeight: 500,
      };
  }
}

/**
 * Animated button with variant styles, optional leading icon and trailing kbd hint.
 * @param props - Button props.
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
  icon,
  kbd,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const dims = SIZES[size];
  const radius = size === 'lg' ? 8 : 6;

  const baseStyle: React.CSSProperties = {
    height: dims.height,
    padding: `0 ${dims.padX}px`,
    fontSize: dims.font,
    borderRadius: radius,
    letterSpacing: '0.005em',
    width: fullWidth ? '100%' : undefined,
    ...variantStyle(variant),
  };

  return (
    <motion.button
      whileHover={isDisabled ? undefined : { scale: 1.01 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      aria-disabled={isDisabled || undefined}
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 transition-[background,border-color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0 ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${className}`}
      style={baseStyle}
    >
      {isLoading ? (
        <span className="flex items-center gap-1">
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
          <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : (
        <>
          {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
          <span className="inline-flex items-center whitespace-nowrap">{children}</span>
          {kbd ? <Kbd className="ml-1">{kbd}</Kbd> : null}
        </>
      )}
    </motion.button>
  );
}

export default Button;
