import { useState } from "react";
import { LoaderCircle, Store } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// "Controls everything" admin overhaul (2026-09-08, Phase L): the per-branch
// stock editor -- expanded inline under a variant row in
// AdminProductVariantsPanel.tsx. The variant composer's own "Үлдэгдэл"
// field stays the quick single-number edit (sugar over the fulfillment-
// default branch, see server/db.ts's setFulfillmentBranchStock) for admins
// who don't need the distinction; this is for the admin who actually wants
// to move stock between specific branches (e.g. after a physical count, or
// moving inventory from the warehouse to a storefront).
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

export default function AdminBranchStockEditor({ variantId }: { variantId: number }) {
  const utils = trpc.useUtils();
  const stockQuery = trpc.admin.branchStock.useQuery({ variantId });
  const setStock = trpc.admin.setBranchStock.useMutation();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingBranchId, setSavingBranchId] = useState<number | null>(null);

  const rows = stockQuery.data ?? [];

  const save = async (branchId: number) => {
    const raw = drafts[branchId];
    const quantity = raw === undefined ? undefined : Number(raw);
    if (quantity === undefined || Number.isNaN(quantity) || quantity < 0) { toast.error("Тоо буруу байна."); return; }
    setSavingBranchId(branchId);
    try {
      await setStock.mutateAsync({ branchId, variantId, quantity });
      toast.success("Салбарын үлдэгдэл шинэчлэгдлээ.");
      utils.admin.branchStock.invalidate({ variantId });
      // The aggregate shown elsewhere (variant list, product list) just
      // changed too -- invalidate the queries that read it so the admin
      // doesn't see a stale total after closing this editor.
      utils.admin.productVariants.invalidate();
      utils.admin.products.invalidate();
      setDrafts(current => { const next = { ...current }; delete next[branchId]; return next; });
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingBranchId(null);
    }
  };

  if (stockQuery.isLoading) return <p className="mt-2 flex items-center gap-2 text-[11px] text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={12} />Уншиж байна…</p>;
  if (!rows.length) return <p className="mt-2 text-[11px] text-[var(--a-faint)]">Идэвхтэй салбар алга.</p>;

  return (
    <div className="mt-2 grid gap-1.5 rounded-xl bg-[var(--a-soft)] p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.08em] text-[var(--a-text-soft)]"><Store size={12} />САЛБАР ТУС БҮРИЙН ҮЛДЭГДЭЛ</p>
      {rows.map(row => {
        const draft = drafts[row.branchId] ?? String(row.stockQuantity);
        const isDirty = draft !== String(row.stockQuantity);
        return (
          <div key={row.branchId} className="flex items-center gap-2 rounded-lg bg-[var(--a-card)] px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{row.branchName}{row.isFulfillmentDefault && <span className="ml-1 text-[9px] font-extrabold text-[#f0b52d]">★ ҮНДСЭН</span>}</span>
            <input
              type="number" min="0" value={draft}
              onChange={event => setDrafts(current => ({ ...current, [row.branchId]: event.target.value }))}
              className="h-8 w-20 shrink-0 rounded-md border border-[var(--a-border)] px-2 text-right text-xs outline-none focus:border-[#3970a7]"
            />
            <button
              type="button" disabled={!isDirty || savingBranchId === row.branchId}
              onClick={() => save(row.branchId)}
              className="shrink-0 rounded-md bg-[#3970a7] px-2.5 py-1.5 text-[10px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingBranchId === row.branchId ? <LoaderCircle className="animate-spin" size={11} /> : "Хадгалах"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
