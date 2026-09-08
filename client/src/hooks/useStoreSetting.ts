import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

const CACHE_KEY = "sugi-store-settings-cache-v1";

function readCachedSettingMap(): Map<string, string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return null;
  }
}

function writeCachedSettingMap(rows: { settingKey: string; settingValue: string | null }[]) {
  try {
    const record: Record<string, string> = {};
    for (const row of rows) if (row.settingValue) record[row.settingKey] = row.settingValue;
    localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing / storage full -- fine, just no warm-start next time.
  }
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase A): the
 * store_settings equivalent of useSiteText.ts's textFor() -- same
 * localStorage warm-start technique, to avoid the exact same
 * "flash-of-original-value-then-jump" bug useSiteText.ts's own comment
 * documents for the homepage (here it would be a delivery-fee number
 * jumping right after page load instead of a heading's text). The actual
 * amount charged always comes from the server's own authoritative
 * calculation in createOrderFromActiveCart (server/db.ts) regardless of
 * what this hook briefly displays, so a stale cached number is a display
 * nicety, never a billing risk.
 *
 * `valueFor(settingKey, fallback)` returns the string form of the
 * admin-saved value if one exists, else the fallback (the slot's own
 * fallbackValue from shared/store-settings.ts). Callers that need a number
 * do their own `Number(...)`, same as the server's getStoreSettingNumber.
 */
export function useStoreSetting() {
  const cached = useMemo(readCachedSettingMap, []);
  const query = trpc.content.storeSettings.useQuery();

  useEffect(() => {
    if (query.data) writeCachedSettingMap(query.data);
  }, [query.data]);

  const byKey = useMemo(() => {
    if (query.data) return new Map(query.data.map(row => [row.settingKey, row.settingValue]));
    return cached ?? new Map<string, string | null>();
  }, [query.data, cached]);

  return (settingKey: string, fallback: string) => byKey.get(settingKey) || fallback;
}
