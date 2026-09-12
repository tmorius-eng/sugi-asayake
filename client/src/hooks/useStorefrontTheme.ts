import { useSyncExternalStore } from "react";

/**
 * The storefront's light/dark switch (2026-09-12, Tom: "dark theme on off
 * bolgodog bolgo, headeriin tend button nem").
 *
 * Deliberately NOT the existing ThemeContext, which toggles the `.dark`
 * class: that class drives every Tailwind `dark:` utility in the codebase,
 * including the ones inside /admin, so flipping it from the storefront would
 * repaint the admin panel too. This sets its own attribute on <html>, and
 * every dark rule is written under `[data-storefront-theme="dark"]`, which
 * only ever matches storefront markup.
 *
 * The first paint is handled by client/public/vendor/theme-init.js, which
 * sets the same attribute before React boots -- otherwise a shopper who
 * chose dark would get a white flash on every page load. index.html may not
 * carry inline scripts (CSP `script-src 'self'`), hence the separate file.
 */
export type StorefrontTheme = "light" | "dark";

const STORAGE_KEY = "sugi-storefront-theme";
const listeners = new Set<() => void>();

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

const read = (): StorefrontTheme => {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-storefront-theme");
  if (attr === "dark" || attr === "light") return attr;
  return systemPrefersDark() ? "dark" : "light";
};

const apply = (theme: StorefrontTheme) => {
  document.documentElement.setAttribute("data-storefront-theme", theme);
  // Native form controls, scrollbars and the like follow this.
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A private window can refuse storage; the choice then lasts for this
    // page only, which is better than throwing on a click.
  }
  listeners.forEach(listener => listener());
};

export const setStorefrontTheme = (theme: StorefrontTheme) => apply(theme);

export const toggleStorefrontTheme = () => apply(read() === "dark" ? "light" : "dark");

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useStorefrontTheme(): StorefrontTheme {
  return useSyncExternalStore(subscribe, read, () => "light" as const);
}
