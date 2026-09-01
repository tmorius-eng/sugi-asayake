import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

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
 */
export function useSiteText() {
  const query = trpc.content.siteText.useQuery();
  const bySlot = useMemo(
    () => new Map((query.data ?? []).map(row => [row.slotKey, row.textValue])),
    [query.data],
  );
  return (slotKey: string, fallback: string) => bySlot.get(slotKey) || fallback;
}
