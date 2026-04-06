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
}

/**
 * Custom animated checkbox with optional label.
 * @param props - Checkbox configuration props.
 * @returns A styled checkbox element.
 */
export function Checkbox({ checked, onChange, label, className = '' }: CheckboxProps) {
  return (
    <label className={`flex items-center gap-2.5 cursor-pointer select-none group min-h-[44px] ${className}`}>
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label || 'Toggle checkbox'}
        onClick={() => onChange(!checked)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          checked
            ? 'border-done bg-done'
            : 'border-border-strong bg-transparent group-hover:border-text-muted'
        }`}
        whileTap={{ scale: 0.9 }}
      >
        <motion.svg
          viewBox="0 0 12 12"
          className="h-3 w-3 text-white"
          initial={false}
          animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <path
            d="M2 6l3 3 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.button>
      {label && (
        <span className={`text-sm leading-snug ${checked ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
          {label}
        </span>
      )}
    </label>
  );
}

export default Checkbox;
