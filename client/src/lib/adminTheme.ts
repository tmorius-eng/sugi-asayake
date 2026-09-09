import { useSyncExternalStore } from "react";

/**
 * Admin-only light/dark theme (2026-09-08 — Tom: "baihgui features … jisheen
 * dark mode").
 *
 * Deliberately separate from the storefront's ThemeContext: that one is
 * constructed with switchable=false and defaultTheme="light" because the shop
 * has a single, deliberate warm-cream identity. The admin panel is a tool
 * people stare at all day, so it gets its own switch — and its own storage
 * key, so flipping the admin to dark can never darken the customer-facing
 * site.
 *
 * A module-level store read through useSyncExternalStore rather than a React
 * context: the toggle lives in the top bar, the attribute lives on the shell
 * root, and the chart components need the value too — a provider would have
 * to be threaded through all three, while this is importable anywhere under
 * /admin with no wiring at all.
 */
export type AdminTheme = "light" | "dark";

const STORAGE_KEY = "sugi-admin-theme";

function readStored(): AdminTheme {
  // Wrapped: localStorage throws outright in some embedded/privacy contexts,
  // and an admin panel that refuses to render because of a theme preference
  // would be a genuinely bad trade.
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let currentTheme: AdminTheme = typeof window === "undefined" ? "light" : readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAdminTheme(theme: AdminTheme): void {
  if (theme === currentTheme) return;
  currentTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Preference simply doesn't persist across reloads — the toggle still
    // works for this session.
  }
  // forEach, not for..of: this project's tsconfig target predates
  // downlevelIteration, so iterating a Set directly doesn't compile.
  listeners.forEach(listener => listener());
}

export function toggleAdminTheme(): void {
  setAdminTheme(currentTheme === "dark" ? "light" : "dark");
}

export function useAdminTheme(): AdminTheme {
  return useSyncExternalStore(subscribe, () => currentTheme, () => "light" as AdminTheme);
}
