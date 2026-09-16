import { useSyncExternalStore } from "react";
import { LOCALES, loadTranslations, translate, type Locale } from "@shared/i18n";

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

const notify = () => listeners.forEach(listener => listener());

/**
 * Орчуулгын толийг ачаалж, дуусмагц дахин зурах (2026-09-16).
 *
 * Толь нь одоо тусдаа chunk (shared/i18n-strings.ts) — эхний ачаалалт 125 KB-аар
 * хөнгөрсөн. Хэл солиход `t()` эхний хэдэн зуун мс-д эх монгол мөрөө буцаана;
 * толь ирмэгц энэ дуудлага бүх захиалагчийг дахин зуруулна.
 */
/**
 * Толь ирэхэд зөвхөн `notify()` хийхэд ХАНГАЛТГҮЙ: хэлний утга ("en") өөрчлөгдөөгүй
 * тул `useSyncExternalStore` ижил snapshot харж, React дахин зурдаггүй — улмаас
 * DOM-ыг орчуулдаг TranslateSurface-ийн effect ([locale] хамааралтай) дахин
 * ажиллахгүй үлдэж, хуудас хагас орчуулагдсан хэвээр байв (2026-09-16-нд E2E-ээр
 * баригдсан). Тиймээс толь ирснийг өөрийнх нь дэлгүүрт (version) тэмдэглэж,
 * `useTranslationsVersion()`-оор дамжуулна.
 */
let translationsVersion = 0;
const ensureTranslations = () => {
  void loadTranslations().then(() => {
    translationsVersion += 1;
    notify();
  });
};

export const setLocale = (locale: Locale) => {
  document.documentElement.setAttribute("lang", locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private windows can refuse storage; the choice then lasts this visit.
  }
  if (locale !== "mn") ensureTranslations();
  notify();
};

// A `?lang=en` link selects the language once, exactly as the header switch
// would -- the admin editor's "view live page" link uses it, and it makes a
// shared link land in the right language (2026-09-14).
if (typeof window !== "undefined") {
  const wanted = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(wanted) && wanted !== read()) setLocale(wanted);
  // Хэрэв зочин монголоос өөр хэл сонгосон байвал (index.html-ийн эхний script
  // <html lang>-ийг аль хэдийн тавьсан) толийг НЭН ДАРУЙ, эс бөгөөс сул зуур
  // ачаална — admin-ий англиар оруулсан текстийг монгол руу буулгах урсгал ч
  // толь шаарддаг тул монгол зочинд ч эцэст нь ачаалагдана.
  if (read() !== "mn") ensureTranslations();
  else setTimeout(ensureTranslations, 2500);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, read, () => "mn" as const);
}

/** Толь ачаалагдах бүрт нэмэгддэг тоолуур — DOM-ыг дахин орчуулах effect-ийн
 *  хамаарал болгож ашиглана (дээрх тайлбарыг үз). */
export function useTranslationsVersion(): number {
  return useSyncExternalStore(subscribe, () => translationsVersion, () => 0);
}

/** `t("Дэлгүүр")` -> "Shop" / "ショップ" / "Дэлгүүр". */
export function useT(): (text: string) => string {
  const locale = useLocale();
  return (text: string) => translate(text, locale);
}
