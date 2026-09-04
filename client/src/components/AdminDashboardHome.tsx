import { AlertTriangle, Database, HardDrive, Lock, LoaderCircle, ReceiptText, Users2, Wallet, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан" };

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
};

export default function AdminDashboardHome({ preview = false, onNavigate }: { preview?: boolean; onNavigate: (section: "orders" | "products") => void }) {
  const summaryQuery = trpc.admin.dashboardSummary.useQuery(undefined, { enabled: !preview });
  const data = preview ? previewSummary : summaryQuery.data;

  if (!preview && summaryQuery.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Хянах самбарыг ачаалж байна…</div>;
  }
  if (!preview && summaryQuery.error) {
    return <div className="rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{summaryQuery.error.message}</div>;
  }
  if (!data) return null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={ReceiptText} label="Нийт захиалга" value={String(data.totalOrders)} accent="#3970a7" />
        <KpiCard icon={Wallet} label="Орлого (төлөгдсөн)" value={data.totalRevenueMnt === null ? null : formatMnt(data.totalRevenueMnt)} accent="#2c7650" />
        <KpiCard icon={Users2} label="Идэвхтэй хэрэглэгч (30 хоног)" value={data.activeUsers === null ? null : String(data.activeUsers)} accent="#df1f3d" />
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

function KpiCard({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string | null; accent: string }) {
  return (
    <div className="rounded-3xl border border-black/7 p-5">
      <span className="grid size-9 place-items-center rounded-2xl" style={{ backgroundColor: `${accent}1a`, color: accent }}><Icon size={17} /></span>
      <p className="mt-4 text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">{label.toUpperCase()}</p>
      {value === null
        ? <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#a9a49a]"><Lock size={13} aria-hidden="true" />Зөвхөн админд</p>
        : <p className="mt-1 font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{value}</p>}
    </div>
  );
}
