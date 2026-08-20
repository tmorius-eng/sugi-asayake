import { useState, type FormEvent } from "react";
import { LoaderCircle, PackageCheck, PencilLine, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Section = "orders" | "posts";
const statusLabels: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэсэн", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцалсан" };
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;

export default function AdminOperationsPanel({ section, preview = false }: { section: Section; preview?: boolean }) {
  const utils = trpc.useUtils();
  const ordersQuery = trpc.admin.orders.useQuery(undefined, { enabled: !preview && section === "orders" });
  const postsQuery = trpc.admin.posts.useQuery(undefined, { enabled: !preview && section === "posts" });
  const updateOrder = trpc.admin.updateOrder.useMutation({ onSuccess: () => utils.admin.orders.invalidate() });
  const createPost = trpc.admin.createPost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const deletePost = trpc.admin.deletePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const [post, setPost] = useState({ title: "", slug: "", excerpt: "", content: "", isPublished: false });

  const savePost = async (event: FormEvent) => {
    event.preventDefault();
    if (preview) return toast.message("Preview горим", { description: "Бодит нийтлэл зөвхөн хамгаалагдсан admin хэсэгт хадгалагдана." });
    try {
      await createPost.mutateAsync({ ...post, excerpt: post.excerpt || null, coverImageUrl: null });
      setPost({ title: "", slug: "", excerpt: "", content: "", isPublished: false });
      toast.success("Нийтлэлийг хадгаллаа.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Нийтлэлийг хадгалж чадсангүй."); }
  };

  if (section === "orders") {
    const orders = preview ? [] : (ordersQuery.data ?? []);
    return <div className="grid gap-4">{ordersQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Захиалгуудыг уншиж байна…</p>}{orders.length === 0 && !ordersQuery.isLoading ? <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]"><PackageCheck className="mx-auto mb-3 text-[#df1f3d]" size={28} />Одоогоор бодит захиалга алга.</div> : orders.map(order => <article key={order.id} className="rounded-3xl border border-black/7 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{order.orderNumber}</p><h3 className="mt-1 font-bold">{order.customerName} · {formatMnt(order.totalMnt)}</h3><p className="mt-1 text-xs text-[#707176]">{order.customerPhone} · {order.deliveryMethod === "store_pickup" ? "Салбараас авах" : order.deliveryAddress ?? "УБ хүргэлт"}</p></div><span className="rounded-full bg-[#f8f5ef] px-3 py-1 text-xs font-bold">{order.paymentStatus === "paid" ? "Төлөгдсөн" : "Төлбөр хүлээж буй"}</span></div><p className="mt-4 text-xs text-[#55565b]">{order.items.map(item => `${item.productName} × ${item.quantity}`).join(" · ")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={order.status} disabled={preview || updateOrder.isPending} onChange={event => updateOrder.mutate({ id: order.id, status: event.target.value as "pending" | "confirmed" | "packed" | "out_for_delivery" | "completed" | "cancelled" })} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-bold">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input defaultValue={order.deliveryTrackingRef ?? ""} onBlur={event => { if (!preview && event.target.value !== (order.deliveryTrackingRef ?? "")) updateOrder.mutate({ id: order.id, deliveryTrackingRef: event.target.value || null }); }} placeholder="Хүргэлтийн дугаар" className="h-10 flex-1 rounded-xl border border-black/10 px-3 text-xs outline-none focus:border-[#df1f3d]" /></div></article>)}</div>;
  }

  const posts = preview ? [] : (postsQuery.data ?? []);
  return <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><form onSubmit={savePost} className="rounded-3xl bg-[#f8f5ef] p-5"><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">LIVE POST COMPOSER</p><label className="mt-4 grid gap-1.5 text-xs font-bold">Гарчиг<input required value={post.title} onChange={event => setPost(value => ({ ...value, title: event.target.value, slug: value.slug || slugify(event.target.value) }))} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="mt-3 grid gap-1.5 text-xs font-bold">URL slug<input required value={post.slug} onChange={event => setPost(value => ({ ...value, slug: event.target.value }))} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="mt-3 grid gap-1.5 text-xs font-bold">Товч тайлбар<textarea value={post.excerpt} onChange={event => setPost(value => ({ ...value, excerpt: event.target.value }))} className="min-h-16 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="mt-3 grid gap-1.5 text-xs font-bold">Нийтлэл<textarea required value={post.content} onChange={event => setPost(value => ({ ...value, content: event.target.value }))} className="min-h-28 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={post.isPublished} onChange={event => setPost(value => ({ ...value, isPublished: event.target.checked }))} />Шууд нийтлэх</label><button disabled={createPost.isPending} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#17181b] px-5 py-3 text-xs font-bold text-white"><Send size={14} />{createPost.isPending ? "Хадгалж байна…" : "Хадгалах"}</button></form><section className="grid gap-3">{postsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Нийтлэлүүдийг уншиж байна…</p>}{posts.length === 0 && !postsQuery.isLoading ? <div className="rounded-3xl bg-[#eef3f1] p-7 text-center text-sm text-[#707176]"><PencilLine className="mx-auto mb-3 text-[#3970a7]" size={27} />Одоогоор нийтлэл алга.</div> : posts.map(item => <div key={item.id} className="rounded-2xl border border-black/7 p-4"><div className="flex justify-between gap-3"><div><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-[11px] text-[#77787d]">/{item.slug} · {item.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span></div><button type="button" onClick={() => { if (window.confirm(`“${item.title}” нийтлэлийг устгах уу?`)) deletePost.mutate({ id: item.id }); }} className="text-xs font-bold text-[#a51630]">Устгах</button></div></div>)}</section></div>;
}
