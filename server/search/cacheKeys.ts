/**
 * Хайлтын кэшийн түлхүүрүүд (2026-09-20) — импортгүй жижиг модуль, учир нь
 * server/db.ts (бараа бичигчид үүнийг хүчингүй болгодог) ба server/search/*
 * (db.ts-ээс уншдаг) хоёр хоорондоо тойрог үүсгэхгүйн тулд.
 */
export const CATALOG_INDEX_CACHE_KEY = "storefront:catalogIndex";
export const SEARCH_SYNONYMS_CACHE_KEY = "storefront:searchSynonyms";
export const BRAND_ALIASES_CACHE_KEY = "storefront:brandAliases";
