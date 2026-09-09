import { Ellipsis, LoaderCircle, Lock, Package } from "lucide-react";

/**
 * The reference's "Most Selling Products" card -- thumbnail, name, an ID line,
 * and a sales-count pill on the right.
 *
 * The reference shows "ID: 2441310"; the equivalent real identifier here is
 * the SKU, which is what staff actually search and scan by, so that's what
 * this prints (labelled SKU, not relabelled as "ID").
 */
export type TopProductRow = {
  productId: number | null;
  productName: string;
  sku: string;
  imageUrl: string | null;
  slug: string | null;
  soldQuantity: number;
  revenueMnt: number;
};

export default function AdminTopProductsCard({ rows, loading, locked, onSelect, onOpenAll }: {
  rows: TopProductRow[];
  loading: boolean;
  locked: boolean;
  onSelect: (sku: string) => void;
  onOpenAll: () => void;
}) {
  return (
    <section className="admin-card admin-card-hover flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Их зарагдсан бүтээгдэхүүн</h3>
        <button type="button" onClick={onOpenAll} className="shrink-0 rounded-lg p-1.5 text-[var(--a-faint)] transition hover:bg-[var(--a-soft)] hover:text-[var(--a-text)]" title="Бүх бүтээгдэхүүн" aria-label="Бүх бүтээгдэхүүн рүү очих"><Ellipsis size={17} /></button>
      </div>

      {locked ? (
        <p className="flex flex-1 items-center justify-center gap-1.5 py-12 text-sm font-bold text-[var(--a-faint)]"><Lock size={14} aria-hidden="true" />Зөвхөн санхүү/админд</p>
      ) : loading ? (
        <p className="flex flex-1 items-center justify-center gap-2 py-12 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-12 text-center text-xs text-[var(--a-muted)]">Энэ хугацаанд төлөгдсөн захиалга алга.</p>
      ) : (
        <ul className="admin-stagger mt-4 grid gap-1">
          {rows.map(row => (
            <li key={`${row.productId ?? "gone"}-${row.sku}`}>
              <button
                type="button"
                onClick={() => onSelect(row.sku)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--a-soft)]"
              >
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--a-soft)]">
                  {row.imageUrl
                    ? <img src={row.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                    : <Package size={17} className="text-[var(--a-faint)]" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[var(--a-text)]">{row.productName}</span>
                  <span className="block truncate text-[12px] text-[var(--a-muted)]">SKU: {row.sku}</span>
                </span>
                <span className="shrink-0 rounded-lg border border-[var(--a-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--a-text-soft)]">
                  {row.soldQuantity} ш
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
