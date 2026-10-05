import { useSyncExternalStore } from "react";
import { isHolidayEffect, isHolidayOrnament, type HolidayEffect, type HolidayOrnament } from "@shared/holiday-decor";
import { storefrontThemeInfo } from "./bootstrap";

/**
 * Баярын чимэглэл (Брэнд студи A4, 2026-10-05) — сервер bootstrap-ийн `theme.effect/ornament`-оор
 * өгнө; Брэнд студийн iframe preview `setHolidayDecorPreview`-ээр түр сольдог (BrandPreviewBridge).
 */
type Decor = { effect: HolidayEffect; ornament: HolidayOrnament };
const info = storefrontThemeInfo();
let current: Decor = { effect: isHolidayEffect(info?.effect) ? info.effect : "none", ornament: isHolidayOrnament(info?.ornament) ? info.ornament : "none" };
const listeners = new Set<() => void>();

export function setHolidayDecorPreview(effect: unknown, ornament: unknown) {
  current = { effect: isHolidayEffect(effect) ? effect : "none", ornament: isHolidayOrnament(ornament) ? ornament : "none" };
  listeners.forEach(listener => listener());
}

export function useHolidayDecor(): Decor {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => current,
  );
}
