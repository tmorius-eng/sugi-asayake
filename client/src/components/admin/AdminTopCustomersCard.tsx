import { Ellipsis, LoaderCircle, Lock } from "lucide-react";
import { formatMnt } from "@shared/format";

/**
 * The reference's "Weekly Top Customers" card: avatar, name, order count, and
 * a "View" button per row.
 *
 * Ranked over whatever window the dashboard's date picker currently holds --
 * so the heading says "энэ хугацаанд" rather than hard-coding "weekly" like
 * the reference does, which would be a lie the moment someone picks 90 days.
 * Guest checkouts are excluded upstream (getTopCustomers) because they have no
 * stable identity to rank across orders.
 */
export type TopCustomerRow = {
  userId: number;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  orderCount: number;
  revenueMnt: number;
};

export default function AdminTopCustomersCard({ rows, loading, locked, onSelect, onOpenAll }: {
  rows: TopCustomerRow[];
  loading: boolean;
  locked: boolean;
  onSelect: (nameOrPhone: string) => void;
  onOpenAll: () => void;
}) {
  return (
    <section className="admin-card admin-card-hover flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Шилдэг харилцагчид</h3>
        <button type="button" onClick={onOpenAll} className="shrink-0 rounded-lg p-1.5 text-[var(--a-faint)] transition hover:bg-[var(--a-soft)] hover:text-[var(--a-text)]" title="Бүх харилцагч" aria-label="Хэрэглэгчийн жагсаалт руу очих"><Ellipsis size={17} /></button>
      </div>

      {locked ? (
        <p className="flex flex-1 items-center justify-center gap-1.5 py-12 text-sm font-bold text-[var(--a-faint)]"><Lock size={14} aria-hidden="true" />Зөвхөн санхүү/админд</p>
      ) : loading ? (
        <p className="flex flex-1 items-center justify-center gap-2 py-12 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-12 text-center text-xs text-[var(--a-muted)]">Энэ хугацаанд бүртгэлтэй харилцагчийн төлөгдсөн захиалга алга.</p>
      ) : (
        <ul className="admin-stagger mt-4 grid gap-1">
          {rows.map(row => (
            <li key={row.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--a-soft)]">
              {row.avatarUrl
                ? <img src={row.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" loading="lazy" />
                : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--a-soft-hover)] text-[13px] font-bold text-[var(--a-text-soft)]">{initialsOf(row.name)}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[var(--a-text)]">{row.name}</span>
                <span className="block truncate text-[12px] text-[var(--a-muted)]">{row.orderCount} захиалга · {formatMnt(row.revenueMnt)}</span>
              </span>
              <button
                type="button"
                onClick={() => onSelect(row.phone ?? row.name)}
                className="shrink-0 rounded-lg border border-[var(--a-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--a-info)] transition hover:-translate-y-0.5 hover:border-[var(--a-info)] active:scale-95"
              >
                Харах
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(part => part.charAt(0).toUpperCase()).join("") || "?";
}
