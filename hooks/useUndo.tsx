'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseUndoOptions<T> {
  /** @param onUndo - Called with the popped item when undo is triggered. */
  onUndo: (item: T) => void;
  /** @param resetOn - Auto-clear the stack when this value changes. */
  resetOn?: unknown;
  /** @param keyboard - Enable Ctrl+Z / Cmd+Z. Pass object with panelSelector for focus-scoping. */
  keyboard?: boolean | { panelSelector?: string };
}

/**
 * Generic stack-based undo hook with optional Ctrl+Z keyboard support.
 * @param opts - Configuration: onUndo callback, resetOn dependency, keyboard toggle.
 * @returns canUndo flag, push function, and undo trigger.
 */
export function useUndo<T>(opts: UseUndoOptions<T>): {
  canUndo: boolean;
  push: (item: T) => void;
  undo: () => void;
} {
  const [stack, setStack] = useState<T[]>([]);
  const stackRef = useRef(stack);
  const onUndoRef = useRef(opts.onUndo);

  useEffect(() => { stackRef.current = stack; }, [stack]);
  useEffect(() => { onUndoRef.current = opts.onUndo; }, [opts.onUndo]);

  const canUndo = stack.length > 0;

  const push = useCallback((item: T) => {
    setStack((prev) => [...prev, item]);
  }, []);

  const undo = useCallback(() => {
    const current = stackRef.current;
    if (current.length === 0) return;
    const last = current[current.length - 1];
    setStack(current.slice(0, -1));
    onUndoRef.current(last);
  }, []);

  // Auto-clear on resetOn change
  const [prevResetOn, setPrevResetOn] = useState(opts.resetOn);
  if (opts.resetOn !== prevResetOn) {
    setPrevResetOn(opts.resetOn);
    setStack([]);
  }

  // Ctrl+Z / Cmd+Z keyboard shortcut
  useEffect(() => {
    if (!opts.keyboard || !canUndo) return;

    const panelSelector =
      typeof opts.keyboard === 'object' ? opts.keyboard.panelSelector : undefined;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (panelSelector && !(e.target as HTMLElement)?.closest(panelSelector)) return;
        e.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [opts.keyboard, canUndo, undo]);

  return { canUndo, push, undo };
}

// ---------------------------------------------------------------------------
// UndoButton component
// ---------------------------------------------------------------------------

interface UndoButtonProps {
  /** @param canUndo - Whether the button should be visible. */
  canUndo: boolean;
  /** @param onUndo - Called when the button is clicked. */
  onUndo: () => void;
  /** @param className - Additional CSS classes on the wrapper. */
  className?: string;
}

/**
 * Animated undo button with consistent styling across the app.
 * @param props - Visibility flag, click handler, optional className.
 * @returns AnimatePresence-wrapped motion button, or nothing when canUndo is false.
 */
export function UndoButton({ canUndo, onUndo, className = '' }: UndoButtonProps) {
  return (
    <AnimatePresence>
      {canUndo && (
        <motion.button
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 4 }}
          transition={{ duration: 0.12 }}
          onClick={onUndo}
          className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-accent transition-colors duration-150 hover:bg-surface hover:text-accent-light ${className}`}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
            <path d="M1.5 2a.75.75 0 01.75.75v2.19l1.97-1.97a6.5 6.5 0 119.193 9.193.75.75 0 01-1.06-1.06 5 5 0 10-7.072-7.072L7.25 5.94H5a.75.75 0 010-1.5h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V7.06l-1.97 1.97A6.5 6.5 0 011.5 2z" />
          </svg>
          Undo
        </motion.button>
      )}
    </AnimatePresence>
  );
}
