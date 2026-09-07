import { useState, type ReactNode } from "react";
import { Download, LayoutGrid, List, LoaderCircle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { trpc } from "@/lib/trpc";
import AdminBulkActionBar from "./AdminBulkActionBar";
import { GenericListView } from "./admin/GenericListView";
import { formatMnt } from "@shared/format";

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
export default function AdminOperationsPanel({ preview = false, query = "" }: { preview?: boolean; query?: string }) {
  const utils = trpc.useUtils();
  const ordersQuery = trpc.admin.orders.useQuery(undefined, { enabled: !preview });
  const updateOrder = trpc.admin.updateOrder.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const bulkUpdateOrderStatus = trpc.admin.bulkUpdateOrderStatus.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
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
  const orders = query.trim() ? allOrders.filter(order => [order.orderNumber, order.customerName, order.customerPhone].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) : allOrders;
  type OrderRow = (typeof orders)[number];

  const applyBulkStatus = async () => {
    if (preview) return toast.message("Preview горим", { description: "Багц үйлдэл зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
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
    const from = exportDateFrom ? new Date(exportDateFrom) : null;
    const to = exportDateTo ? new Date(`${exportDateTo}T23:59:59`) : null;
    const rows = allOrders
      .filter(order => exportStatusFilter === "all" || order.status === exportStatusFilter)
      .filter(order => !from || new Date(order.createdAt) >= from)
      .filter(order => !to || new Date(order.createdAt) <= to)
      .map(order => [order.orderNumber, order.customerName, order.customerPhone, order.customerEmail ?? "", order.totalMnt, statusLabels[order.status] ?? order.status, order.paymentStatus, order.deliveryMethod, new Date(order.createdAt).toISOString().slice(0, 10)]);
    if (rows.length === 0) {
      toast.error("Шүүлтэд тохирох захиалга алга.");
      return;
    }
    downloadCsv(`sugi-orders-${new Date().toISOString().slice(0, 10)}.csv`, ["Дугаар", "Хэрэглэгч", "Утас", "Имэйл", "Дүн (MNT)", "Төлөв", "Төлбөр", "Хүргэлт", "Огноо"], rows);
  };

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {viewMode === "list" && <label className="flex items-center gap-2 text-xs font-bold text-[#57585e]"><input type="checkbox" checked={orders.length > 0 && selectedOrderIds.size === orders.length} onChange={() => setSelectedOrderIds(selectedOrderIds.size === orders.length ? new Set() : new Set(orders.map(order => order.id)))} className="size-4 accent-[#df1f3d]" />Бүгдийг сонгох</label>}
        <div className="inline-flex rounded-full border border-black/10 bg-white p-1">
          <button type="button" onClick={() => setViewMode("board")} aria-label="Самбар харагдац" title="Самбар (Kanban)" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "board" ? "bg-[#17181b] text-white" : "text-[#8a8b8f] hover:text-[#17181b]"}`}><LayoutGrid size={14} /></button>
          <button type="button" onClick={() => setViewMode("list")} aria-label="Жагсаалт харагдац" title="Жагсаалт" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "list" ? "bg-[#17181b] text-white" : "text-[#8a8b8f] hover:text-[#17181b]"}`}><List size={14} /></button>
        </div>
      </div>
      <button type="button" onClick={() => setShowExport(current => !current)} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]"><Download size={14} />Экспорт</button>
    </div>
    {showExport && <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4">
      <label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportStatusFilter} onChange={event => setExportStatusFilter(event.target.value as typeof exportStatusFilter)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо<input type="date" value={exportDateFrom} onChange={event => setExportDateFrom(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо<input type="date" value={exportDateTo} onChange={event => setExportDateTo(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
      <button type="button" onClick={exportOrdersCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button>
    </div>}
    {viewMode === "list" && (
      <AdminBulkActionBar count={selectedOrderIds.size} onClear={() => setSelectedOrderIds(new Set())}>
        <select value={bulkStatus} onChange={event => setBulkStatus(event.target.value as OrderStatus)} className="h-8 rounded-lg border-0 bg-white/15 px-2 text-[11px] font-bold text-white outline-none [&>option]:text-black">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" disabled={bulkUpdateOrderStatus.isPending} onClick={applyBulkStatus} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Төлөв тохируулах</button>
      </AdminBulkActionBar>
    )}
    {ordersQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Захиалгуудыг уншиж байна…</p>}
    {!ordersQuery.isLoading && viewMode === "board" && (
      <OrdersKanbanBoard
        orders={orders}
        onStatusChange={(id, status) => updateOrder.mutate({ id, status })}
        disabled={preview || updateOrder.isPending}
        emptyMessage={<div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div>}
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
        emptyMessage={<div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div>}
        renderRow={(order, { selected, toggleSelected }) => (
          <article className="rounded-3xl border border-black/7 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected} onChange={toggleSelected} aria-label={`${order.orderNumber} сонгох`} className="mt-1 size-4 accent-[#df1f3d]" />
                <div>
                  <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{order.orderNumber}</p>
                  <h3 className="mt-1 font-bold">{order.customerName} · {formatMnt(order.totalMnt)}</h3>
                  <p className="mt-1 text-xs text-[#707176]">{order.customerPhone} · {order.deliveryMethod === "store_pickup" ? "Салбараас авах" : order.deliveryAddress ?? "УБ хүргэлт"}</p>
                </div>
              </div>
              <span className="rounded-full bg-[#f8f5ef] px-3 py-1 text-xs font-bold">{order.paymentStatus === "paid" ? "Төлөгдсөн" : "Төлбөр хүлээж буй"}</span>
            </div>
            <p className="mt-4 text-xs text-[#55565b]">{order.items.map(item => `${item.productName} × ${item.quantity}`).join(" · ")}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select value={order.status} disabled={preview || updateOrder.isPending} onChange={event => updateOrder.mutate({ id: order.id, status: event.target.value as OrderStatus })} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-bold">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input defaultValue={order.deliveryTrackingRef ?? ""} onBlur={event => { if (!preview && event.target.value !== (order.deliveryTrackingRef ?? "")) updateOrder.mutate({ id: order.id, deliveryTrackingRef: event.target.value || null }); }} placeholder="Хүргэлтийн дугаар" className="h-10 flex-1 rounded-xl border border-black/10 px-3 text-xs outline-none focus:border-[#df1f3d]" />
            </div>
            <p className="mt-2 text-[11px] text-[#8b8c90]">И-баримт: {order.ebarimtStatus === "issued" ? order.ebarimtReceiptId : order.ebarimtStatus === "failed" ? <span className="font-bold text-[#df1f3d]">Алдаа гарсан</span> : "—"}</p>
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
              <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">{statusLabels[status].toUpperCase()}</p>
              <span className="rounded-full bg-[#f8f5ef] px-2 py-0.5 text-[10px] font-extrabold text-[#57585e]">{columnOrders.length}</span>
            </div>
            <div className="grid min-w-0 gap-2.5 rounded-2xl bg-[#f8f5ef]/60 p-2.5">
              {columnOrders.map(order => (
                <div key={order.id} className="min-w-0 rounded-2xl border border-black/7 bg-white p-3.5">
                  <p className="text-[10px] font-extrabold tracking-[.1em] text-[#df1f3d]">{order.orderNumber}</p>
                  <h4 className="mt-1 text-sm font-bold">{order.customerName}</h4>
                  <p className="mt-0.5 text-xs text-[#707176]">{formatMnt(order.totalMnt)}</p>
                  <select
                    value={order.status}
                    disabled={disabled}
                    onChange={event => onStatusChange(order.id, event.target.value as OrderStatus)}
                    className="mt-2.5 h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-[11px] font-bold outline-none focus:border-[#df1f3d]"
                    aria-label={`${order.orderNumber}-ийн төлөв`}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              ))}
              {columnOrders.length === 0 && <p className="py-6 text-center text-[11px] text-[#b7b8bc]">Хоосон</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
