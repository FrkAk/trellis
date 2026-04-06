/**
 * Read the current theme from localStorage.
 * @returns "light" or "dark".
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("mymir-theme") as "light" | "dark") ?? "dark";
}

/**
 * Set theme and apply to the HTML element.
 * @param theme - "light" or "dark".
 */
export function setTheme(theme: "light" | "dark") {
  if (typeof window === "undefined") return;
  localStorage.setItem("mymir-theme", theme);
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

/**
 * Initialize theme from localStorage on page load.
 */
export function initTheme() {
  if (typeof window === "undefined") return;
  const saved = localStorage.getItem("mymir-theme") as "light" | "dark" | null;
  if (saved === "light") {
    document.documentElement.classList.add("light");
  }
}
