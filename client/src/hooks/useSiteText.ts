import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

const CACHE_KEY = "sugi-site-text-cache-v1";

function readCachedSlotMap(): Map<string, string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return null;
  }
}

function writeCachedSlotMap(rows: { slotKey: string; textValue: string | null }[]) {
  try {
    const record: Record<string, string> = {};
    for (const row of rows) if (row.textValue) record[row.slotKey] = row.textValue;
    localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing / storage full -- fine, just no warm-start next time.
  }
}

/**
 * Text-equivalent of Home.tsx's imageFor() helper -- see shared/site-text.ts
 * for the full slot registry. Called directly inside each homepage section
 * component (rather than resolved once in Home.tsx and prop-drilled) since
 * several sections live in their own files; trpc.content.siteText.useQuery()
 * is deduped by react-query, so calling this in multiple components costs
 * one network request, not one per component.
 *
 * `textFor(slotKey, fallback)` returns the admin-saved value for that slot
 * if one exists, otherwise the fallback (which should always be the slot's
 * own `fallbackValue` from shared/site-text.ts, the current real copy).
 *
 * 2026-09-07 real bug, found live (Tom's own refresh, two screenshots a few
 * seconds apart showing DIFFERENT heading text): on every fresh page load,
 * `query.data` is undefined until the network request resolves, so
 * textFor() falls back to each slot's hardcoded fallbackValue for that
 * first render -- normally invisible since fallbackValue mirrors the site's
 * real current copy, but once an admin overrides a slot away from its
 * fallback (home-text-cat-heading has been "Япон бараа\nүндсэн ангилал."
 * in the DB since 2026-09-01, not the fallback's "Японы бүтээгдэхүүний..."),
 * every refresh visibly flashed the ORIGINAL text before snapping to the
 * saved edit a moment later. Warm-starting from the last successful
 * response (cached in localStorage -- a per-viewer convenience, never
 * shared/authoritative, same class of use as Shop.tsx's grid-density and
 * recently-viewed caches) eliminates the flash for anyone who has loaded
 * the site before in this browser; a genuinely first-ever visit still shows
 * one unavoidable flash (no SSR here to avoid it entirely).
 */
export function useSiteText() {
  const cached = useMemo(readCachedSlotMap, []);
  const query = trpc.content.siteText.useQuery();

  useEffect(() => {
    if (query.data) writeCachedSlotMap(query.data);
  }, [query.data]);

  const bySlot = useMemo(() => {
    if (query.data) return new Map(query.data.map(row => [row.slotKey, row.textValue]));
    return cached ?? new Map<string, string | null>();
  }, [query.data, cached]);

  return (slotKey: string, fallback: string) => bySlot.get(slotKey) || fallback;
}
