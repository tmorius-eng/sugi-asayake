import { useSyncExternalStore } from "react";
import { sanitizeHomeLayout, type HomeSectionEntry } from "@shared/home-sections";
import { bootstrapSlice } from "./bootstrap";

/**
 * Нүүрний хэсгийн дараалал (Брэнд студи A3, 2026-10-05). Сервер `#storefront-bootstrap`-д `layout`
 * өгнө (indexHtml.ts); Брэнд студийн iframe preview нь `setHomeLayoutPreview`-ээр түр сольдог
 * (BrandPreviewBridge) — reload-гүй дахин эрэмбэлнэ. Энгийн зочинд бол хуудас ачаалах бүрт тогтмол.
 */
let current: HomeSectionEntry[] = sanitizeHomeLayout(bootstrapSlice<unknown>("layout")?.data);
const listeners = new Set<() => void>();

export function setHomeLayoutPreview(layout: unknown) {
  current = sanitizeHomeLayout(layout);
  listeners.forEach(listener => listener());
}

export function useHomeLayout(): HomeSectionEntry[] {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => current,
  );
}
