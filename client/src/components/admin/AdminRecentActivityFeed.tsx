import { LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { actionLabel } from "@/lib/adminAuditLabels";

type OrderRow = { id: number; orderNumber: string; customerName: string; totalMnt: number; createdAt: Date };
type FailedPaymentRow = { id: number; orderId: number; orderNumber: string | null; provider: string; createdAt: Date };

type FeedRow = { id: string; title: string; subtitle: string; timestamp: Date; initials: string; accentClass: string };

const AVATAR_ACCENTS = ["bg-[#3970a7]", "bg-[#2c7650]", "bg-[#9b6417]", "bg-[#a51630]", "bg-[#6b4fa0]"];
const accentFor = (seed: string) => AVATAR_ACCENTS[Math.abs(seed.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % AVATAR_ACCENTS.length];
const initialsFor = (name: string) => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?";
const relativeTime = (date: Date) => {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "дөнгөж сая";
  if (minutes < 60) return `${minutes} мин өмнө`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} цаг өмнө`;
  return `${Math.round(hours / 24)} өдөр өмнө`;
};

// Merges 3 already-real sources into one feed -- no fabricated activity
// text. recentOrders/failedPayments come from the parent's own
// dashboardSummary query (staff+admin visible); auditLogs is fetched here
// directly (admin-only, existing procedure, zero backend change) and is
// simply an empty array for staff -- the feed degrades to orders+payments
// only rather than showing a separate locked state, since this is an
// additive merge, not a single gated value.
export default function AdminRecentActivityFeed({ preview = false, canSeeAuditTrail, recentOrders, failedPayments }: {
  preview?: boolean;
  canSeeAuditTrail: boolean;
  recentOrders: OrderRow[];
  failedPayments: FailedPaymentRow[];
}) {
  const auditQuery = trpc.admin.auditLogs.useQuery({ limit: 8 }, { enabled: !preview && canSeeAuditTrail });

  const rows: FeedRow[] = [
    ...recentOrders.map((order): FeedRow => ({
      id: `order-${order.id}`,
      title: `${order.customerName} — захиалга ${order.orderNumber}`,
      subtitle: formatMnt(order.totalMnt),
      timestamp: new Date(order.createdAt),
      initials: initialsFor(order.customerName),
      accentClass: accentFor(order.customerName),
    })),
    ...failedPayments.map((payment): FeedRow => ({
      id: `payment-${payment.id}`,
      title: `Төлбөр амжилтгүй: ${payment.orderNumber ?? `#${payment.orderId}`}`,
      subtitle: payment.provider,
      timestamp: new Date(payment.createdAt),
      initials: "!!",
      accentClass: "bg-[#a51630]",
    })),
    ...(auditQuery.data ?? []).map((log): FeedRow => {
      const who = log.actorName ?? log.actorEmail ?? "Систем";
      return {
        id: `audit-${log.id}`,
        title: `${who} — ${actionLabel(log.action)}`,
        subtitle: log.entityType + (log.entityId ? ` #${log.entityId}` : ""),
        timestamp: new Date(log.createdAt),
        initials: initialsFor(who),
        accentClass: accentFor(who),
      };
    }),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 8);

  return (
    <div className="rounded-xl border border-black/7 bg-card p-5 shadow-sm sm:p-6">
      <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">RECENT ACTIVITY</p>
      {!preview && canSeeAuditTrail && auditQuery.isLoading && <p className="mt-4 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={14} />Ачаалж байна…</p>}
      <div className="mt-4 grid gap-3">
        {rows.map(row => (
          <div key={row.id} className="flex items-start gap-3">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white ${row.accentClass}`}>{row.initials}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold leading-5">{row.title}</p>
              <p className="truncate text-[11px] text-[#8a8b8f]">{row.subtitle}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[#a9a49a]">{relativeTime(row.timestamp)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-xs text-[#8a8b8f]">Идэвх алга.</p>}
      </div>
    </div>
  );
}
