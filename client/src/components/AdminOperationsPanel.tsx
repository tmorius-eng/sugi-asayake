import { useState, type ChangeEvent, type FormEvent } from "react";
import { Download, ImageUp, LoaderCircle, PackageCheck, PencilLine, Send, X } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { trpc } from "@/lib/trpc";
import AdminBulkActionBar from "./AdminBulkActionBar";
import { formatMnt } from "@shared/format";

type Section = "orders" | "posts";
type OrderStatus = "pending" | "confirmed" | "packed" | "out_for_delivery" | "completed" | "cancelled" | "returned";
const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан", returned: "Буцаагдсан" };
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо.";

export default function AdminOperationsPanel({ section, preview = false, query = "" }: { section: Section; preview?: boolean; query?: string }) {
  const utils = trpc.useUtils();
  const ordersQuery = trpc.admin.orders.useQuery(undefined, { enabled: !preview && section === "orders" });
  const postsQuery = trpc.admin.posts.useQuery(undefined, { enabled: !preview && section === "posts" });
  const updateOrder = trpc.admin.updateOrder.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const bulkUpdateOrderStatus = trpc.admin.bulkUpdateOrderStatus.useMutation({ onSuccess: () => utils.admin.orders.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const createPost = trpc.admin.createPost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const updatePost = trpc.admin.updatePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const deletePost = trpc.admin.deletePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const uploadCoverImage = trpc.admin.uploadPostCoverImage.useMutation();
  const [post, setPost] = useState({ title: "", slug: "", excerpt: "", content: "", isPublished: false, coverImageUrl: null as string | null });
  // Non-null while editing an existing post (set by the "Засах" button
  // below) -- the same composer form doubles as the edit form instead of a
  // second one, so savePost branches on this to call updatePost vs
  // createPost.
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("confirmed");
  const [showExport, setShowExport] = useState(false);
  const [exportStatusFilter, setExportStatusFilter] = useState<"all" | OrderStatus>("all");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");

  const emptyPost = { title: "", slug: "", excerpt: "", content: "", isPublished: false, coverImageUrl: null as string | null };

  const savePost = async (event: FormEvent) => {
    event.preventDefault();
    if (preview) return toast.message("Preview горим", { description: "Бодит нийтлэл зөвхөн хамгаалагдсан admin хэсэгт хадгалагдана." });
    try {
      if (editingPostId) {
        await updatePost.mutateAsync({ id: editingPostId, ...post, excerpt: post.excerpt || null });
        toast.success("Нийтлэлийг шинэчиллээ.");
      } else {
        await createPost.mutateAsync({ ...post, excerpt: post.excerpt || null });
        toast.success("Нийтлэлийг хадгаллаа.");
      }
      setPost(emptyPost);
      setEditingPostId(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Нийтлэлийг хадгалж чадсангүй."); }
  };

  // Loads an existing post's fields (cover image included) into the same
  // composer form above, in edit mode -- no second form, minimal diff.
  const startEditPost = (item: { id: number; title: string; slug: string; excerpt: string | null; content: string; isPublished: boolean; coverImageUrl: string | null }) => {
    setEditingPostId(item.id);
    setPost({ title: item.title, slug: item.slug, excerpt: item.excerpt ?? "", content: item.content, isPublished: item.isPublished, coverImageUrl: item.coverImageUrl });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEditPost = () => {
    setEditingPostId(null);
    setPost(emptyPost);
  };

  // Same FileReader -> base64 -> upload-mutation -> store-the-returned-URL
  // pattern as ContentMediaPanel.tsx's uploadForSlot -- only the target
  // field (post.coverImageUrl, local state, not yet saved) differs.
  const handleCoverFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) {
      toast.message("Preview горим", { description: "Зураг байршуулахын тулд хамгаалагдсан /admin хэсэгт нэвтэрнэ үү." });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 8 MB-аас бага зураг сонгоно уу.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadCoverImage.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
        setPost(value => ({ ...value, coverImageUrl: stored.url }));
        toast.success("Зураг байршууллаа.");
      } catch (error) {
        toast.error(messageFrom(error));
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  if (section === "orders") {
    const allOrders = preview ? [] : (ordersQuery.data ?? []);
    const orders = query.trim() ? allOrders.filter(order => [order.orderNumber, order.customerName, order.customerPhone].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) : allOrders;

    const toggleOrderSelection = (id: number) => setSelectedOrderIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
        <label className="flex items-center gap-2 text-xs font-bold text-[#57585e]"><input type="checkbox" checked={orders.length > 0 && selectedOrderIds.size === orders.length} onChange={() => setSelectedOrderIds(selectedOrderIds.size === orders.length ? new Set() : new Set(orders.map(order => order.id)))} className="size-4 accent-[#df1f3d]" />Бүгдийг сонгох</label>
        <button type="button" onClick={() => setShowExport(current => !current)} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]"><Download size={14} />Экспорт</button>
      </div>
      {showExport && <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportStatusFilter} onChange={event => setExportStatusFilter(event.target.value as typeof exportStatusFilter)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо<input type="date" value={exportDateFrom} onChange={event => setExportDateFrom(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
        <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо<input type="date" value={exportDateTo} onChange={event => setExportDateTo(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
        <button type="button" onClick={exportOrdersCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button>
      </div>}
      <AdminBulkActionBar count={selectedOrderIds.size} onClear={() => setSelectedOrderIds(new Set())}>
        <select value={bulkStatus} onChange={event => setBulkStatus(event.target.value as OrderStatus)} className="h-8 rounded-lg border-0 bg-white/15 px-2 text-[11px] font-bold text-white outline-none [&>option]:text-black">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" disabled={bulkUpdateOrderStatus.isPending} onClick={applyBulkStatus} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Төлөв тохируулах</button>
      </AdminBulkActionBar>
      {ordersQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Захиалгуудыг уншиж байна…</p>}
      {orders.length === 0 && !ordersQuery.isLoading ? <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div> : orders.map(order => <article key={order.id} className="rounded-3xl border border-black/7 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><input type="checkbox" checked={selectedOrderIds.has(order.id)} onChange={() => toggleOrderSelection(order.id)} aria-label={`${order.orderNumber} сонгох`} className="mt-1 size-4 accent-[#df1f3d]" /><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{order.orderNumber}</p><h3 className="mt-1 font-bold">{order.customerName} · {formatMnt(order.totalMnt)}</h3><p className="mt-1 text-xs text-[#707176]">{order.customerPhone} · {order.deliveryMethod === "store_pickup" ? "Салбараас авах" : order.deliveryAddress ?? "УБ хүргэлт"}</p></div></div><span className="rounded-full bg-[#f8f5ef] px-3 py-1 text-xs font-bold">{order.paymentStatus === "paid" ? "Төлөгдсөн" : "Төлбөр хүлээж буй"}</span></div><p className="mt-4 text-xs text-[#55565b]">{order.items.map(item => `${item.productName} × ${item.quantity}`).join(" · ")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={order.status} disabled={preview || updateOrder.isPending} onChange={event => updateOrder.mutate({ id: order.id, status: event.target.value as OrderStatus })} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-bold">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input defaultValue={order.deliveryTrackingRef ?? ""} onBlur={event => { if (!preview && event.target.value !== (order.deliveryTrackingRef ?? "")) updateOrder.mutate({ id: order.id, deliveryTrackingRef: event.target.value || null }); }} placeholder="Хүргэлтийн дугаар" className="h-10 flex-1 rounded-xl border border-black/10 px-3 text-xs outline-none focus:border-[#df1f3d]" /></div><p className="mt-2 text-[11px] text-[#8b8c90]">И-баримт: {order.ebarimtStatus === "issued" ? order.ebarimtReceiptId : order.ebarimtStatus === "failed" ? <span className="font-bold text-[#df1f3d]">Алдаа гарсан</span> : "—"}</p></article>)}
    </div>;
  }

  const posts = preview ? [] : (postsQuery.data ?? []);
  const savingPost = createPost.isPending || updatePost.isPending;
  return <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
    <form onSubmit={savePost} className="rounded-3xl bg-[#f8f5ef] p-5">
      <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{editingPostId ? "НИЙТЛЭЛ ЗАСАХ" : "LIVE POST COMPOSER"}</p>
      <label className="mt-4 grid gap-1.5 text-xs font-bold">Ковэр зураг
        {post.coverImageUrl
          ? <div className="relative mt-1 overflow-hidden rounded-xl border border-black/10"><img src={post.coverImageUrl} alt="" className="h-36 w-full object-cover" /><button type="button" onClick={() => setPost(value => ({ ...value, coverImageUrl: null }))} aria-label="Ковэр зураг хасах" className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-[#df1f3d]"><X size={14} /></button></div>
          : <label className="mt-1 flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-white text-xs font-normal text-[#8b8c90] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
              {uploadCoverImage.isPending ? <LoaderCircle className="animate-spin" size={20} /> : <ImageUp size={20} />}
              {uploadCoverImage.isPending ? "Байршуулж байна…" : "Зураг сонгох (JPG/PNG/WEBP, 8MB хүртэл)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverFile} disabled={uploadCoverImage.isPending} className="hidden" />
            </label>}
      </label>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">Гарчиг<input required value={post.title} onChange={event => setPost(value => ({ ...value, title: event.target.value, slug: value.slug || slugify(event.target.value) }))} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">URL slug<input required value={post.slug} onChange={event => setPost(value => ({ ...value, slug: event.target.value }))} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">Товч тайлбар<textarea value={post.excerpt} onChange={event => setPost(value => ({ ...value, excerpt: event.target.value }))} className="min-h-16 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">Нийтлэл<textarea required value={post.content} onChange={event => setPost(value => ({ ...value, content: event.target.value }))} className="min-h-28 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
      <label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={post.isPublished} onChange={event => setPost(value => ({ ...value, isPublished: event.target.checked }))} />Шууд нийтлэх</label>
      <div className="mt-4 flex items-center gap-3">
        {/* Disabled while an upload is still in flight, not just while
            saving -- otherwise clicking save right after picking a cover
            image (before uploadCoverImage.mutateAsync has resolved and
            set post.coverImageUrl) silently creates/updates the post with
            no cover at all. Found via QA: a fast click-through hit this
            exact race. */}
        <button disabled={savingPost || uploadCoverImage.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#17181b] px-5 py-3 text-xs font-bold text-white disabled:opacity-60"><Send size={14} />{uploadCoverImage.isPending ? "Зураг байршуулж байна…" : savingPost ? "Хадгалж байна…" : editingPostId ? "Шинэчлэх" : "Хадгалах"}</button>
        {editingPostId && <button type="button" onClick={cancelEditPost} className="text-xs font-bold text-[#77787d] hover:text-[#df1f3d]">Цуцлах</button>}
      </div>
    </form>
    <section className="grid gap-3">
      {postsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Нийтлэлүүдийг уншиж байна…</p>}
      {posts.length === 0 && !postsQuery.isLoading ? <div className="rounded-3xl bg-[#eef3f1] p-7 text-center text-sm text-[#707176]"><PencilLine className="mx-auto mb-3 text-[#3970a7]" size={27} />Одоогоор нийтлэл алга.</div> : posts.map(item => <div key={item.id} className="flex gap-3 rounded-2xl border border-black/7 p-4">
        {item.coverImageUrl && <img src={item.coverImageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />}
        <div className="flex flex-1 justify-between gap-3">
          <div><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-[11px] text-[#77787d]">/{item.slug} · {item.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span></div>
          <div className="flex shrink-0 items-start gap-3">
            <button type="button" onClick={() => startEditPost(item)} className="text-xs font-bold text-[#3970a7] hover:text-[#df1f3d]">Засах</button>
            <button type="button" onClick={() => { if (window.confirm(`"${item.title}" нийтлэлийг устгах уу?`)) deletePost.mutate({ id: item.id }); }} className="text-xs font-bold text-[#a51630]">Устгах</button>
          </div>
        </div>
      </div>)}
    </section>
  </div>;
}
