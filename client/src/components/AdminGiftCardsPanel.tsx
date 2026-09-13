import { useState } from "react";
import { Ban, Copy, Gift, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";

/**
 * Gift cards (2026-09-13, growth tier). Finance/admin issues codes here
 * (printed or messaged to the buyer by hand for now); the customer redeems
 * the code on /profile -> Гишүүнчлэл, and the amount lands as store credit,
 * which checkout already knows how to spend. Selling cards through checkout
 * (auto-issue on payment) is the follow-up; purchaseOrderId is ready for it.
 */
const formatDateTime = (date: Date | null) => date ? new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const PRESETS = [20_000, 50_000, 100_000, 200_000];

export default function AdminGiftCardsPanel() {
  const utils = trpc.useUtils();
  const query = trpc.admin.giftCards.useQuery();
  const [amount, setAmount] = useState(50_000);
  const [count, setCount] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [months, setMonths] = useState(12);
  const [justIssued, setJustIssued] = useState<string[]>([]);
  const issue = trpc.admin.issueGiftCards.useMutation({
    onSuccess: cards => { toast.success(`${cards.length} бэлгийн карт үүслээ.`); setJustIssued(cards.map(c => c.code)); utils.admin.giftCards.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const voidCard = trpc.admin.voidGiftCard.useMutation({
    onSuccess: () => { toast.success("Карт хүчингүй боллоо."); utils.admin.giftCards.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });

  const cards = query.data ?? [];
  type Card = (typeof cards)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const copy = (code: string) => navigator.clipboard?.writeText(code).then(() => toast.success("Код хуулагдлаа.")).catch(() => toast.error("Хуулж чадсангүй."));
  const statusPill = (card: Card) => {
    const expired = card.status === "active" && card.expiresAt && new Date(card.expiresAt).getTime() < Date.now();
    const label = expired ? "Хугацаа дууссан" : card.status === "active" ? "Идэвхтэй" : card.status === "redeemed" ? "Ашигласан" : "Хүчингүй";
    const tone = card.status === "active" && !expired ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : card.status === "redeemed" ? "bg-[var(--a-soft)] text-[var(--a-muted)]" : "bg-[var(--a-neg-soft)] text-[var(--a-neg)]";
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tone}`}>{label}</span>;
  };
  const columns: GenericListColumn<Card>[] = [
    { id: "code", header: "КОД", headerClassName: headerCell, cellClassName: `${bodyCell} font-mono text-xs font-bold whitespace-nowrap`, render: c => <button type="button" onClick={() => copy(c.code)} className="inline-flex items-center gap-1 hover:underline" title="Хуулах">{c.code}<Copy size={11} /></button> },
    { id: "amount", header: "ДҮН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs font-bold whitespace-nowrap`, render: c => formatMnt(c.amountMnt) },
    { id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell, render: statusPill },
    { id: "recipient", header: "ХҮЛЭЭН АВАГЧ / ТЭМДЭГЛЭЛ", headerClassName: headerCell, cellClassName: `${bodyCell} max-w-xs text-xs text-[var(--a-text-soft)]`, render: c => <>{c.recipientName && <span className="block font-bold">{c.recipientName}</span>}{c.note ?? ""}</> },
    { id: "created", header: "ҮҮССЭН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: c => formatDateTime(c.createdAt) },
    { id: "expires", header: "ДУУСАХ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: c => formatDateTime(c.expiresAt) },
    { id: "redeemed", header: "АШИГЛАСАН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: c => formatDateTime(c.redeemedAt) },
  ];

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-extrabold"><Gift size={16} /> Бэлгийн карт</h2>
      <p className="mt-1 text-xs text-[var(--a-muted)]">Код үүсгээд худалдан авагчид өгнө; тэр /profile → Гишүүнчлэл дээр оруулахад дүн нь дэлгүүрийн зээл болж, checkout дээр ашиглагдана.</p>

      <form onSubmit={event => { event.preventDefault(); issue.mutate({ amountMnt: amount, count, recipientName: recipient.trim() || null, note: note.trim() || null, expiresInMonths: months || null }); }} className="mt-4 grid gap-3 rounded-2xl bg-[var(--a-soft)] p-4 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <label className="grid gap-1.5 text-xs font-bold">Дүн (₮)
          <input type="number" min={1000} step={1000} value={amount} onChange={event => setAmount(Number(event.target.value))} list="gift-presets" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]" />
          <datalist id="gift-presets">{PRESETS.map(p => <option key={p} value={p} />)}</datalist>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Тоо ширхэг
          <input type="number" min={1} max={100} value={count} onChange={event => setCount(Number(event.target.value))} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Хүлээн авагч (сонголтоор)
          <input value={recipient} onChange={event => setRecipient(event.target.value)} maxLength={120} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Тэмдэглэл (сонголтоор)
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="Жишээ: Компанийн бэлэг" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">Хүчинтэй (сар)
          <input type="number" min={0} max={60} value={months} onChange={event => setMonths(Number(event.target.value))} title="0 = хугацаагүй" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]" />
        </label>
        <button type="submit" disabled={issue.isPending || amount < 1000 || count < 1} className="h-10 self-end rounded-full bg-[var(--a-btn-dark,#17181b)] px-5 text-xs font-bold text-white disabled:opacity-50">{issue.isPending ? <LoaderCircle className="animate-spin" size={14} /> : "Үүсгэх"}</button>
      </form>

      {justIssued.length > 0 && (
        <div className="mt-3 rounded-2xl border border-[var(--a-pos)] bg-[var(--a-pos-soft)] p-4 text-xs">
          <p className="font-bold">Шинэ кодууд (нэг удаа л энд харагдана — хуулж аваарай):</p>
          <ul className="mt-2 grid gap-1 font-mono">{justIssued.map(code => <li key={code}><button type="button" onClick={() => copy(code)} className="inline-flex items-center gap-1 hover:underline">{code}<Copy size={11} /></button></li>)}</ul>
        </div>
      )}

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}
      {!query.isLoading && !query.error && (
        <div className="mt-5">
          <GenericListView<Card>
            rows={cards}
            getRowId={c => c.id}
            columns={columns}
            tableClassName="min-w-[900px] w-full border-separate border-spacing-0 text-left"
            rowClassName="text-sm align-top"
            actionsHeaderClassName={headerCell}
            actionsCellClassName={`${bodyCell} text-right whitespace-nowrap`}
            emptyMessage={<><Gift className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Бэлгийн карт үүсгээгүй байна.</>}
            rowActions={c => c.status === "active" ? (
              <button type="button" onClick={() => { if (window.confirm(`${c.code} картыг хүчингүй болгох уу?`)) voidCard.mutate({ id: c.id }); }} disabled={voidCard.isPending} className="rounded-full border border-[var(--a-neg)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-neg)] hover:bg-[var(--a-neg-soft)]"><Ban size={12} className="mr-1 inline" />Хүчингүй</button>
            ) : null}
          />
        </div>
      )}
    </div>
  );
}
