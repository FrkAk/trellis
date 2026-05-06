'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconCheck, IconChevronDown } from '@/components/shared/icons';

export interface DropdownOption<V extends string = string> {
  /** Option value — what gets passed to onChange. */
  value: V;
  /** Visible label. */
  label: string;
  /** Optional leading visual (status glyph, swatch, etc.). */
  leading?: React.ReactNode;
  /** Optional trailing visual (count chip, kbd, etc.). */
  trailing?: React.ReactNode;
  /** When true, the option is disabled. */
  disabled?: boolean;
}

interface DropdownProps<V extends string> {
  /** Currently selected value. */
  value: V;
  /** Available options. */
  options: ReadonlyArray<DropdownOption<V>>;
  /** Update the selected value. */
  onChange: (next: V) => void;
  /** Trigger renderer — receives the currently selected option. */
  renderTrigger: (option: DropdownOption<V> | undefined, open: boolean) => React.ReactNode;
  /** Match panel width to trigger when true; defaults to false (intrinsic). */
  matchTriggerWidth?: boolean;
  /** Panel anchor — defaults to `start` (left edge of the trigger). */
  align?: 'start' | 'end';
  /** Optional minimum panel width in px. */
  minWidth?: number;
  /** Optional native title for the trigger. */
  title?: string;
  /** Aria label for the trigger button. */
  ariaLabel?: string;
}

/**
 * Anchored dropdown — single-select. The trigger is fully owned by the
 * caller via `renderTrigger`, so the same primitive serves status pills,
 * filter chips, and rail rows without forcing a single appearance.
 *
 * @param props - Dropdown configuration.
 * @returns Trigger button plus animated panel.
 */
export function Dropdown<V extends string>({
  value,
  options,
  onChange,
  renderTrigger,
  matchTriggerWidth = false,
  align = 'start',
  minWidth = 160,
  title,
  ariaLabel,
}: DropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !matchTriggerWidth || !triggerRef.current) return;
    setWidth(triggerRef.current.getBoundingClientRect().width);
  }, [open, matchTriggerWidth]);

  const active = options.find((o) => o.value === value);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className="cursor-pointer outline-none"
      >
        {renderTrigger(active, open)}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.11, ease: 'easeOut' }}
            className="absolute top-full z-30 mt-1 max-h-[280px] overflow-y-auto rounded-md border border-border-strong bg-surface-raised py-1 shadow-float"
            style={{
              width: matchTriggerWidth && width ? width : undefined,
              minWidth,
              [align === 'end' ? 'right' : 'left']: 0,
            }}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                    selected
                      ? 'bg-accent/10 text-accent-light'
                      : option.disabled
                        ? 'text-text-faint cursor-not-allowed'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {option.leading && <span aria-hidden="true" className="inline-flex shrink-0">{option.leading}</span>}
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.trailing}
                  {selected && (
                    <span aria-hidden="true" className="text-accent-light">
                      <IconCheck size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export { IconChevronDown };
