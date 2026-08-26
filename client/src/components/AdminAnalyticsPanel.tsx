import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileSpreadsheet, FileText, LoaderCircle, MapPin, ReceiptText, TrendingUp, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadBase64File } from "@/lib/fileDownload";
import { downloadCsv } from "@/lib/csv";

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Тайлан ачаалж чадсангүй.";

type RangeKey = "7d" | "30d" | "90d" | "thisMonth" | "all";

function rangeToDates(range: RangeKey): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();
  if (range === "all") return {};
  if (range === "thisMonth") return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1) };
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { dateFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
}

const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 хоног" },
  { key: "30d", label: "30 хоног" },
  { key: "90d", label: "90 хоног" },
  { key: "thisMonth", label: "Энэ сар" },
  { key: "all", label: "Бүх цаг үе" },
];

/**
 * PREMIUM-FEATURES.md-ийн CRM/analytics хүсэлт (2026-08-26): борлуулалт,
 * дүүргээр захиалга, харилцагчийн нас/мэргэжлийн бүрдүүлэлт — бүгд server/
 * analytics.ts-ийн getAnalyticsReport-оос ирдэг бодит өгөгдөл. Насны/
 * мэргэжлийн хэсэг зөвхөн профайлдаа сайн дураараа мэдээлэл өгсөн
 * харилцагчаар хязгаарлагдана (заавал бөглөх шаардлагагүй) тул "N/M
 * харилцагч мэдээлэл өгсөн" гэдгийг үргэлж тодорхой харуулна — хэзээ ч
 * бүрэн дүүрэн мэт танилцуулахгүй. Дүүргийн задаргаа бол ЗАХИАЛГЫН (хэн
 * худалдаж авсан бэ) өгөгдөл, вэбсайт ЗОЧЛОЛТЫН (хэн зочилсон бэ) өгөгдөл
 * биш — сүүлийнх нь traffic tracking дэд бүтэц шаардана, энэ site-д хараахан
 * байхгүй.
 */
export default function AdminAnalyticsPanel() {
  const [range, setRange] = useState<RangeKey>("30d");
  const dates = useMemo(() => rangeToDates(range), [range]);
  const input = useMemo(() => ({ dateFrom: dates.dateFrom?.toISOString(), dateTo: dates.dateTo?.toISOString() }), [dates]);

  const reportQuery = trpc.admin.analyticsReport.useQuery(input);
  const exportReport = trpc.admin.analyticsExport.useMutation({
    onSuccess: result => { downloadBase64File(result.filename, result.dataBase64, result.mimeType); toast.success("Тайлан татагдлаа."); },
    onError: error => toast.error(messageFrom(error)),
  });

  if (reportQuery.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Аналитикийг ачаалж байна…</div>;
  }
  if (reportQuery.error) {
    return <div className="rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(reportQuery.error)}</div>;
  }
  const report = reportQuery.data;
  if (!report) return null;

  const exportCsvTables = () => {
    downloadCsv(`sugi-analytics-products-${new Date().toISOString().slice(0, 10)}.csv`, ["Бараа", "Зарагдсан тоо", "Орлого (MNT)"], report.topProducts.map(row => [row.productName, row.soldQuantity, row.revenueMnt]));
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-[#f8f5ef] p-1.5">
          {rangeOptions.map(option => (
            <button key={option.key} type="button" onClick={() => setRange(option.key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${range === option.key ? "bg-[#17181b] text-white" : "text-[#57585e] hover:bg-white"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={exportReport.isPending} onClick={() => exportReport.mutate({ ...input, format: "xlsx" })}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:-translate-y-0.5 hover:border-[#2c7650] hover:text-[#2c7650] disabled:opacity-50">
            <FileSpreadsheet size={15} />Excel татах
          </button>
          <button type="button" disabled={exportReport.isPending} onClick={() => exportReport.mutate({ ...input, format: "pdf" })}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:-translate-y-0.5 hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:opacity-50">
            {exportReport.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <FileText size={15} />}PDF татах
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile icon={Wallet} label="Нийт борлуулалт" value={formatMnt(report.overview.revenueMnt)} accent="#2c7650" />
        <KpiTile icon={ReceiptText} label="Захиалгын тоо" value={String(report.overview.orderCount)} accent="#3970a7" />
        <KpiTile icon={TrendingUp} label="Дундаж захиалгын дүн" value={formatMnt(report.overview.aovMnt)} accent="#df1f3d" />
        <KpiTile icon={UsersRound} label="Шинэ / Давтан харилцагч" value={range === "all" ? "—" : `${report.overview.newCustomerCount} / ${report.overview.returningCustomerCount}`} accent="#f0b52d" />
      </div>

      <section className="rounded-3xl border border-black/7 p-5">
        <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Өдөр тутмын орлого</h3>
        {report.revenueTimeseries.length === 0 ? (
          <p className="mt-4 text-sm text-[#77787d]">Сонгосон хугацаанд төлөгдсөн захиалга алга.</p>
        ) : (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.revenueTimeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,24,27,.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={value => String(value).slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} width={44} />
                <Tooltip formatter={(value: number) => formatMnt(value)} labelFormatter={label => `Огноо: ${label}`} contentStyle={{ borderRadius: 12, border: "1px solid rgba(23,24,27,.1)", fontSize: 12 }} />
                <Line type="monotone" dataKey="revenueMnt" name="Орлого" stroke="#df1f3d" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Их зарагдсан бараа</h3>
            <button type="button" onClick={exportCsvTables} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#3970a7]"><Download size={13} />CSV</button>
          </div>
          <RankedTable rows={report.topProducts.map(row => ({ label: row.productName, quantity: row.soldQuantity, revenueMnt: row.revenueMnt }))} emptyLabel="Төлөгдсөн захиалга алга." />
        </section>
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Ангиллаар</h3>
          <RankedTable rows={report.topCategories.map(row => ({ label: row.categoryName, quantity: row.soldQuantity, revenueMnt: row.revenueMnt }))} emptyLabel="Төлөгдсөн захиалга алга." />
        </section>
      </div>

      <section className="rounded-3xl border border-black/7 p-5">
        <div className="flex items-center gap-2"><MapPin size={16} className="text-[#df1f3d]" /><h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Дүүргээр захиалга</h3></div>
        <p className="mt-1 text-xs text-[#8a8b8f]">Хэн худалдаж авсан бэ (хүргэлтийн хаягаар) — вэбсайт зочилсон тоо биш, тэр нь өөр infrastructure шаардана.</p>
        {report.districtBreakdown.districts.length === 0 ? (
          <p className="mt-4 text-sm text-[#77787d]">Дүүргийн мэдээлэлтэй хүргэлтийн захиалга алга.</p>
        ) : (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.districtBreakdown.districts} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,24,27,.08)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="districtLabel" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(value: number) => `${value} захиалга`} contentStyle={{ borderRadius: 12, border: "1px solid rgba(23,24,27,.1)", fontSize: 12 }} />
                <Bar dataKey="orderCount" name="Захиалга" fill="#3970a7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#77787d]">
          <span><strong className="text-[#17181b]">{report.districtBreakdown.storePickupCount}</strong> захиалга — салбараас авсан</span>
          <span><strong className="text-[#17181b]">{report.districtBreakdown.unknownCount}</strong> захиалга — дүүрэг тодорхойгүй</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Насны бүлэг</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">{report.demographics.ageProvidedCount} / {report.demographics.totalCustomerCount} харилцагч профайл дээрээ нас мэдээлсэн (заавал биш) — доорх зөвхөн тэдгээрийг тусгасан.</p>
          {report.demographics.ageBuckets.length === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Одоогоор нас мэдээлсэн харилцагч алга.</p>
          ) : (
            <div className="mt-4 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.demographics.ageBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,24,27,.08)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid rgba(23,24,27,.1)", fontSize: 12 }} />
                  <Bar dataKey="count" name="Харилцагч" fill="#f0b52d" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Мэргэжил (эхний 10)</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">{report.demographics.occupationProvidedCount} / {report.demographics.totalCustomerCount} харилцагч мэдээлсэн.</p>
          {report.demographics.topOccupations.length === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Одоогоор мэргэжил мэдээлсэн харилцагч алга.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {report.demographics.topOccupations.map(row => (
                <li key={row.occupation} className="flex items-center justify-between border-b border-black/6 pb-2 text-sm">
                  <span>{row.occupation}</span><strong className="text-[#17181b]">{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-black/7 p-5">
        <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Гишүүнчлэлийн түвшин</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {report.loyaltyTiers.map(tier => (
            <div key={tier.tierName} className="rounded-2xl bg-[#f8f5ef] p-4 text-center">
              <p className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{tier.customerCount}</p>
              <p className="mt-1 text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">{tier.tierName.toUpperCase()}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: typeof Wallet; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-3xl border border-black/7 p-5">
      <span className="grid size-9 place-items-center rounded-2xl" style={{ backgroundColor: `${accent}1a`, color: accent }}><Icon size={17} /></span>
      <p className="mt-4 text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">{label.toUpperCase()}</p>
      <p className="mt-1 font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{value}</p>
    </div>
  );
}

function RankedTable({ rows, emptyLabel }: { rows: { label: string; quantity: number; revenueMnt: number }[]; emptyLabel: string }) {
  if (!rows.length) return <p className="mt-4 text-sm text-[#77787d]">{emptyLabel}</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[380px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">
            <th className="border-b border-black/8 pb-2">НЭР</th>
            <th className="border-b border-black/8 pb-2 text-right">ТОО</th>
            <th className="border-b border-black/8 pb-2 text-right">ОРЛОГО</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="text-sm">
              <td className="max-w-[220px] truncate border-b border-black/6 py-2.5" title={row.label}>{row.label}</td>
              <td className="border-b border-black/6 py-2.5 text-right font-bold">{row.quantity}</td>
              <td className="border-b border-black/6 py-2.5 text-right text-[#77787d]">{formatMnt(row.revenueMnt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
