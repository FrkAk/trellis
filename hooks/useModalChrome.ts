'use client';

import { useEffect, useRef } from 'react';
import type React from 'react';

/** CSS selector matching tabbable descendants inside the dialog panel. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside the dialog panel while Tab is pressed.
 * @param event - The Tab keydown event.
 * @param panel - The panel element scoping focusable descendants.
 * @returns Nothing.
 */
function trapTabFocus(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Wires modal chrome behavior: Escape to close, Tab focus trap, and focus restore on unmount.
 * @param open - Whether the modal is currently open.
 * @param onClose - Callback invoked on Escape or backdrop click.
 * @param panelRef - Ref to the modal panel (used for focus trap bounds).
 * @returns Nothing.
 */
export function useModalChrome(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>,
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      trapTabFocus(e, panelRef.current);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose, panelRef]);
}
