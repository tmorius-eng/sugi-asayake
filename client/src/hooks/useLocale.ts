import { useSyncExternalStore } from "react";
import { LOCALES, translate, type Locale } from "@shared/i18n";

/**
 * The storefront's language (2026-09-12). Same shape as
 * useStorefrontTheme: a module-level store, the choice kept in
 * localStorage, and the document's own `lang` attribute updated so a screen
 * reader, the browser's translate prompt and search engines all agree with
 * what is on screen.
 *
 * See shared/i18n.ts for what is and is not translated.
 */
const STORAGE_KEY = "sugi-locale";
const listeners = new Set<() => void>();

const isLocale = (value: string | null): value is Locale => !!value && (LOCALES as readonly string[]).includes(value);

const read = (): Locale => {
  if (typeof document === "undefined") return "mn";
  const attr = document.documentElement.getAttribute("lang");
  return isLocale(attr) ? attr : "mn";
};

export const setLocale = (locale: Locale) => {
  document.documentElement.setAttribute("lang", locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private windows can refuse storage; the choice then lasts this visit.
  }
  listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, read, () => "mn" as const);
}

/** `t("Дэлгүүр")` -> "Shop" / "ショップ" / "Дэлгүүр". */
export function useT(): (text: string) => string {
  const locale = useLocale();
  return (text: string) => translate(text, locale);
}
