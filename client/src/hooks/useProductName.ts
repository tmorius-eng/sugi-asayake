import { useCallback } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useStoreSetting } from "@/hooks/useStoreSetting";
import { parseNameDisplayMode, productDisplayName, type NamedProduct, type ProductDisplayName } from "@shared/product-name";

/**
 * Барааны харагдах нэр (2026-09-20): `catalog-name-display` store setting +
 * зочны хэл → { primary, secondary }. Нэг л дүрэм (shared/product-name.ts),
 * карт/дэлгэрэнгүй/сагс/хайлтын санал бүгд үүгээр. Setting нь useStoreSetting-
 * ийн localStorage warm-start-тай тул refresh дээр латин→монгол анивчихгүй.
 */
export function useProductName(): (product: NamedProduct) => ProductDisplayName {
  const locale = useLocale();
  const valueFor = useStoreSetting();
  const mode = parseNameDisplayMode(valueFor("catalog-name-display", "mn"));
  return useCallback((product: NamedProduct) => productDisplayName(product, locale, mode), [locale, mode]);
}
