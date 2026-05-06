'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** @param children - Icon element to render. */
  children: ReactNode;
  /** @param label - Required accessible label (becomes aria-label and title). */
  label: string;
  /** @param variant - Visual style. */
  variant?: 'ghost' | 'secondary';
  /** @param size - Square button size in pixels. Defaults to 28. */
  size?: 24 | 28 | 32;
  /** @param active - Force the active (pressed) state. */
  active?: boolean;
}

/**
 * Square icon-only button. Pairs with the icon set in `icons.tsx`.
 * @param props - IconButton configuration. `label` is required for accessibility.
 * @returns A square `<button>` element with the supplied icon centred.
 */
export function IconButton({
  children,
  label,
  variant = 'ghost',
  size = 28,
  active = false,
  className = '',
  ...rest
}: IconButtonProps) {
  const isGhost = variant === 'ghost';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${className}`}
      style={{
        width: size,
        height: size,
        background: active
          ? 'var(--color-surface-hover)'
          : isGhost
            ? 'transparent'
            : 'var(--color-surface-raised)',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        border: isGhost ? '1px solid transparent' : '1px solid var(--color-border-strong)',
        boxShadow: isGhost ? undefined : 'var(--shadow-button)',
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = 'var(--color-surface-hover)';
        e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = isGhost ? 'transparent' : 'var(--color-surface-raised)';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export default IconButton;
