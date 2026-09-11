import { useSyncExternalStore } from "react";

/**
 * Whether the /admin help panels are shown (2026-09-12).
 *
 * Tom, after seeing Bitrix24's onboarding popovers: "анх удаа нэвтэрч байгаа
 * хүн … бас энэ дээр нь useful tips on/off болгодог тохиргоо байвал амар юм
 * байна". So the help is ON by default -- a first-time staff member should
 * not have to discover a setting to get help -- and one click turns it off
 * for good.
 *
 * Per-browser via localStorage rather than a column on `users` or a row in
 * `store_settings`, for two reasons: it is a personal preference (the owner
 * turning tips off must not hide them from a new hire on the shop computer),
 * and it needs to apply instantly with no round trip. Same module-level
 * store read through useSyncExternalStore as adminTheme.ts, for the same
 * reason given there -- the toggle lives in the top bar while the panels
 * live inside every section, and a context would have to be threaded
 * through both.
 */
const STORAGE_KEY = "sugi-admin-tips";

function readStored(): boolean {
  // Wrapped: localStorage throws outright in some embedded/privacy contexts,
  // and help text is the last thing that should be able to break the panel.
  try {
    // Anything other than an explicit "off" means on, so a brand-new browser
    // (no key at all) gets the tips.
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

let tipsEnabled: boolean = typeof window === "undefined" ? true : readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAdminTipsEnabled(enabled: boolean): void {
  if (enabled === tipsEnabled) return;
  tipsEnabled = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Preference simply doesn't persist across reloads — the toggle still
    // works for this session.
  }
  // forEach, not for..of: this project's tsconfig target predates
  // downlevelIteration, so iterating a Set directly doesn't compile.
  listeners.forEach(listener => listener());
}

export function toggleAdminTips(): void {
  setAdminTipsEnabled(!tipsEnabled);
}

export function useAdminTipsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => tipsEnabled, () => true);
}
