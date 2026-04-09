'use client';

import { createContext, useContext, useSyncExternalStore, useCallback } from 'react';
import { subscribeTheme, getTheme, setTheme as applyTheme } from '@/lib/theme';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  /** @returns Current theme. */
  theme: Theme;
  /** @param next - Toggle or set theme. */
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
});

interface ThemeProviderProps {
  /** @param initialTheme - Server-resolved theme from cookie. */
  initialTheme: Theme;
  /** @param children - App content. */
  children: React.ReactNode;
}

/**
 * Provides theme state via context. Uses useSyncExternalStore so the server
 * snapshot (from cookie) matches the SSR output, eliminating hydration mismatch.
 * @param props - Initial theme from server + children.
 * @returns Context provider wrapping children.
 */
export function ThemeProvider({ initialTheme, children }: ThemeProviderProps) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => initialTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  return (
    <ThemeContext value={{ theme, setTheme }}>
      {children}
    </ThemeContext>
  );
}

/**
 * Read current theme and setter from context.
 * @returns Theme value and setter function.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
