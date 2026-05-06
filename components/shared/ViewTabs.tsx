'use client';

import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

interface ViewTab {
  /** Stable identifier returned by `onChange`. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Show a small accent pulse next to the label (e.g. agent-feed has new activity). */
  pulse?: boolean;
}

interface ViewTabsProps {
  /** @param tabs - Tab definitions. */
  tabs: ViewTab[];
  /** @param activeId - Currently active tab id. */
  activeId: string;
  /** @param onChange - Called with the next tab id on selection. */
  onChange: (id: string) => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Segmented control with bottom-border accent on the active tab.
 * Supports left/right arrow key navigation along the tablist.
 *
 * @param props - Tab definitions, controlled `activeId`, and change handler.
 * @returns A `<div role="tablist">` wrapping each tab as a `<button role="tab">`.
 */
export function ViewTabs({ tabs, activeId, onChange, className = '' }: ViewTabsProps) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.findIndex((t) => t.id === activeId);
      if (idx < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (idx - 1 + tabs.length) % tabs.length;
      }
      if (next >= 0) {
        e.preventDefault();
        const target = tabs[next];
        onChange(target.id);
        refs.current.get(target.id)?.focus();
      }
    },
    [tabs, activeId, onChange],
  );

  return (
    <div
      role="tablist"
      aria-label="View"
      className={`relative inline-flex items-center gap-0 ${className}`}
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={handleKeyDown}
            className="relative inline-flex cursor-pointer items-center gap-1.5 px-3 transition-colors"
            style={{
              height: 32,
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              background: active ? 'color-mix(in srgb, var(--color-surface-raised) 60%, transparent)' : 'transparent',
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
            }}
          >
            {tab.icon ? <span style={{ display: 'inline-flex', color: active ? 'var(--color-accent-light)' : 'currentColor' }}>{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.pulse ? (
              <span
                aria-hidden="true"
                className="status-pulse"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--color-accent)',
                }}
              />
            ) : null}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 6,
                right: 6,
                bottom: -1,
                height: 2,
                borderRadius: 2,
                background: active ? 'var(--color-accent)' : 'transparent',
                transition: 'background 140ms ease',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default ViewTabs;
