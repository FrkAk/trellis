'use client';

import { motion } from 'motion/react';

interface CheckboxProps {
  /** @param checked - Whether the checkbox is checked. */
  checked: boolean;
  /** @param onChange - Called when the checked state changes. */
  onChange: (checked: boolean) => void;
  /** @param label - Optional text label beside the checkbox. */
  label?: string;
  /** @param className - Additional CSS classes. */
  className?: string;
  /** @param size - Visual size in pixels. Defaults to 16. */
  size?: 14 | 16 | 18;
}

/**
 * Custom animated checkbox with optional label. Filled state uses the brand accent gradient.
 * @param props - Checkbox configuration props.
 * @returns A styled checkbox element.
 */
export function Checkbox({ checked, onChange, label, className = '', size = 16 }: CheckboxProps) {
  return (
    <label className={`group inline-flex cursor-pointer select-none items-center gap-2 ${className}`}>
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label || 'Toggle checkbox'}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        whileTap={{ scale: 0.92 }}
        className="inline-flex shrink-0 items-center justify-center rounded-[5px] transition-colors"
        style={{
          width: size,
          height: size,
          background: checked ? 'var(--color-accent-grad)' : 'transparent',
          border: checked ? '1px solid transparent' : '1.5px solid var(--color-border-strong)',
        }}
      >
        <motion.svg
          viewBox="0 0 12 12"
          width={Math.round(size * 0.7)}
          height={Math.round(size * 0.7)}
          initial={false}
          animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          aria-hidden="true"
        >
          <path
            d="M2 6l3 3 5-5"
            fill="none"
            stroke="#0b0c10"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.button>
      {label ? (
        <span
          className="text-sm leading-snug transition-colors"
          style={{
            color: checked ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            textDecoration: checked ? 'line-through' : undefined,
          }}
        >
          {label}
        </span>
      ) : null}
    </label>
  );
}

export default Checkbox;
