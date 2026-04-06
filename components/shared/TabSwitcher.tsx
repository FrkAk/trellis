'use client';

import { motion } from 'motion/react';
import { useRef, useCallback } from 'react';

interface Tab {
  id: string;
  label: string;
  glow?: boolean;
}

interface TabSwitcherProps {
  /** @param tabs - Array of tab definitions. */
  tabs: Tab[];
  /** @param activeTab - Currently active tab id. */
  activeTab: string;
  /** @param onTabChange - Called when a tab is selected. */
  onTabChange: (id: string) => void;
  /** @param trailing - Optional element rendered at the end of the tab bar. */
  trailing?: React.ReactNode;
  /** @param stretch - When true, tabs expand equally to fill available width. */
  stretch?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Horizontal pill tab selector with animated sliding indicator.
 * @param props - Tab switcher configuration.
 * @returns A styled tab switcher element.
 */
export function TabSwitcher({ tabs, activeTab, onTabChange, trailing, stretch, className = '' }: TabSwitcherProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.findIndex((t) => t.id === activeTab);
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = (idx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = (idx - 1 + tabs.length) % tabs.length;
      }
      if (next >= 0) {
        onTabChange(tabs[next].id);
        tabRefs.current.get(tabs[next].id)?.focus();
      }
    },
    [tabs, activeTab, onTabChange],
  );

  return (
    <div role="tablist" aria-label="Tab navigation" className={`flex items-center gap-1 rounded-lg bg-surface-raised p-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => { if (el) tabRefs.current.set(tab.id, el); }}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={handleKeyDown}
          className={`relative cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9 ${stretch ? 'flex-1' : ''} ${
            activeTab === tab.id ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute inset-0 rounded-md bg-surface-raised"
              style={{ zIndex: -1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {tab.label}
          {tab.glow && activeTab !== tab.id && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent animate-pulse" />
          )}
        </button>
      ))}
      {trailing}
    </div>
  );
}

export default TabSwitcher;
