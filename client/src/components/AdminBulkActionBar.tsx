import type { ReactNode } from "react";

// TIER 5: shared bulk-action bar for the products/orders admin tables —
// appears once at least one row is checkbox-selected.
export default function AdminBulkActionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#17181b] px-4 py-3 text-white">
      <span className="text-xs font-bold">{count} сонгосон</span>
      <div className="flex flex-wrap gap-2">{children}</div>
      <button type="button" onClick={onClear} className="ml-auto text-xs font-bold text-white/60 transition hover:text-white">Сонголт цуцлах</button>
    </div>
  );
}
