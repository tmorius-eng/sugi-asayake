import { Package } from "lucide-react";
import { formatMnt } from "@shared/format";

/**
 * The reference's "Recent Orders" table: product thumbnail + name, customer,
 * order ID, date, and a dot-prefixed status pill, with a "View All" button in
 * the header.
 *
 * Status colors follow the reference's own semantics (amber = waiting, red =
 * cancelled, green = moving/done) mapped onto this shop's real order statuses,
 * which are richer than the reference's three.
 */
export type RecentOrderRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  totalMnt: number;
  status: string;
  paymentStatus: string;
  createdAt: string | Date;
  firstItemName: string | null;
  firstItemImageUrl: string | null;
  itemCount: number;
};

const STATUS_STYLE: Record<string, { label: string; color: string; soft: string }> = {
  pending: { label: "Хүлээгдэж байна", color: "var(--a-warn)", soft: "var(--a-warn-soft)" },
  confirmed: { label: "Баталгаажсан", color: "var(--a-info)", soft: "var(--a-info-soft)" },
  packed: { label: "Бэлтгэсэн", color: "var(--a-info)", soft: "var(--a-info-soft)" },
  out_for_delivery: { label: "Хүргэлтэд гарсан", color: "var(--a-info)", soft: "var(--a-info-soft)" },
  completed: { label: "Дууссан", color: "var(--a-pos)", soft: "var(--a-pos-soft)" },
  cancelled: { label: "Цуцалсан", color: "var(--a-neg)", soft: "var(--a-neg-soft)" },
  returned: { label: "Буцаасан", color: "var(--a-neg)", soft: "var(--a-neg-soft)" },
};

export default function AdminRecentOrdersCard({ rows, onViewAll, onSelectOrder }: {
  rows: RecentOrderRow[];
  onViewAll: () => void;
  onSelectOrder: (orderNumber: string) => void;
}) {
  return (
    <section className="admin-card admin-card-hover @container min-w-0 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Сүүлийн захиалгууд</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 rounded-lg border border-[var(--a-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--a-info)] transition hover:-translate-y-0.5 hover:border-[var(--a-info)] active:scale-95"
        >
          Бүгдийг харах
        </button>
      </div>

      <div className="mt-4 overflow-x-auto admin-scroll-none">
        <table className="w-full min-w-[470px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[12px] font-medium text-[var(--a-muted)]">
              <th className="pb-3 font-medium">Бүтээгдэхүүн</th>
              <th className="pb-3 font-medium">Хэрэглэгч</th>
              <th className="pb-3 font-medium">Захиалга</th>
              <th className="hidden pb-3 font-medium @[660px]:table-cell">Огноо</th>
              <th className="pb-3 font-medium">Төлөв</th>
            </tr>
          </thead>
          <tbody className="admin-stagger">
            {rows.map(row => {
              const status = STATUS_STYLE[row.status] ?? { label: row.status, color: "var(--a-muted)", soft: "var(--a-soft)" };
              return (
                <tr key={row.id} className="align-middle">
                  <td className="border-t border-[var(--a-border)] py-3 pr-3">
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--a-soft)]">
                        {row.firstItemImageUrl
                          ? <img src={row.firstItemImageUrl} alt="" className="size-full object-cover" loading="lazy" />
                          : <Package size={15} className="text-[var(--a-faint)]" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[150px] truncate text-[13px] font-semibold text-[var(--a-text)]">{row.firstItemName ?? "—"}</span>
                        {row.itemCount > 1 && <span className="block text-[11px] text-[var(--a-muted)]">+{row.itemCount - 1} бараа</span>}
                      </span>
                    </span>
                  </td>
                  <td className="border-t border-[var(--a-border)] py-3 pr-3 text-[13px] font-semibold text-[var(--a-info)]"><span className="block max-w-[110px] truncate">{row.customerName}</span></td>
                  <td className="border-t border-[var(--a-border)] py-3 pr-3">
                    <button type="button" onClick={() => onSelectOrder(row.orderNumber)} className="text-[13px] text-[var(--a-muted)] transition hover:text-[var(--a-text)]">
                      #{row.orderNumber}
                    </button>
                    <span className="block text-[11px] font-semibold text-[var(--a-text-soft)]">{formatMnt(row.totalMnt)}</span>
                  </td>
                  <td className="hidden border-t border-[var(--a-border)] py-3 pr-3 text-[13px] whitespace-nowrap text-[var(--a-muted)] @[660px]:table-cell">
                    {new Date(row.createdAt).toLocaleDateString("mn-MN", { year: "numeric", month: "short", day: "2-digit" })}
                  </td>
                  <td className="border-t border-[var(--a-border)] py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: status.soft, color: status.color }}>
                      <span className="size-1.5 rounded-full" style={{ background: status.color }} aria-hidden="true" />
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="border-t border-[var(--a-border)] py-10 text-center text-sm text-[var(--a-muted)]">Захиалга алга.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
