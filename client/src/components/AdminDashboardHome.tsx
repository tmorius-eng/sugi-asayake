import { useMemo, useState } from "react";
import { AlertTriangle, Database, HardDrive, LoaderCircle, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { resolveRange, type AdminDateRange } from "@/lib/analyticsRange";
import AdminKpiCard from "./admin/AdminKpiCard";
import AdminCountUp from "./admin/AdminCountUp";
import AdminDateRangePicker from "./admin/AdminDateRangePicker";
import AdminSummaryChart from "./admin/AdminSummaryChart";
import AdminTopProductsCard from "./admin/AdminTopProductsCard";
import AdminTopCustomersCard from "./admin/AdminTopCustomersCard";
import AdminRecentOrdersCard from "./admin/AdminRecentOrdersCard";

/* ---------------------------------------------------------------------------
 * Admin dashboard — rebuilt 2026-09-08 against the reference Tom supplied
 * (84abf4184403667.6551a930b3b2b.jpg): greeting + date controls, a row of five
 * tinted KPI tiles, a two-line Summary chart beside a ranked product list, and
 * a recent-orders table beside a ranked customer list.
 *
 * Every figure is real. The reference's five headline metrics map onto data
 * this app already computes:
 *   Ecommerce Revenue    -> getSalesOverview().revenueMnt (paid orders only)
 *   New Customers        -> getSalesOverview().newCustomerCount
 *   Repeat Purchase Rate -> returning / (new + returning)
 *   Average Order Value  -> getSalesOverview().aovMnt
 *   Conversion rate      -> getConversionOverview().conversionRatePercent
 * A metric with no honest value renders "—", never a placeholder number, and
 * the finance-gated ones render the lock treatment for staff/warehouse rather
 * than a network 403.
 * ------------------------------------------------------------------------ */

const previewSummary = {
  totalOrders: 128,
  totalRevenueMnt: 18_450_000,
  activeUsers: 42,
  recentOrders: [
    { id: 1, orderNumber: "SA-0128", customerName: "Б. Ану", totalMnt: 89_500, status: "confirmed", paymentStatus: "paid", createdAt: new Date(), firstItemName: "Rohto Melano CC Essence", firstItemImageUrl: null, itemCount: 2 },
    { id: 2, orderNumber: "SA-0127", customerName: "Т. Golden", totalMnt: 42_500, status: "pending", paymentStatus: "unpaid", createdAt: new Date(), firstItemName: "Moist Diane Shampoo", firstItemImageUrl: null, itemCount: 1 },
  ],
  lowStockProducts: [{ id: 3, name: "Rohto Melano CC Essence", sku: "ROHTO-MCC-20", stockQuantity: 0 }],
  failedPayments: [{ id: 1, orderId: 2, orderNumber: "SA-0119", provider: "qpay" as const, createdAt: new Date() }],
  ordersLast7d: 24,
  ordersPrevious7d: 19,
  refundOwedCount: 0,
  ordersDailySeries: [3, 2, 5, 4, 3, 4, 3].map((orderCount, i) => ({ date: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10), orderCount })),
};

export default function AdminDashboardHome({ preview = false, canSeeFinancials, canSeeAuditTrail, userName, onNavigate, onSearchIn }: {
  preview?: boolean;
  canSeeFinancials: boolean;
  /** Kept in the props for call-site parity with the other admin sections;
   *  the audit feed itself now lives in the Security Center, which is where
   *  someone actually goes to read it. */
  canSeeAuditTrail?: boolean;
  userName: string;
  onNavigate: (section: "orders" | "products" | "users") => void;
  onSearchIn: (section: "orders" | "products" | "users", query: string) => void;
}) {
  const [range, setRange] = useState<AdminDateRange>({ key: "7d" });
  const dates = useMemo(() => resolveRange(range), [range]);
  const rangeInput = useMemo(() => ({ dateFrom: dates.dateFrom?.toISOString(), dateTo: dates.dateTo?.toISOString() }), [dates]);

  const summaryQuery = trpc.admin.dashboardSummary.useQuery(undefined, { enabled: !preview });
  const analyticsQuery = trpc.admin.analyticsReport.useQuery(rangeInput, { enabled: !preview && canSeeFinancials });
  const highlightsQuery = trpc.admin.dashboardHighlights.useQuery(rangeInput, { enabled: !preview && canSeeFinancials });

  const data = preview ? previewSummary : summaryQuery.data;

  if (!preview && summaryQuery.isLoading) {
    return <div className="flex items-center gap-2 py-16 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Хянах самбарыг ачаалж байна…</div>;
  }
  if (!preview && summaryQuery.error) {
    return <div className="admin-card p-4 text-xs text-[var(--a-neg)]">{summaryQuery.error.message}</div>;
  }
  if (!data) return null;

  const report = preview ? null : analyticsQuery.data;
  const overview = report?.overview;
  const comparison = report?.periodComparison;
  const conversion = report?.conversion;
  const analyticsLoading = !preview && canSeeFinancials && analyticsQuery.isLoading;

  // Repeat-purchase rate: what share of the window's identified buyers had
  // already bought before it. Only meaningful when the window has a start
  // (getSalesOverview leaves both counts at 0 for "all time" by design) and
  // when at least one identified customer bought -- otherwise it's "—", not 0%.
  const identifiedBuyers = (overview?.newCustomerCount ?? 0) + (overview?.returningCustomerCount ?? 0);
  const repeatRatePercent = identifiedBuyers > 0 ? Math.round(((overview?.returningCustomerCount ?? 0) / identifiedBuyers) * 1000) / 10 : null;

  const locked = !canSeeFinancials;
  const kpiPending = analyticsLoading;

  return (
    <div className="grid gap-5">
      {/* Greeting row — the reference's "Welcome Back, Mahfuzul!" + its two
          date controls. The black pill is a real one-click jump to the
          all-time window, matching the reference's "View All Time". */}
      <div className="admin-fade flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-[var(--font-display)] text-[26px] font-semibold leading-tight tracking-[-.045em] text-[var(--a-text)]">
            Сайн байна уу, {userName}!
          </h2>
          <p className="mt-1 text-[13px] text-[var(--a-muted)]">Өнөөдрийн дэлгүүрийн байдал энд байна</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminDateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            onClick={() => setRange({ ...range, key: "all" })}
            className={`h-10 rounded-xl px-4 text-[13px] font-bold transition active:scale-[.98] ${range.key === "all" ? "bg-[var(--a-invert-bg-hover)] text-[var(--a-invert-text)]" : "bg-[var(--a-invert-bg)] text-[var(--a-invert-text)] hover:bg-[var(--a-invert-bg-hover)]"}`}
          >
            Бүх цаг үе
          </button>
        </div>
      </div>

      {/* Five tinted KPI tiles, in the reference's order. */}
      <div className="admin-stagger grid gap-3 grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:gap-4">
        <AdminKpiCard
          tint={1}
          label="Нийт орлого"
          locked={locked}
          value={kpiPending ? "…" : overview ? <AdminCountUp value={overview.revenueMnt} format={value => formatMnt(Math.round(value))} /> : "—"}
          delta={comparison?.deltaPercent.revenueMnt ?? null}
          secondary={overview ? `${overview.orderCount} захиалга` : null}
        />
        <AdminKpiCard
          tint={2}
          label="Шинэ харилцагч"
          locked={locked}
          value={kpiPending ? "…" : overview ? <AdminCountUp value={overview.newCustomerCount} format={value => String(Math.round(value))} /> : "—"}
          delta={undefined}
          secondary={overview && range.key !== "all" ? `${overview.returningCustomerCount} давтан` : "хугацаа сонгоно уу"}
        />
        <AdminKpiCard
          tint={3}
          label="Давтан худалдалт"
          locked={locked}
          value={kpiPending ? "…" : repeatRatePercent === null ? "—" : <AdminCountUp value={repeatRatePercent} format={value => `${value.toFixed(1)} %`} />}
          delta={undefined}
          secondary={identifiedBuyers > 0 ? `${identifiedBuyers} бүртгэлтэй худалдан авагчаас` : null}
        />
        <AdminKpiCard
          tint={4}
          label="Дундаж захиалга"
          locked={locked}
          value={kpiPending ? "…" : overview && overview.orderCount > 0 ? <AdminCountUp value={overview.aovMnt} format={value => formatMnt(Math.round(value))} /> : "—"}
          delta={comparison?.deltaPercent.aovMnt ?? null}
          secondary={overview && overview.orderCount > 0 ? "төлөгдсөн захиалгаар" : null}
        />
        <AdminKpiCard
          tint={5}
          label="Хөрвүүлэлт"
          locked={locked}
          value={kpiPending ? "…" : conversion?.conversionRatePercent == null ? "—" : <AdminCountUp value={conversion.conversionRatePercent} format={value => `${value.toFixed(2)} %`} />}
          delta={comparison?.deltaPercent.conversionRatePercent ?? null}
          secondary={conversion ? `${conversion.sessionsCount.toLocaleString("mn-MN")} сесс` : null}
        />
      </div>

      {/* Summary chart + ranked products. */}
      <div className="grid gap-4 min-[880px]:grid-cols-[1.5fr_1fr]">
        <AdminSummaryChart range={range} canSeeFinancials={canSeeFinancials && !preview} onRangeChange={setRange} />
        <AdminTopProductsCard
          rows={highlightsQuery.data?.topProducts ?? []}
          loading={!preview && canSeeFinancials && highlightsQuery.isLoading}
          locked={locked || preview}
          onSelect={sku => onSearchIn("products", sku)}
          onOpenAll={() => onNavigate("products")}
        />
      </div>

      {/* Recent orders + ranked customers. */}
      <div className="grid gap-4 min-[880px]:grid-cols-[1.5fr_1fr]">
        <AdminRecentOrdersCard
          rows={data.recentOrders}
          onViewAll={() => onNavigate("orders")}
          onSelectOrder={orderNumber => onSearchIn("orders", orderNumber)}
        />
        <AdminTopCustomersCard
          rows={highlightsQuery.data?.topCustomers ?? []}
          loading={!preview && canSeeFinancials && highlightsQuery.isLoading}
          locked={locked || preview}
          onSelect={nameOrPhone => onSearchIn("users", nameOrPhone)}
          onOpenAll={() => onNavigate("users")}
        />
      </div>

      {/* Operational alerts — not in the reference, kept because low stock and
          failed payments are the two things that actually need same-day
          action, and this is the screen people leave open. */}
      <div className="grid gap-4 min-[880px]:grid-cols-[1.5fr_1fr]">
        <section className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: "var(--a-warn)" }} aria-hidden="true" />
            <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Анхаарах зүйлс</h3>
          </div>
          {/* Audit 2026-09-09 (R2): paid-then-cancelled orders finance still
              owes a refund on -- the Orders section has the matching filter. */}
          {data.refundOwedCount > 0 && (
            <button type="button" onClick={() => onNavigate("orders")} className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-[#7a5a12]/30 bg-[#fff5dd] px-3 py-2.5 text-left text-[12px] transition hover:bg-[#ffefc4]">
              <span className="font-semibold text-[#7a5a12]">Буцаан олголт хүлээгдэж буй захиалга</span>
              <span className="shrink-0 rounded-full bg-[#7a5a12] px-2 py-0.5 text-[11px] font-bold text-white">{data.refundOwedCount}</span>
            </button>
          )}
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--a-faint)]">Нөөц дуусч байна</p>
              <div className="admin-stagger mt-2 grid gap-1.5">
                {data.lowStockProducts.map(product => (
                  <button key={product.id} type="button" onClick={() => onSearchIn("products", product.sku)} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--a-soft)] px-3 py-2 text-left text-[12px] transition hover:bg-[var(--a-soft-hover)]">
                    <span className="min-w-0 truncate font-semibold text-[var(--a-text)]">{product.name}</span>
                    <span className="shrink-0 font-bold" style={{ color: "var(--a-neg)" }}>{product.stockQuantity} ш</span>
                  </button>
                ))}
                {data.lowStockProducts.length === 0 && <p className="text-[12px] text-[var(--a-muted)]">Бүх бараа хангалттай нөөцтэй.</p>}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--a-faint)]">Амжилтгүй төлбөр</p>
              <div className="admin-stagger mt-2 grid gap-1.5">
                {data.failedPayments.map(payment => (
                  <button key={payment.id} type="button" onClick={() => payment.orderNumber ? onSearchIn("orders", payment.orderNumber) : onNavigate("orders")} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--a-soft)] px-3 py-2 text-left text-[12px] transition hover:bg-[var(--a-soft-hover)]">
                    <span className="min-w-0 truncate font-semibold text-[var(--a-text)]">{payment.orderNumber ?? `Захиалга #${payment.orderId}`}</span>
                    <span className="shrink-0 text-[var(--a-muted)]">{new Date(payment.createdAt).toLocaleDateString("mn-MN")}</span>
                  </button>
                ))}
                {data.failedPayments.length === 0 && <p className="text-[12px] text-[var(--a-muted)]">Амжилтгүй төлбөр алга.</p>}
              </div>
            </div>
          </div>
        </section>
        {!preview && <SystemHealthCard />}
      </div>
    </div>
  );
}

// TIER 6: basic "is the backend actually up" card — two pings (DB, S3),
// nothing more. Not a replacement for real monitoring (Honeybadger/uptime
// checks) — just enough for whoever's looking at the dashboard to notice a
// down dependency without digging into server logs.
function SystemHealthCard() {
  const query = trpc.admin.systemHealth.useQuery(undefined, { refetchInterval: 60_000 });
  const health = query.data;
  if (query.isLoading || query.error || !health) return null;

  return (
    <section className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
      <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Системийн байдал</h3>
      <div className="mt-4 grid gap-2">
        <HealthRow icon={Database} label="Өгөгдлийн сан" ok={health.db.ok} error={health.db.error} />
        <HealthRow icon={HardDrive} label="Зургийн сан (S3)" ok={health.storage.ok} error={health.storage.error} />
        {/* Audit 2026-09-09 (architecture debt #3): cached balance vs ledger
            sum, for every account that has ever held credit. */}
        {health.storeCredit && (
          <HealthRow icon={Database} label="Дэлгүүрийн зээлийн тэнцэл" ok={health.storeCredit.ok}
            okLabel={`Тэнцсэн (${health.storeCredit.checkedAccounts} данс)`}
            badLabel={`${health.storeCredit.driftedAccounts} данс зөрүүтэй`}
            error={health.storeCredit.ok ? undefined : "users.storeCreditMnt нь store_credit_ledger-ийн нийлбэртэй таарахгүй байна"} />
        )}
      </div>
    </section>
  );
}

function HealthRow({ icon: Icon, label, ok, error, okLabel = "Ажиллаж байна", badLabel = "Доголдолтой" }: { icon: LucideIcon; label: string; ok: boolean; error?: string; okLabel?: string; badLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--a-soft)] px-3 py-2.5" title={ok ? undefined : error}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--a-text)]">
        <Icon size={15} className="text-[var(--a-muted)]" aria-hidden="true" />
        {label}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: ok ? "var(--a-pos-soft)" : "var(--a-neg-soft)", color: ok ? "var(--a-pos)" : "var(--a-neg)" }}>
        <span className="size-1.5 rounded-full" style={{ background: ok ? "var(--a-pos)" : "var(--a-neg)" }} aria-hidden="true" />
        {ok ? okLabel : badLabel}
      </span>
    </div>
  );
}
