import { useState } from "react";
import { LoaderCircle, Minus, Plus, Search, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

/**
 * The line-item editor shared by the staff "manual order" form and the
 * order edit form (2026-09-14). Searches by name or barcode through the same
 * admin.posSearchVariants lookup the register uses (scoped to the online
 * fulfilment branch so the shelf count shown is the one the order draws
 * from), and keeps a small list of {variantId, quantity} lines.
 */
export type ComposerLine = { variantId: number; productName: string; sku: string; priceMnt: number; quantity: number };

const input = "h-10 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]";

export default function OrderLineComposer({ branchId, lines, onChange, disabled }: { branchId: number | null; lines: ComposerLine[]; onChange: (lines: ComposerLine[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState("");
  const searchQuery = trpc.admin.posSearchVariants.useQuery({ branchId: branchId ?? 0, search }, { enabled: branchId !== null && search.trim().length >= 2 });
  const add = (row: { variantId: number; productName: string; sku: string; priceMnt: number }) => {
    const existing = lines.find(line => line.variantId === row.variantId);
    onChange(existing ? lines.map(line => line.variantId === row.variantId ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { ...row, quantity: 1 }]);
    setSearch("");
  };
  const setQuantity = (variantId: number, quantity: number) => onChange(lines.map(line => line.variantId === variantId ? { ...line, quantity: Math.max(1, quantity) } : line));
  const remove = (variantId: number) => onChange(lines.filter(line => line.variantId !== variantId));
  const subtotal = lines.reduce((sum, line) => sum + line.priceMnt * line.quantity, 0);
  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-xs font-bold">Бараа нэмэх (нэр эсвэл баркод)
        <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-3 text-[var(--a-muted)]" /><input value={search} onChange={event => setSearch(event.target.value)} disabled={disabled || branchId === null} placeholder="Хайх…" className={`${input} w-full pl-9`} /></div>
      </label>
      {search.trim().length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--a-border)] bg-[var(--a-card)]">
          {searchQuery.isLoading ? <p className="flex items-center gap-2 p-3 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Хайж байна…</p>
            : (searchQuery.data ?? []).length === 0 ? <p className="p-3 text-xs text-[var(--a-muted)]">Олдсонгүй.</p>
            : (searchQuery.data ?? []).map(row => (
              <button key={row.variantId} type="button" onClick={() => add(row)} className="flex w-full items-center justify-between gap-3 border-b border-[var(--a-border)] px-3 py-2 text-left text-xs last:border-0 hover:bg-[var(--a-soft)]">
                <span className="min-w-0"><strong className="block truncate">{row.productName}</strong><span className="text-[var(--a-muted)]">{row.sku} · нөөц {row.stockAtBranch}</span></span>
                <span className="shrink-0 font-bold">{formatMnt(row.priceMnt)}</span>
              </button>
            ))}
        </div>
      )}
      {lines.length > 0 && (
        <ul className="grid gap-2">
          {lines.map(line => (
            <li key={line.variantId} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--a-soft)] px-3 py-2 text-xs">
              <span className="min-w-0 flex-1"><strong className="block truncate">{line.productName}</strong><span className="text-[var(--a-muted)]">{line.sku} · {formatMnt(line.priceMnt)}</span></span>
              <span className="inline-flex items-center rounded-full border border-[var(--a-border)] bg-[var(--a-card)]">
                <button type="button" disabled={disabled} onClick={() => setQuantity(line.variantId, line.quantity - 1)} aria-label="Тоо хасах" className="grid size-8 place-items-center"><Minus size={12} /></button>
                <input type="number" min={1} value={line.quantity} disabled={disabled} onChange={event => setQuantity(line.variantId, Number(event.target.value) || 1)} className="w-12 bg-transparent text-center text-sm font-bold outline-none" aria-label="Тоо" />
                <button type="button" disabled={disabled} onClick={() => setQuantity(line.variantId, line.quantity + 1)} aria-label="Тоо нэмэх" className="grid size-8 place-items-center"><Plus size={12} /></button>
              </span>
              <strong className="w-24 text-right">{formatMnt(line.priceMnt * line.quantity)}</strong>
              <button type="button" disabled={disabled} onClick={() => remove(line.variantId)} aria-label="Мөр хасах" className="grid size-8 place-items-center rounded-full text-[#df1f3d] hover:bg-[var(--a-neg-soft)]"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-right text-xs font-bold">Барааны дүн: {formatMnt(subtotal)}</p>
    </div>
  );
}
