import { useMemo } from "react";
import { AlertTriangle, Clock, Database, Eye, HardDrive, LoaderCircle, Percent, ReceiptText, Users, Wallet, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import AdminStatCard from "./admin/AdminStatCard";
import AdminMiniSparkline from "./admin/AdminMiniSparkline";
import AdminNetworkActivitiesCard from "./admin/AdminNetworkActivitiesCard";
import AdminRecentActivityFeed from "./admin/AdminRecentActivityFeed";

const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан" };

// 2026-09-06: extended for the new Gentelella-style stat-card grid + chart
// (see the approved plan) -- same established "static example numbers under
// the explicitly-labeled ADMIN UI PROTOTYPE banner" convention this
// constant already used for the original 3-card row, not a fabrication-rule
// exception (preview mode is never presented as real data).
const previewSummary = {
  totalOrders: 128,
  totalRevenueMnt: 18_450_000,
  activeUsers: 42,
  recentOrders: [
    { id: 1, orderNumber: "SA-0128", customerName: "Б. Ану", totalMnt: 89_500, status: "confirmed", paymentStatus: "paid", createdAt: new Date() },
    { id: 2, orderNumber: "SA-0127", customerName: "Т. Golden", totalMnt: 42_500, status: "pending", paymentStatus: "unpaid", createdAt: new Date() },
  ],
  lowStockProducts: [{ id: 3, name: "Rohto Melano CC Essence", sku: "ROHTO-MCC-20", stockQuantity: 0 }],
  failedPayments: [{ id: 1, orderId: 2, orderNumber: "SA-0119", provider: "qpay" as const, createdAt: new Date() }],
  ordersLast7d: 24,
  ordersPrevious7d: 19,
  ordersDailySeries: [3, 2, 5, 4, 3, 4, 3].map((orderCount, i) => ({ date: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10), orderCount })),
};

const previewConversion = { avgSessionDurationSec: 145, conversionRatePercent: 3, totalPageViews: 2140, sessionsCount: 640 };
const previewProfit = { marginPercent: 34 };
const previewDeltas = { avgSessionDurationSec: 6, revenueMnt: 12, conversionRatePercent: -4, totalPageViews: 9 };
const previewPageViewSeries = [260, 240, 320, 300, 340, 310, 280];

function formatDurationShort(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainderSec = Math.round(seconds % 60);
  return minutes > 0 ? `${minutes}мин ${remainderSec}с` : `${remainderSec}с`;
}

export default function AdminDashboardHome({ preview = false, isFullAdmin, onNavigate }: { preview?: boolean; isFullAdmin: boolean; onNavigate: (section: "orders" | "products") => void }) {
  const summaryQuery = trpc.admin.dashboardSummary.useQuery(undefined, { enabled: !preview });
  // Fixed 7-day window, independent of AdminNetworkActivitiesCard's own
  // separately-toggleable 7/30/90 range -- these stat cards always report
  // "this week", matching the Orders card's own 7-day figures above them.
  const weekInput = useMemo(() => ({ dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), dateTo: new Date().toISOString() }), []);
  const analyticsQuery = trpc.admin.analyticsReport.useQuery(weekInput, { enabled: !preview && isFullAdmin });

  const data = preview ? previewSummary : summaryQuery.data;

  if (!preview && summaryQuery.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Хянах самбарыг ачаалж байна…</div>;
  }
  if (!preview && summaryQuery.error) {
    return <div className="rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{summaryQuery.error.message}</div>;
  }
  if (!data) return null;

  const conversion = preview ? previewConversion : analyticsQuery.data?.conversion;
  const profit = preview ? previewProfit : analyticsQuery.data?.profit;
  const periodComparison = preview ? null : analyticsQuery.data?.periodComparison;
  const deltas = preview ? previewDeltas : {
    avgSessionDurationSec: periodComparison?.deltaPercent.avgSessionDurationSec ?? null,
    revenueMnt: periodComparison?.deltaPercent.revenueMnt ?? null,
    conversionRatePercent: periodComparison?.deltaPercent.conversionRatePercent ?? null,
    totalPageViews: periodComparison?.deltaPercent.totalPageViews ?? null,
  };
  const stillLoadingAnalytics = !preview && isFullAdmin && analyticsQuery.isLoading;
  const revenueMnt = preview ? 6_420_000 : periodComparison?.current.revenueMnt;
  const pageViewSeries = preview ? previewPageViewSeries : analyticsQuery.data?.visitorSessionTimeseries.map(row => row.pageViewCount) ?? [];

  const ordersDeltaPercent = data.ordersPrevious7d === 0 ? null : Math.round(((data.ordersLast7d - data.ordersPrevious7d) / data.ordersPrevious7d) * 100);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard
          icon={Users}
          iconBg="#eef1fb" iconColor="#3970a7"
          label="Идэвхтэй хэрэглэгч"
          value={data.activeUsers === null ? "locked" : String(data.activeUsers)}
          caption="сүүлийн 30 хоногт нэвтэрсэн"
        />
        <AdminStatCard
          icon={Clock}
          iconBg="#fff4e5" iconColor="#c67c1f"
          label="Дундаж сессийн хугацаа"
          value={!isFullAdmin ? "locked" : stillLoadingAnalytics ? "…" : conversion?.avgSessionDurationSec != null ? formatDurationShort(conversion.avgSessionDurationSec) : "—"}
          deltaPercent={!isFullAdmin ? undefined : deltas.avgSessionDurationSec}
          caption="сүүлийн 7 хоногт"
        />
        <AdminStatCard
          icon={ReceiptText}
          iconBg="#eaf5ef" iconColor="#2c7650"
          label="Захиалга"
          value={String(data.ordersLast7d)}
          deltaPercent={ordersDeltaPercent}
          caption="сүүлийн 7 хоногт"
          sparkline={<AdminMiniSparkline values={data.ordersDailySeries.map(row => row.orderCount)} color="#2c7650" />}
        />
        <AdminStatCard
          icon={Wallet}
          iconBg="#fdeaea" iconColor="#df1f3d"
          label="Орлого"
          value={!isFullAdmin ? "locked" : stillLoadingAnalytics ? "…" : revenueMnt != null ? formatMnt(revenueMnt) : "—"}
          deltaPercent={!isFullAdmin ? undefined : deltas.revenueMnt}
          caption="сүүлийн 7 хоногт (төлөгдсөн)"
          progressBar={!isFullAdmin || profit == null ? undefined : { percent: profit.marginPercent, barClassName: "bg-[#2c7650]", caption: `Ашгийн маржин: ${profit.marginPercent}%` }}
        />
        <AdminStatCard
          icon={Percent}
          iconBg="#f5eefb" iconColor="#6b4fa0"
          label="Хөрвүүлэлт"
          value={!isFullAdmin ? "locked" : stillLoadingAnalytics ? "…" : conversion?.conversionRatePercent != null ? `${conversion.conversionRatePercent}%` : "—"}
          deltaPercent={!isFullAdmin ? undefined : deltas.conversionRatePercent}
          caption={conversion && conversion.sessionsCount === 0 ? "хараахан сесс алга" : "захиалга ÷ сесс"}
          progressBar={!isFullAdmin || conversion?.conversionRatePercent == null ? undefined : { percent: conversion.conversionRatePercent, barClassName: "bg-[#a51630]", caption: `${conversion.sessionsCount} сесснээс` }}
        />
        <AdminStatCard
          icon={Eye}
          iconBg="#e8f3fb" iconColor="#2f7ab8"
          label="Хуудас үзэлт"
          value={!isFullAdmin ? "locked" : stillLoadingAnalytics ? "…" : conversion ? conversion.totalPageViews.toLocaleString("mn-MN") : "—"}
          deltaPercent={!isFullAdmin ? undefined : deltas.totalPageViews}
          caption="сүүлийн 7 хоногт"
          sparkline={pageViewSeries.length > 0 ? <AdminMiniSparkline values={pageViewSeries} color="#2f7ab8" /> : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <AdminNetworkActivitiesCard preview={preview} isFullAdmin={isFullAdmin} />
        <AdminRecentActivityFeed preview={preview} isFullAdmin={isFullAdmin} recentOrders={data.recentOrders} failedPayments={data.failedPayments} />
      </div>

      {!preview && <SystemHealthWidget />}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Сүүлийн захиалгууд</h3>
            <button type="button" onClick={() => onNavigate("orders")} className="shrink-0 text-xs font-bold text-[#3970a7]">Бүгдийг харах</button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[520px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
                  <th className="border-b border-black/8 pb-2">ДУГААР</th>
                  <th className="border-b border-black/8 pb-2">ХЭРЭГЛЭГЧ</th>
                  <th className="border-b border-black/8 pb-2">ДҮН</th>
                  <th className="border-b border-black/8 pb-2">ТӨЛӨВ</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map(order => (
                  <tr key={order.id} className="text-sm">
                    <td className="border-b border-black/6 py-3 text-xs font-bold text-[#df1f3d]">{order.orderNumber}</td>
                    <td className="border-b border-black/6 py-3">{order.customerName}</td>
                    <td className="border-b border-black/6 py-3 font-bold">{formatMnt(order.totalMnt)}</td>
                    <td className="border-b border-black/6 py-3"><span className="rounded-full bg-[#f8f5ef] px-2.5 py-1 text-[10px] font-extrabold">{statusLabels[order.status] ?? order.status}</span></td>
                  </tr>
                ))}
                {data.recentOrders.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-sm text-[#77787d]">Захиалга алга.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0 rounded-3xl border border-[#df1f3d]/20 bg-[#fff5f6] p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-[#df1f3d]" size={17} />
            <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Анхаарах зүйлс</h3>
          </div>
          <div className="mt-4 grid gap-4">
            <div>
              <p className="text-[10px] font-extrabold tracking-[.13em] text-[#9b6417]">НӨӨЦ ДУУСЧ БАЙНА</p>
              <div className="mt-2 grid gap-1.5">
                {data.lowStockProducts.map(product => (
                  <button key={product.id} type="button" onClick={() => onNavigate("products")} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-xs transition hover:bg-[#f8f5ef]">
                    <span className="min-w-0 truncate font-bold">{product.name}</span>
                    <span className="shrink-0 font-bold text-[#df1f3d]">{product.stockQuantity} ш</span>
                  </button>
                ))}
                {data.lowStockProducts.length === 0 && <p className="text-xs text-[#707176]">Бүх бараа хангалттай нөөцтэй.</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-[.13em] text-[#9b6417]">АМЖИЛТГҮЙ ТӨЛБӨР</p>
              <div className="mt-2 grid gap-1.5">
                {data.failedPayments.map(payment => (
                  <button key={payment.id} type="button" onClick={() => onNavigate("orders")} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-xs transition hover:bg-[#f8f5ef]">
                    <span className="min-w-0 truncate font-bold">{payment.orderNumber ?? `Захиалга #${payment.orderId}`}</span>
                    <span className="shrink-0 text-[#77787d]">{new Date(payment.createdAt).toLocaleDateString("mn-MN")}</span>
                  </button>
                ))}
                {data.failedPayments.length === 0 && <p className="text-xs text-[#707176]">Амжилтгүй төлбөр алга.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// TIER 6: basic "is the backend actually up" strip — two pings (DB, S3),
// nothing more. Not a replacement for real monitoring (Sentry/uptime
// checks) — just enough for whoever's looking at the dashboard to notice a
// down dependency without digging into server logs.
function SystemHealthWidget() {
  const query = trpc.admin.systemHealth.useQuery(undefined, { refetchInterval: 60_000 });

  if (query.isLoading) return null;
  if (query.error) return null;
  const health = query.data;
  if (!health) return null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-black/7 px-4 py-3 text-xs">
      <span className="font-extrabold tracking-[.1em] text-[#8a8b8f]">СИСТЕМ</span>
      <HealthPing icon={Database} label="Database" ok={health.db.ok} error={health.db.error} />
      <HealthPing icon={HardDrive} label="Storage (S3)" ok={health.storage.ok} error={health.storage.error} />
    </div>
  );
}

function HealthPing({ icon: Icon, label, ok, error }: { icon: LucideIcon; label: string; ok: boolean; error?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-bold" title={ok ? undefined : error}>
      <Icon size={14} className="text-[#77787d]" aria-hidden="true" />
      {label}
      <span aria-hidden="true">{ok ? "🟢" : "🔴"}</span>
      <span className="sr-only">{ok ? "ажиллаж байна" : `доголдолтой${error ? `: ${error}` : ""}`}</span>
    </span>
  );
}
