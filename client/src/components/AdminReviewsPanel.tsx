import { useState } from "react";
import { CheckCircle2, EyeOff, LoaderCircle, MessageSquare, MessageSquareOff, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";

import { useConfirm } from "@/components/ConfirmDialog";
// PREMIUM-FEATURES.md TIER 2: "жижиг moderation хэсэг" — a flat, filterable
// list an admin/staff can approve/hide/delete from, not a pre-publish
// approval queue (reviews already go live immediately once the
// verified-purchase gate lets someone post — see server/db.ts
// createProductReview).
const formatDateTime = (date: Date) => new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" });
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

function Stars({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill={n <= value ? "#f0b52d" : "none"} stroke={n <= value ? "#f0b52d" : "#c7c8cc"} />)}</span>;
}

export default function AdminReviewsPanel() {
  const { confirm } = useConfirm();
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "hidden">("all");
  const utils = trpc.useUtils();
  const query = trpc.admin.reviews.useQuery();
  const reviews = (query.data ?? []).filter(review => statusFilter === "all" || (statusFilter === "approved") === review.isApproved);

  const updateApproval = trpc.admin.updateReviewApproval.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.isApproved ? "Сэтгэгдэл дахин харагдах боллоо." : "Сэтгэгдлийг нуулаа.");
      utils.admin.reviews.invalidate();
    },
    onError: error => toast.error(messageFrom(error)),
  });
  const deleteReview = trpc.admin.deleteReview.useMutation({
    onSuccess: () => { toast.success("Сэтгэгдэл устгагдлаа."); utils.admin.reviews.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  // 2026-09-13 (Tom): edit text/rating and manage replies from here too.
  const [editing, setEditing] = useState<{ id: number; rating: number; comment: string } | null>(null);
  const [repliesFor, setRepliesFor] = useState<number | null>(null);
  const updateReview = trpc.admin.updateReview.useMutation({
    onSuccess: () => { toast.success("Сэтгэгдэл засагдлаа."); setEditing(null); utils.admin.reviews.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const repliesQuery = trpc.admin.reviewReplies.useQuery({ reviewId: repliesFor ?? 0 }, { enabled: repliesFor !== null });
  const updateReply = trpc.admin.updateReviewReply.useMutation({
    onSuccess: () => { toast.success("Хариулт шинэчлэгдлээ."); repliesQuery.refetch(); utils.admin.reviews.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const deleteReply = trpc.admin.deleteReviewReply.useMutation({
    onSuccess: () => { toast.success("Хариулт устгагдлаа."); repliesQuery.refetch(); utils.admin.reviews.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });

  type Review = (typeof reviews)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<Review>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: review => formatDateTime(review.createdAt) },
    { id: "product", header: "БҮТЭЭГДЭХҮҮН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: review => <a href={`/product/${review.productSlug}`} target="_blank" rel="noreferrer" className="font-bold text-[var(--a-text)] hover:text-[#df1f3d]">{review.productName}</a> },
    { id: "rating", header: "ҮНЭЛГЭЭ", headerClassName: headerCell, cellClassName: bodyCell, render: review => <Stars value={review.rating} /> },
    { id: "comment", header: "СЭТГЭГДЭЛ", headerClassName: headerCell, cellClassName: `${bodyCell} max-w-xs text-xs text-[var(--a-text-soft)]`, render: review => <>
      {review.comment ?? <span className="text-[var(--a-faint)]">Сэтгэгдэл бичээгүй</span>}
      {review.imageUrl ? (
        <span className="mt-2 flex items-center gap-2">
          <a href={review.imageUrl} target="_blank" rel="noreferrer"><img src={review.imageUrl} alt="Худалдан авагчийн зураг" className="h-14 w-14 rounded-lg object-cover" loading="lazy" /></a>
          <button type="button" className="rounded-full border border-[var(--a-neg)] px-2.5 py-1 text-[11px] font-bold text-[var(--a-neg)]" onClick={async () => { if (await confirm({ title: "Энэ сэтгэгдлийн зургийг хасах уу?", body: "Сэтгэгдэл, үнэлгээ нь хэвээр үлдэнэ.", confirmLabel: "Зургийг хасах", danger: true })) updateReview.mutate({ id: review.id, imageUrl: null }); }}>Зураг хасах</button>
        </span>
      ) : null}
    </> },
    { id: "author", header: "ЗОХИОГЧ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: review => <><span className="block font-bold">{review.reviewerName ?? "Нэргүй"}</span><span className="text-[var(--a-faint)]">{review.reviewerEmail}</span></> },
    {
      id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell,
      render: review => review.isApproved
        ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]"><CheckCircle2 size={11} />Идэвхтэй</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]"><MessageSquareOff size={11} />Нуугдсан</span>,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Төлөв
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="all">Бүгд</option>
            <option value="approved">Идэвхтэй</option>
            <option value="hidden">Нуугдсан</option>
          </select>
        </label>
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5">
          <GenericListView<Review>
            rows={reviews}
            getRowId={review => review.id}
            columns={columns}
            tableClassName="min-w-[820px] w-full border-separate border-spacing-0 text-left"
            rowClassName="text-sm align-top"
            actionsHeaderClassName={headerCell}
            actionsCellClassName={`${bodyCell} text-right whitespace-nowrap`}
            emptyMessage={<><Star className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Тохирох сэтгэгдэл олдсонгүй.</>}
            rowActions={review => (
              <>
                <button type="button" onClick={() => setEditing({ id: review.id, rating: review.rating, comment: review.comment ?? "" })} className="mr-2 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--a-soft)]" aria-label="Засах"><Pencil size={12} className="inline" /> Засах</button>
                <button type="button" onClick={() => setRepliesFor(review.id)} className="mr-2 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--a-soft)]" aria-label="Хариултууд"><MessageSquare size={12} className="inline" /> Хариулт{review.replyCount ? ` ${review.replyCount}` : ""}</button>
                <button type="button" onClick={() => updateApproval.mutate({ id: review.id, isApproved: !review.isApproved })} disabled={updateApproval.isPending} className="mr-2 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:opacity-50">{review.isApproved ? <EyeOff size={13} className="inline" /> : <CheckCircle2 size={13} className="inline" />} {review.isApproved ? "Нуух" : "Сэргээх"}</button>
                <button type="button" onClick={async () => { if (await confirm({ title: "Энэ сэтгэгдлийг бүрмөсөн устгах уу?", danger: true })) deleteReview.mutate({ id: review.id }); }} disabled={deleteReview.isPending} className="rounded-full border border-[#df1f3d]/25 px-3 py-1.5 text-[11px] font-bold text-[var(--a-neg)] transition hover:border-[#df1f3d] disabled:opacity-50"><Trash2 size={13} className="inline" /> Устгах</button>
              </>
            )}
          />
        </div>
      )}

      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Сэтгэгдэл засах" className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <form onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); updateReview.mutate({ id: editing.id, rating: editing.rating, comment: editing.comment.trim() || null }); }} className="w-full max-w-lg rounded-2xl bg-[var(--a-card)] p-6 shadow-xl">
            <h3 className="text-sm font-extrabold">Сэтгэгдэл засах</h3>
            <div className="mt-3 flex items-center gap-1">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} onClick={() => setEditing({ ...editing, rating: n })} aria-label={`${n} од`} aria-pressed={editing.rating === n}><Star size={22} fill={n <= editing.rating ? "#f0b52d" : "none"} stroke={n <= editing.rating ? "#f0b52d" : "#c7c8cc"} /></button>)}</div>
            <textarea value={editing.comment} onChange={event => setEditing({ ...editing, comment: event.target.value })} maxLength={2000} rows={5} className="mt-3 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] p-3 text-sm" placeholder="Сэтгэгдлийн текст (хоосон бол зөвхөн үнэлгээ)" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-[var(--a-border)] px-4 py-2 text-xs font-bold">Болих</button>
              <button type="submit" disabled={updateReview.isPending} className="rounded-full bg-[var(--a-btn-dark,#17181b)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{updateReview.isPending ? "Хадгалж байна…" : "Хадгалах"}</button>
            </div>
          </form>
        </div>
      )}

      {repliesFor !== null && (
        <div role="dialog" aria-modal="true" aria-label="Хариултууд" className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-4" onClick={() => setRepliesFor(null)}>
          <div onClick={event => event.stopPropagation()} className="w-full max-w-xl rounded-2xl bg-[var(--a-card)] p-6 shadow-xl">
            <h3 className="text-sm font-extrabold">Хариултууд</h3>
            {repliesQuery.isLoading ? <p className="mt-3 text-xs text-[var(--a-muted)]">Уншиж байна…</p>
              : (repliesQuery.data ?? []).length === 0 ? <p className="mt-3 text-xs text-[var(--a-muted)]">Хариулт алга.</p>
              : <ul className="mt-3 grid gap-3">{(repliesQuery.data ?? []).map(reply => (
                <li key={reply.id} className="rounded-xl border border-[var(--a-border)] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold">{reply.authorName ?? "Нэргүй"}</span><span className="text-[var(--a-muted)]">{formatDateTime(reply.createdAt)}{!reply.isApproved ? " · нуугдсан" : ""}</span></div>
                  <textarea defaultValue={reply.body} maxLength={2000} rows={2} className="mt-2 w-full rounded-lg border border-[var(--a-border)] bg-[var(--a-soft)] p-2" onBlur={event => { const body = event.target.value.trim(); if (body && body !== reply.body) updateReply.mutate({ id: reply.id, body }); }} aria-label="Хариултын текст" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => updateReply.mutate({ id: reply.id, isApproved: !reply.isApproved })} className="rounded-full border border-[var(--a-border)] px-3 py-1 font-bold">{reply.isApproved ? "Нуух" : "Харуулах"}</button>
                    <button type="button" onClick={async () => { if (await confirm({ title: "Хариултыг устгах уу?", danger: true })) deleteReply.mutate({ id: reply.id }); }} className="rounded-full border border-[var(--a-neg)] px-3 py-1 font-bold text-[var(--a-neg)]">Устгах</button>
                  </div>
                </li>
              ))}</ul>}
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setRepliesFor(null)} className="rounded-full border border-[var(--a-border)] px-4 py-2 text-xs font-bold">Хаах</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
