import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import type { AdminSection } from "../../AdminWorkspace";
import { SECTION_ROLES } from "../AdminSidebar";

/**
 * "Хүлээгдэж буй хүний шийдвэр" — зөвхөн холбоос. Батлах/зөвшөөрөх дэлгэцийг
 * энд дахин бүтээхгүй (тооллого, шилжүүлэг, вендор — тэдний өөрийн хэсэгт).
 */
export default function ProcessHumanQueue({ role, onNavigate, onSearchIn, onOpenStage }: {
  role: string;
  onNavigate: (section: AdminSection) => void;
  onSearchIn: (section: AdminSection, query: string) => void;
  onOpenStage: (status: string, stuckOnly: boolean) => void;
}) {
  const overview = trpc.admin.process.overview.useQuery({ stuckHours: 24 });
  const returns = trpc.admin.process.returnRequests.useQuery();
  const human = overview.data?.pendingHuman;
  if (!human) return null;
  const returnRows = returns.data ?? [];
  // Холбоос зөвхөн тухайн эрх нээж чадах хэсэг рүү (SECTION_ROLES) — finance-д "Тооллого руу" үхсэн товч байхгүй.
  const canOpen = (section: AdminSection) => SECTION_ROLES[section]?.has(role) ?? false;

  const cards: { key: string; title: string; count: number; body?: ReactNode; action?: { label: string; run: () => void } }[] = [
    {
      key: "returns",
      title: "Буцаалтын хүсэлт",
      count: human.returnRequests,
      body: returnRows.length > 0 ? (
        <ul className="mt-2 grid gap-1">
          {returnRows.map(row => (
            <li key={row.id}>
              <button type="button" onClick={() => onSearchIn("orders", row.orderNumber)} className="w-full min-w-0 rounded-lg px-2 py-1 text-left text-[11px] hover:bg-[var(--a-soft-hover)]">
                <span className="font-bold">{row.orderNumber}</span> · {formatMnt(row.totalMnt)}
              </button>
            </li>
          ))}
        </ul>
      ) : undefined,
    },
    { key: "unpaid", title: "24 цагаас дээш төлөгдөөгүй QPay/StorePay захиалга", count: human.unpaidWebhookOrders24h, action: { label: "Хүлээгдэж буй захиалгууд", run: () => onOpenStage("pending", true) } },
    { key: "counts", title: "Илгээсэн тооллого (батлах)", count: human.submittedStockCounts, action: canOpen("receiving") ? { label: "Тооллого руу", run: () => onNavigate("receiving") } : undefined },
    { key: "transfers", title: "Шилжүүлгийн зөрүү", count: human.openTransferDiscrepancies, action: canOpen("receiving") ? { label: "Шилжүүлэг рүү", run: () => onNavigate("receiving") } : undefined },
  ];
  const open = cards.filter(card => card.count > 0);

  return (
    <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4" aria-label="Хүлээгдэж буй хүний шийдвэр">
      <h2 className="text-sm font-bold">Хүлээгдэж буй хүний шийдвэр</h2>
      {open.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--a-pos)]">Хүний шийдвэр хүлээж буй алхам алга ✓</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {open.map(card => (
            <div key={card.key} className="min-w-0 rounded-xl bg-[var(--a-soft)] p-3">
              <p className="flex items-start justify-between gap-2 text-xs font-bold"><span className="min-w-0">{card.title}</span><span className="rounded-full bg-[var(--a-warn-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-warn)]" aria-hidden="true">{card.count}</span></p>
              <span className="sr-only">{card.count}</span>
              {card.body}
              {card.action && <button type="button" onClick={card.action.run} className="mt-2 h-8 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">{card.action.label}</button>}
            </div>
          ))}
        </div>
      )}
      {canOpen("integrations") && <button type="button" onClick={() => onNavigate("integrations")} className="mt-3 h-8 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">Вендорын зөрүү батлах → Интеграцууд</button>}
    </section>
  );
}
