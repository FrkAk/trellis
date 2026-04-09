const COOKIE_NAME = "mymir-theme";
const listeners = new Set<() => void>();

/**
 * Subscribe to theme changes. Compatible with useSyncExternalStore.
 * @param callback - Invoked when the theme changes.
 * @returns Unsubscribe function.
 */
export function subscribeTheme(callback: () => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

/**
 * Read the current theme from localStorage.
 * @returns "light" or "dark".
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(COOKIE_NAME) as "light" | "dark") ?? "dark";
}

/**
 * Set theme, persist to localStorage + cookie, apply to DOM, and notify subscribers.
 * @param theme - "light" or "dark".
 */
export function setTheme(theme: "light" | "dark") {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIE_NAME, theme);
  document.cookie = `${COOKIE_NAME}=${theme};path=/;max-age=31536000;SameSite=Lax`;
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
  listeners.forEach((cb) => cb());
}

