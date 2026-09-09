import { useState } from "react";
import { CheckCircle2, EyeOff, LoaderCircle, MessageSquareOff, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";

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

  type Review = (typeof reviews)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<Review>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: review => formatDateTime(review.createdAt) },
    { id: "product", header: "БҮТЭЭГДЭХҮҮН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: review => <a href={`/product/${review.productSlug}`} target="_blank" rel="noreferrer" className="font-bold text-[var(--a-text)] hover:text-[#df1f3d]">{review.productName}</a> },
    { id: "rating", header: "ҮНЭЛГЭЭ", headerClassName: headerCell, cellClassName: bodyCell, render: review => <Stars value={review.rating} /> },
    { id: "comment", header: "СЭТГЭГДЭЛ", headerClassName: headerCell, cellClassName: `${bodyCell} max-w-xs text-xs text-[var(--a-text-soft)]`, render: review => review.comment ?? <span className="text-[var(--a-faint)]">Сэтгэгдэл бичээгүй</span> },
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
                <button type="button" onClick={() => updateApproval.mutate({ id: review.id, isApproved: !review.isApproved })} disabled={updateApproval.isPending} className="mr-2 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:opacity-50">{review.isApproved ? <EyeOff size={13} className="inline" /> : <CheckCircle2 size={13} className="inline" />} {review.isApproved ? "Нуух" : "Сэргээх"}</button>
                <button type="button" onClick={() => { if (window.confirm("Энэ сэтгэгдлийг бүрмөсөн устгах уу?")) deleteReview.mutate({ id: review.id }); }} disabled={deleteReview.isPending} className="rounded-full border border-[#df1f3d]/25 px-3 py-1.5 text-[11px] font-bold text-[var(--a-neg)] transition hover:border-[#df1f3d] disabled:opacity-50"><Trash2 size={13} className="inline" /> Устгах</button>
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}
