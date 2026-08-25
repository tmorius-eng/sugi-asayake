import { useState } from "react";
import { CheckCircle2, EyeOff, LoaderCircle, MessageSquareOff, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Төлөв
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
            <option value="all">Бүгд</option>
            <option value="approved">Идэвхтэй</option>
            <option value="hidden">Нуугдсан</option>
          </select>
        </label>
      </div>

      {query.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {query.error && <p className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{query.error.message}</p>}

      {!query.isLoading && !query.error && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[820px] w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
                <th className="border-b border-black/8 pb-2">ОГНОО</th>
                <th className="border-b border-black/8 pb-2">БҮТЭЭГДЭХҮҮН</th>
                <th className="border-b border-black/8 pb-2">ҮНЭЛГЭЭ</th>
                <th className="border-b border-black/8 pb-2">СЭТГЭГДЭЛ</th>
                <th className="border-b border-black/8 pb-2">ЗОХИОГЧ</th>
                <th className="border-b border-black/8 pb-2">ТӨЛӨВ</th>
                <th className="border-b border-black/8 pb-2" />
              </tr>
            </thead>
            <tbody>
              {reviews.map(review => (
                <tr key={review.id} className="text-sm align-top">
                  <td className="border-b border-black/6 py-3 text-xs text-[#6f7075] whitespace-nowrap">{formatDateTime(review.createdAt)}</td>
                  <td className="border-b border-black/6 py-3 text-xs"><a href={`/product/${review.productSlug}`} target="_blank" rel="noreferrer" className="font-bold text-[#17181b] hover:text-[#df1f3d]">{review.productName}</a></td>
                  <td className="border-b border-black/6 py-3"><Stars value={review.rating} /></td>
                  <td className="border-b border-black/6 py-3 max-w-xs text-xs text-[#57585e]">{review.comment ?? <span className="text-[#a9a49a]">Сэтгэгдэл бичээгүй</span>}</td>
                  <td className="border-b border-black/6 py-3 text-xs"><span className="block font-bold">{review.reviewerName ?? "Нэргүй"}</span><span className="text-[#9a9ba0]">{review.reviewerEmail}</span></td>
                  <td className="border-b border-black/6 py-3">
                    {review.isApproved
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f2ec] px-2.5 py-1 text-[10px] font-extrabold text-[#2c7650]"><CheckCircle2 size={11} />Идэвхтэй</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#a51630]"><MessageSquareOff size={11} />Нуугдсан</span>}
                  </td>
                  <td className="border-b border-black/6 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => updateApproval.mutate({ id: review.id, isApproved: !review.isApproved })} disabled={updateApproval.isPending} className="mr-2 rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:opacity-50">{review.isApproved ? <EyeOff size={13} className="inline" /> : <CheckCircle2 size={13} className="inline" />} {review.isApproved ? "Нуух" : "Сэргээх"}</button>
                    <button type="button" onClick={() => { if (window.confirm("Энэ сэтгэгдлийг бүрмөсөн устгах уу?")) deleteReview.mutate({ id: review.id }); }} disabled={deleteReview.isPending} className="rounded-full border border-[#df1f3d]/25 px-3 py-1.5 text-[11px] font-bold text-[#a51630] transition hover:border-[#df1f3d] disabled:opacity-50"><Trash2 size={13} className="inline" /> Устгах</button>
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-[#77787d]"><Star className="mx-auto mb-2 text-[#a9a49a]" size={22} />Тохирох сэтгэгдэл олдсонгүй.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
