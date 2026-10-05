import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { stageLabel, type TimelineEntry } from "@shared/process-timeline";
import { formatMnt } from "@shared/format";
import { trpc } from "@/lib/trpc";
import { actorChipClass, formatDateTime, sourceLabel } from "@/lib/processLabels";
import type { AdminSection } from "../../AdminWorkspace";

function detailsLine(details: TimelineEntry["details"]): string {
  if (!details) return "";
  return Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

/** Нэг захиалгын бүрэн түүх. `compact` = захиалгын картад суулгах хувилбар (сонгогчгүй, жижиг үсэг). */
export default function ProcessOrderTrail({ orderId, onOrderChange, onSearchIn, compact = false }: {
  orderId: number | null;
  onOrderChange?: (orderId: number | null) => void;
  onSearchIn?: (section: AdminSection, query: string) => void;
  compact?: boolean;
}) {
  const [input, setInput] = useState("");
  const [notFound, setNotFound] = useState(false);
  // Дугаараар хайхад админы захиалгын жагсаалтыг (кэштэй) ашиглана — тусдаа хайлтын procedure байхгүй.
  const ordersQuery = trpc.admin.orders.useQuery(undefined, { enabled: !compact });
  const trail = trpc.admin.process.orderTrail.useQuery({ orderId: orderId ?? 0 }, { enabled: orderId !== null });

  const resolve = () => {
    const text = input.trim();
    if (!text) return;
    const byNumber = ordersQuery.data?.find(order => order.orderNumber.toLowerCase() === text.toLowerCase());
    const numeric = /^\d+$/.test(text) ? Number(text) : null;
    const id = byNumber?.id ?? numeric;
    setNotFound(id === null);
    if (id !== null) onOrderChange?.(id);
  };

  const order = trail.data?.order;
  const timeline = trail.data?.timeline ?? [];
  const textSize = compact ? "text-[11px]" : "text-xs";

  return (
    <div className={`grid gap-4 [&>*]:min-w-0 ${compact ? "mt-3" : ""}`}>
      {!compact && (
        <form onSubmit={event => { event.preventDefault(); resolve(); }} className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 sm:max-w-sm">
            <Search size={15} className="text-[var(--a-faint)]" aria-hidden="true" />
            <input value={input} onChange={event => { setInput(event.target.value); setNotFound(false); }} placeholder="Захиалгын дугаар (эсвэл id)" aria-label="Захиалгын дугаар" className="w-full min-w-0 bg-transparent text-xs outline-none" />
          </label>
          <button type="submit" className="h-10 rounded-full bg-[var(--a-btn-dark)] px-5 text-xs font-bold text-[var(--a-invert-text)]">Түүх харах</button>
          {notFound && <p className="text-[11px] text-[var(--a-neg)]">Ийм дугаартай захиалга олдсонгүй.</p>}
          <p className="w-full text-[11px] text-[var(--a-faint)]">Дугаараар хайхад сүүлийн захиалгуудаас олно; олдохгүй бол тоон id оруулна уу.</p>
        </form>
      )}
      {orderId === null ? (
        !compact && <p className="text-xs text-[var(--a-faint)]">Захиалгыг сонгоно уу.</p>
      ) : trail.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>
      ) : trail.error || !order ? (
        <p className="rounded-2xl bg-[var(--a-neg-soft)] p-3 text-xs text-[var(--a-neg)]">{trail.error?.message ?? "Түүх уншигдсангүй."}</p>
      ) : (
        <>
          <div className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-soft)] p-4">
            <p className={`${compact ? "text-xs" : "text-sm"} font-bold`}>{order.orderNumber}</p>
            <p className={`mt-1 ${textSize} text-[var(--a-text-soft)]`}>
              {stageLabel(order.status)} · төлбөр: {order.paymentStatus} · {formatMnt(order.totalMnt)} · {order.items?.length ?? 0} бараа
            </p>
            {onSearchIn && !compact && <button type="button" onClick={() => onSearchIn("orders", order.orderNumber)} className="mt-2 h-8 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">Захиалгад</button>}
          </div>
          {timeline.length === 0 ? (
            <p className="text-xs text-[var(--a-faint)]">Түүх бүртгэгдээгүй (backfill хийгдээгүй байж болно).</p>
          ) : (
            <ol className="grid gap-4">
              {timeline.map((entry, index) => {
                const details = detailsLine(entry.details);
                return (
                  <li key={entry.key} className="relative min-w-0 border-l-2 border-[var(--a-border)] pl-5">
                    <span className="absolute -left-[13px] top-0 flex size-6 items-center justify-center rounded-full bg-[var(--a-btn-dark)] text-[10px] font-bold text-[var(--a-invert-text)]" aria-hidden="true">{index + 1}</span>
                    <p className={`${compact ? "text-xs" : "text-sm"} min-w-0 break-words font-bold`}>{entry.summary}</p>
                    <p className={`mt-1 flex flex-wrap items-center gap-1.5 ${textSize} text-[var(--a-muted)]`}>
                      <span className={actorChipClass(entry.actorKind)}>{entry.actorLabel ?? entry.actorKind}</span>
                      <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                      <span className="rounded bg-[var(--a-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--a-text-soft)]">{sourceLabel(entry.source)}</span>
                    </p>
                    {details && <p className="mt-1 min-w-0 break-words text-[11px] text-[var(--a-faint)]">{details}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
