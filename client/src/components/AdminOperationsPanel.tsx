import { useState, type ReactNode } from "react";
import { Banknote, Download, FileText, LayoutGrid, List, LoaderCircle, PackageCheck, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { savePdfBase64 } from "@/lib/pdf";
import ManualOrderForm from "./admin/ManualOrderForm";
import OrderEditForm from "./admin/OrderEditForm";
import ProcessOrderTrail from "./admin/process/ProcessOrderTrail";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
// 2026-09-23: огноо ОРОН НУТГИЙН өдрөөр (UTC+8) — toISOString нь 08:00-аас өмнөх захиалгыг өмнөх өдөрт тавьдаг байв.
import { toDayInput } from "@/lib/analyticsRange";
import { trpc } from "@/lib/trpc";
import AdminBulkActionBar from "./AdminBulkActionBar";
import { GenericListView } from "./admin/GenericListView";
import { isRefundable, isRefundOwed, paymentBadgeFor } from "@shared/orders";

// Audit 2026-09-09 (R2): one wording + one colour per money state, shared
// with the customer's own profile via shared/orders.ts.
const paymentToneClass: Record<ReturnType<typeof paymentBadgeFor>["tone"], string> = {
  paid: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  refunded: "bg-[var(--a-soft)] text-[var(--a-text-soft)]",
  "refund-owed": "bg-[#fff5dd] text-[#7a5a12]",
  unpaid: "bg-[var(--a-soft)] text-[var(--a-text)]",
};
import { formatMnt } from "@shared/format";

import { useConfirm } from "@/components/ConfirmDialog";
type OrderStatus = "pending" | "confirmed" | "packed" | "out_for_delivery" | "completed" | "cancelled" | "returned";
const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан", returned: "Буцаагдсан" };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо.";

// Minimal shape the Kanban board actually reads -- decoupled from tRPC's
// exact inferred row type (which the full order card in list mode uses
// directly via a local `(typeof orders)[number]` alias instead).
type KanbanOrder = { id: number; orderNumber: string; customerName: string; totalMnt: number; status: OrderStatus };

// 2026-09-07: this used to also render the Posts composer (section="posts"),
// sharing the file since both were one flat form + list. Posts moved to its
// own AdminPostsPanel.tsx (WordPress-parity rebuild -- a much larger surface
// now: TinyMCE, media library, categories/tags, SEO, trash) so this file is
// orders-only.
export default function AdminOperationsPanel({ preview = false, query = "", role = "admin" }: { preview?: boolean; query?: string; role?: string }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const ordersQuery = trpc.admin.orders.useQuery(undefined, { enabled: !preview });
  const updateOrder = trpc.admin.updateOrder.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const bulkUpdateOrderStatus = trpc.admin.bulkUpdateOrderStatus.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
  // Admin overhaul (2026-09-08, Phase E): this section is now visible to
  // finance too (ordersReadProcedure, server/_core/trpc.ts), since finance
  // needs to find a returned-but-unrefunded order before it can act on it --
  // but finance never gets fulfillment write access (updateOrder stays
  // warehouseProcedure-only, enforced server-side regardless of this client
  // check), and warehouse never gets refund authority (financeProcedure).
  const canManageFulfilment = role === "admin" || role === "warehouse";
  const canRefund = role === "admin" || role === "finance";
  // Устгах нь зөвхөн admin (2026-09-16) — буцаан олгохоос ч дээгүүр эрх.
  const canDeleteOrder = role === "admin";
  const refundOrder = trpc.admin.refundOrder.useMutation({ onSuccess: () => { utils.admin.orders.invalidate(); toast.success("Буцаан олголт бүртгэгдлээ."); setRefundForm(null); }, onError: error => toast.error(messageFrom(error)) });
  const deleteOrder = trpc.admin.deleteOrder.useMutation({ onSuccess: result => { utils.admin.orders.invalidate(); toast.success(`${result.orderNumber} захиалгыг устгалаа.`); }, onError: error => toast.error(messageFrom(error)) });
  const [refundForm, setRefundForm] = useState<{ orderId: number; amountMnt: string; note: string; restock: boolean } | null>(null);
  // Staff-side order writes (2026-09-14): manual order form + in-place edit + PDFs.
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [trailOrderId, setTrailOrderId] = useState<number | null>(null);
  const packingSlip = trpc.admin.packingSlipPdf.useMutation({ onSuccess: ({ fileName, base64 }) => savePdfBase64(fileName, base64), onError: error => toast.error(messageFrom(error)) });
  const staffInvoice = trpc.admin.orderInvoicePdf.useMutation({ onSuccess: ({ fileName, base64 }) => savePdfBase64(fileName, base64), onError: error => toast.error(messageFrom(error)) });
  const isOpenOrder = (status: string) => status !== "completed" && status !== "cancelled" && status !== "returned";
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("confirmed");
  // 2026-09-07 (Project "SUGI Desk" Phase 3): a real, visible Kanban board --
  // one column per order status, exactly the grouped-board view Tom pointed
  // at in Frappe's own Views screenshots. Moving a card between columns
  // reuses the exact same updateOrder mutation the status <select> already
  // used in list mode -- no drag-and-drop library added just for this;
  // Frappe's own Kanban lets you drag OR change the field directly, and the
  // dropdown is the accessible, zero-new-dependency version of the same move.
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const [showExport, setShowExport] = useState(false);
  const [exportStatusFilter, setExportStatusFilter] = useState<"all" | OrderStatus>("all");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");

  const allOrders = preview ? [] : (ordersQuery.data ?? []);
  const searchedOrders = query.trim() ? allOrders.filter(order => [order.orderNumber, order.customerName, order.customerPhone].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) : allOrders;
  // Audit 2026-09-09 (R2): finance's "refund owed" queue -- paid, then
  // cancelled, not yet refunded. A one-click filter with a live count, so
  // nobody has to scan the list for that combination by eye.
  const [refundOwedOnly, setRefundOwedOnly] = useState(false);
  const refundOwedCount = allOrders.filter(isRefundOwed).length;
  const orders = refundOwedOnly ? searchedOrders.filter(isRefundOwed) : searchedOrders;
  type OrderRow = (typeof orders)[number];

  // 2026-09-27 (F-status): cancelled/returned used to apply the instant a
  // status <select> changed, from the board, the list row, or the bulk bar
  // -- each one reverses stock/money (see the rules on cancelling), so all
  // three now confirm first, the same way the delete button already does.
  const changeOrderStatus = async (id: number, status: OrderStatus) => {
    if ((status === "cancelled" || status === "returned")
      && !(await confirm({ title: `Захиалгыг "${statusLabels[status]}" болгох уу? Нөөц/мөнгөний урсгалд нөлөөлнө.`, danger: true }))) return;
    updateOrder.mutate({ id, status });
  };

  // 2026-09-27 (F-refund): `Number(refundForm.amountMnt) || 0` turned an
  // empty/invalid field into a silent 0₮ refund (or NaN, coerced the same
  // way) instead of rejecting it -- a real money action deserves the same
  // client-side guard as everywhere else this pattern was fixed.
  const submitRefund = () => {
    if (!refundForm) return;
    const order = orders.find(row => row.id === refundForm.orderId);
    if (!Number.isInteger(Number(refundForm.amountMnt)) || refundForm.amountMnt.trim() === "") {
      toast.error("Буцаах дүнг зөв бөглөнө үү."); return;
    }
    const amountMnt = Number(refundForm.amountMnt);
    const max = order?.totalMnt ?? Number.MAX_SAFE_INTEGER;
    if (amountMnt < 1 || amountMnt > max) {
      toast.error(`Буцаах дүн 1–${max} хооронд байх ёстой.`); return;
    }
    refundOrder.mutate({ id: refundForm.orderId, refundAmountMnt: amountMnt, refundNote: refundForm.note || undefined, restockItems: refundForm.restock });
  };

  const applyBulkStatus = async () => {
    if (preview) return toast.message("Preview горим", { description: "Багц үйлдэл зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if ((bulkStatus === "cancelled" || bulkStatus === "returned")
      && !(await confirm({ title: `Сонгосон ${selectedOrderIds.size} захиалгыг "${statusLabels[bulkStatus]}" болгох уу? Нөөц/мөнгөний урсгалд нөлөөлнө.`, danger: true }))) return;
    try {
      const result = await bulkUpdateOrderStatus.mutateAsync({ ids: Array.from(selectedOrderIds), status: bulkStatus });
      if (result.failed.length > 0) toast.error(`${result.succeeded.length} шинэчлэгдлээ, ${result.failed.length} амжилтгүй (төлөв буцаах боломжгүй эсвэл хаагдсан захиалга байж болзошгүй).`);
      else toast.success(`${result.succeeded.length} захиалгын төлөв шинэчлэгдлээ.`);
      setSelectedOrderIds(new Set());
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const exportOrdersCsv = () => {
    // 2026-09-23: `new Date("2026-09-01")` нь UTC шөнө дунд (= орон нутгийн
    // 08:00) тул эхлэх өдрийн 00:00–08:00-д орсон захиалга хасагддаг байв.
    // Төгсгөлийн огноо аль хэдийн орон нутгийн цагаар бичигдсэн.
    const from = exportDateFrom ? new Date(`${exportDateFrom}T00:00:00`) : null;
    const to = exportDateTo ? new Date(`${exportDateTo}T23:59:59`) : null;
    const rows = allOrders
      .filter(order => exportStatusFilter === "all" || order.status === exportStatusFilter)
      .filter(order => !from || new Date(order.createdAt) >= from)
      .filter(order => !to || new Date(order.createdAt) <= to)
      .map(order => [order.orderNumber, order.customerName, order.customerPhone, order.customerEmail ?? "", order.totalMnt, statusLabels[order.status] ?? order.status, order.paymentStatus, order.deliveryMethod, toDayInput(new Date(order.createdAt))]);
    if (rows.length === 0) {
      toast.error("Шүүлтэд тохирох захиалга алга.");
      return;
    }
    downloadCsv(`sugi-orders-${toDayInput(new Date())}.csv`, ["Дугаар", "Хэрэглэгч", "Утас", "Имэйл", "Дүн (MNT)", "Төлөв", "Төлбөр", "Хүргэлт", "Огноо"], rows);
  };

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {viewMode === "list" && <label className="flex items-center gap-2 text-xs font-bold text-[var(--a-text-soft)]"><input type="checkbox" checked={orders.length > 0 && selectedOrderIds.size === orders.length} onChange={() => setSelectedOrderIds(selectedOrderIds.size === orders.length ? new Set() : new Set(orders.map(order => order.id)))} className="size-4 accent-[#df1f3d]" />Бүгдийг сонгох</label>}
        <div className="inline-flex rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
          <button type="button" onClick={() => setViewMode("board")} aria-label="Самбар харагдац" title="Самбар (Kanban)" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "board" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-faint)] hover:text-[var(--a-text)]"}`}><LayoutGrid size={14} /></button>
          <button type="button" onClick={() => setViewMode("list")} aria-label="Жагсаалт харагдац" title="Жагсаалт" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "list" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-faint)] hover:text-[var(--a-text)]"}`}><List size={14} /></button>
        </div>
        {refundOwedCount > 0 && (
          <button type="button" onClick={() => setRefundOwedOnly(current => !current)} aria-pressed={refundOwedOnly} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${refundOwedOnly ? "border-[#7a5a12] bg-[#fff5dd] text-[#7a5a12]" : "border-[var(--a-border)] bg-[var(--a-card)] text-[var(--a-text-soft)] hover:border-[#7a5a12]"}`}>
            Буцаан олголт хүлээгдэж буй
            <span className="rounded-full bg-[#7a5a12] px-1.5 py-0.5 text-[10px] text-white">{refundOwedCount}</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
      {canManageFulfilment && <button type="button" disabled={preview} onClick={() => setShowManualOrder(current => !current)} className="inline-flex items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60"><Plus size={14} />Гараар захиалга</button>}
      <button type="button" onClick={() => setShowExport(current => !current)} className="inline-flex items-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-2.5 text-xs font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]"><Download size={14} />Экспорт</button>
      </div>
    </div>
    {showManualOrder && !preview && <ManualOrderForm onDone={() => setShowManualOrder(false)} />}
    {showExport && <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4">
      <label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportStatusFilter} onChange={event => setExportStatusFilter(event.target.value as typeof exportStatusFilter)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо<input type="date" value={exportDateFrom} onChange={event => setExportDateFrom(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо<input type="date" value={exportDateTo} onChange={event => setExportDateTo(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
      <button type="button" onClick={exportOrdersCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button>
    </div>}
    {viewMode === "list" && (
      <AdminBulkActionBar count={selectedOrderIds.size} onClear={() => setSelectedOrderIds(new Set())}>
        <select value={bulkStatus} onChange={event => setBulkStatus(event.target.value as OrderStatus)} className="h-8 rounded-lg border-0 bg-white/15 px-2 text-[11px] font-bold text-white outline-none [&>option]:text-black">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" disabled={bulkUpdateOrderStatus.isPending} onClick={applyBulkStatus} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Төлөв тохируулах</button>
      </AdminBulkActionBar>
    )}
    {ordersQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Захиалгуудыг уншиж байна…</p>}
    {!ordersQuery.isLoading && viewMode === "board" && (
      <OrdersKanbanBoard
        orders={orders}
        onStatusChange={(id, status) => void changeOrderStatus(id, status)}
        disabled={preview || !canManageFulfilment || updateOrder.isPending}
        emptyMessage={<div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div>}
      />
    )}
    {!ordersQuery.isLoading && viewMode === "list" && (
      <GenericListView<OrderRow>
        rows={orders}
        getRowId={order => order.id}
        selectable
        selectedIds={selectedOrderIds}
        onSelectedIdsChange={next => setSelectedOrderIds(next as Set<number>)}
        cardListClassName="grid gap-4"
        emptyMessage={<div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div>}
        renderRow={(order, { selected, toggleSelected }) => (
          <article className="rounded-3xl border border-[var(--a-border)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected} onChange={toggleSelected} aria-label={`${order.orderNumber} сонгох`} className="mt-1 size-4 accent-[#df1f3d]" />
                <div>
                  <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{order.orderNumber}</p>
                  <h3 className="mt-1 font-bold">{order.customerName} · {formatMnt(order.totalMnt)}</h3>
                  <p className="mt-1 text-xs text-[var(--a-muted)]">{order.customerPhone} · {order.deliveryMethod === "store_pickup" ? "Салбараас авах" : order.deliveryAddress ?? "УБ хүргэлт"}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${paymentToneClass[paymentBadgeFor(order).tone]}`}>{paymentBadgeFor(order).label}</span>
            </div>
            <p className="mt-4 text-xs text-[var(--a-text-soft)]">{order.items.map(item => `${item.productName} × ${item.quantity}`).join(" · ")}</p>
            {order.returnRequestedAt && order.status !== "returned" && <p className="mt-2 rounded-xl bg-[#fff5dd] px-3 py-2 text-xs text-[#6c531f]"><strong>Буцаалтын хүсэлт</strong> ({new Date(order.returnRequestedAt).toLocaleDateString("mn-MN")}): {order.returnRequestReason ?? "—"} — шийдвэл төлөвийг "Буцаагдсан" болгож, буцаан олголт бүртгэнэ.</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select value={order.status} disabled={preview || !canManageFulfilment || updateOrder.isPending} onChange={event => { const next = event.target.value as OrderStatus; void changeOrderStatus(order.id, next); }} className="h-10 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-bold disabled:opacity-60">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input defaultValue={order.deliveryTrackingRef ?? ""} disabled={preview || !canManageFulfilment} onBlur={event => { if (!preview && event.target.value !== (order.deliveryTrackingRef ?? "")) updateOrder.mutate({ id: order.id, deliveryTrackingRef: event.target.value || null }); }} placeholder="Хүргэлтийн дугаар" className="h-10 flex-1 rounded-xl border border-[var(--a-border)] px-3 text-xs outline-none focus:border-[#df1f3d] disabled:opacity-60" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {canManageFulfilment && isOpenOrder(order.status) && <button type="button" disabled={preview} onClick={() => setEditingOrderId(current => current === order.id ? null : order.id)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 text-[11px] font-bold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><Pencil size={12} />Засах</button>}
              <button type="button" disabled={preview || packingSlip.isPending} onClick={() => packingSlip.mutate({ orderId: order.id })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 text-[11px] font-bold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><Printer size={12} />Бэлтгэх хуудас</button>
              <button type="button" disabled={preview || staffInvoice.isPending} onClick={() => staffInvoice.mutate({ orderId: order.id })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 text-[11px] font-bold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><FileText size={12} />Баримт PDF</button>
            </div>
            {editingOrderId === order.id && <OrderEditForm order={order} onDone={() => setEditingOrderId(null)} />}
            {!preview && <button type="button" aria-expanded={trailOrderId === order.id} onClick={() => setTrailOrderId(current => current === order.id ? null : order.id)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 text-[11px] font-bold text-[var(--a-text-soft)]">Түүх</button>}
            {trailOrderId === order.id && <ProcessOrderTrail compact orderId={order.id} />}
            <p className="mt-2 text-[11px] text-[var(--a-faint)]">И-баримт: {order.ebarimtStatus === "issued" ? order.ebarimtReceiptId : order.ebarimtStatus === "failed" ? <span className="font-bold text-[#df1f3d]">Алдаа гарсан</span> : "—"}</p>
            {/* Admin overhaul (2026-09-08, Phase E): refund is deliberately its
                own action, not a 3rd option folded into the status <select>
                above -- it's a money decision (financeProcedure server-side),
                distinct from the fulfilment ladder that select controls. */}
            {/* Audit 2026-09-09: a cancelled-but-paid order is refundable too
                (shared/orders.ts isRefundable mirrors server refundOrder). */}
            {canRefund && isRefundable(order) && (
              refundForm?.orderId === order.id ? (
                <div className="mt-3 grid gap-2 rounded-2xl bg-[var(--a-neg-soft)] p-4">
                  <div className="flex flex-wrap gap-2">
                    <label className="grid gap-1 text-xs font-bold">Буцаах дүн (₮)<input type="number" min="1" max={order.totalMnt} value={refundForm.amountMnt} onChange={event => setRefundForm(current => current && { ...current, amountMnt: event.target.value })} className="h-10 w-36 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
                    <label className="grid gap-1 text-xs font-bold">Тэмдэглэл (сонголтоор)<input value={refundForm.note} onChange={event => setRefundForm(current => current && { ...current, note: event.target.value })} className="h-10 w-56 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
                  </div>
                  {/* 2026-09-27: цуцлагдсан захиалгын бараа цуцлах үед аль хэдийн нөөцөд буцсан — сервер ч дахин буцаахгүй. */}
                  {order.status === "cancelled"
                    ? <p className="text-xs text-[var(--a-muted)]">Цуцлагдсан захиалгын бараа нөөцөд аль хэдийн буцсан.</p>
                    : <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={refundForm.restock} onChange={event => setRefundForm(current => current && { ...current, restock: event.target.checked })} className="size-4 accent-[#df1f3d]" />Барааг нөөцөд буцаах</label>}
                  <div className="flex gap-2">
                    <button type="button" disabled={refundOrder.isPending} onClick={submitRefund} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#df1f3d] px-4 text-xs font-bold text-white disabled:opacity-60">{refundOrder.isPending && <LoaderCircle className="animate-spin" size={13} />}Баталгаажуулах</button>
                    <button type="button" onClick={() => setRefundForm(null)} className="h-9 rounded-full border border-[var(--a-border)] px-4 text-xs font-bold text-[var(--a-text-soft)]">Цуцлах</button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={preview} onClick={() => setRefundForm({ orderId: order.id, amountMnt: String(order.totalMnt), note: "", restock: false })} className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-[#df1f3d]/30 px-4 text-xs font-bold text-[#df1f3d] transition hover:bg-[var(--a-neg-soft)]"><Banknote size={14} />Буцаан олгох</button>
              )
            )}
            {/* 2026-09-16 (Tom-ийн хүсэлт). Устгах нь буцаан олгохоос ч
                дээгүүр эрх шаардана (admin): цуцлах нь түүх үлдээдэг бол
                устгах нь мөрийг бүрмөсөн арилгана. Зөвхөн ЦУЦЛАГДСАН,
                ТӨЛӨГДӨӨГҮЙ захиалгад харагдана — сервер мөн ижил хаалттай,
                энэ нь зөвхөн ажиллахгүй товч үзүүлэхгүйн тулд. */}
            {canDeleteOrder && order.status === "cancelled" && order.paymentStatus === "unpaid" && (
              <button
                type="button"
                disabled={preview || deleteOrder.isPending}
                onClick={async () => {
                  if (!await confirm({ title: `${order.orderNumber} захиалгыг бүрмөсөн устгах уу?\n\nЭнэ үйлдэл буцаах боломжгүй. Захиалгын мөр, барааны жагсаалт, нөөцийн хөдөлгөөн бүгд арилна.`, danger: true })) return;
                  deleteOrder.mutate({ id: order.id });
                }}
                className="mt-3 ml-2 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--a-neg)] px-4 text-xs font-bold text-[var(--a-neg)] transition hover:bg-[var(--a-neg-soft)] disabled:opacity-60"
              >
                {deleteOrder.isPending ? <LoaderCircle className="animate-spin" size={13} /> : <Trash2 size={14} />}Захиалга устгах
              </button>
            )}
          </article>
        )}
      />
    )}
  </div>;
}

// 2026-09-07 (Project "SUGI Desk" Phase 3): one column per OrderStatus, exactly
// Frappe's own grouped-board Kanban shape. Kept as a plain function component
// (not wired through GenericListView's card mode) because a board's columns
// need their OWN independent scroll/layout, not a single flat list of rows --
// GenericListView's card mode stays the right tool for a single scrollable
// stack of cards (Brands), not a multi-column board.
function OrdersKanbanBoard({
  orders, onStatusChange, disabled, emptyMessage,
}: {
  orders: KanbanOrder[];
  onStatusChange: (id: number, status: OrderStatus) => void;
  disabled: boolean;
  emptyMessage: ReactNode;
}) {
  if (orders.length === 0) return <>{emptyMessage}</>;
  const columns = Object.keys(statusLabels) as OrderStatus[];
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map(status => {
        const columnOrders = orders.filter(order => order.status === status);
        return (
          <div key={status} className="w-72 shrink-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">{statusLabels[status].toUpperCase()}</p>
              <span className="rounded-full bg-[var(--a-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-text-soft)]">{columnOrders.length}</span>
            </div>
            <div className="grid min-w-0 gap-2.5 rounded-2xl bg-[var(--a-soft)] p-2.5">
              {columnOrders.map(order => (
                <div key={order.id} className="min-w-0 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-3.5">
                  <p className="text-[10px] font-extrabold tracking-[.1em] text-[#df1f3d]">{order.orderNumber}</p>
                  <h4 className="mt-1 text-sm font-bold">{order.customerName}</h4>
                  <p className="mt-0.5 text-xs text-[var(--a-muted)]">{formatMnt(order.totalMnt)}</p>
                  <select
                    value={order.status}
                    disabled={disabled}
                    onChange={event => onStatusChange(order.id, event.target.value as OrderStatus)}
                    className="mt-2.5 h-8 w-full rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-[11px] font-bold outline-none focus:border-[#df1f3d]"
                    aria-label={`${order.orderNumber}-ийн төлөв`}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              ))}
              {columnOrders.length === 0 && <p className="py-6 text-center text-[11px] text-[var(--a-faint)]">Хоосон</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
