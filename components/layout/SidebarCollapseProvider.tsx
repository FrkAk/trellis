'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** localStorage key for the sidebar collapsed-state preference. */
const STORAGE_KEY = 'mymir:sidebar-collapsed';

interface SidebarCollapseValue {
  /** Whether the sidebar is currently collapsed to its icon-only rail. */
  collapsed: boolean;
  /** Flip the collapsed state. */
  toggle: () => void;
  /** Force the collapsed state. */
  setCollapsed: (next: boolean) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

/**
 * Read the persisted collapsed-state preference with a safe SSR fallback.
 *
 * @returns `true` when the sidebar should start collapsed.
 */
function readInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface SidebarCollapseProviderProps {
  /** @param children - Subtree that can read/update the collapsed state. */
  children: ReactNode;
}

/**
 * Client provider exposing the sidebar collapse toggle to any descendant.
 * Mounted by the (server) {@link AppShell} so the {@link Sidebar} chevron
 * and the in-canvas fold button stay in sync without explicit prop drilling.
 * Persists to `localStorage` so the preference survives navigation.
 *
 * @param props - Provider configuration.
 * @returns Context provider element.
 */
export function SidebarCollapseProvider({ children }: SidebarCollapseProviderProps) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => readInitialCollapsed());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* swallow storage errors — preference is non-critical */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsedState((c) => !c), []);
  const setCollapsed = useCallback((next: boolean) => setCollapsedState(next), []);

  return (
    <SidebarCollapseContext value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarCollapseContext>
  );
}

/**
 * Read the current sidebar collapse state. Returns a default expanded state
 * with no-op handlers when the hook is called outside the provider so the
 * Sidebar (and any consumer) can render safely on auth pages without a shell.
 *
 * @returns Collapse state + handlers.
 */
export function useSidebarCollapse(): SidebarCollapseValue {
  const ctx = useContext(SidebarCollapseContext);
  if (ctx) return ctx;
  return { collapsed: false, toggle: () => {}, setCollapsed: () => {} };
}
