import { useEffect, useState } from "react";
import { CheckCircle2, EyeOff, LoaderCircle, MessageCircleQuestion, MessageSquareOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";

import { useConfirm } from "@/components/ConfirmDialog";
// Product Q&A moderation (2026-09-13). Same flat list shape as
// AdminReviewsPanel: questions go live immediately (moderation already ran
// on the text), staff hide/delete after the fact. Answers are removed
// through the storefront thread or by deleting the whole question (cascade).
const formatDateTime = (date: Date) => new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" });
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const QUESTIONS_PAGE_SIZE = 50;

export default function AdminQuestionsPanel() {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "hidden">("all");
  // Хуудаслалт (2026-10-05): 200-ийн хатуу хязгаар байсан — түүнээс цаашхи асуулт хэзээ ч харагддаггүй байв.
  const [page, setPage] = useState(1);
  const query = trpc.admin.questions.useQuery({ page, pageSize: QUESTIONS_PAGE_SIZE });
  const setApproved = trpc.admin.setQuestionApproved.useMutation({
    onSuccess: (_result, variables) => { toast.success(variables.isApproved ? "Асуулт харагдах боллоо." : "Асуулт нуугдлаа."); utils.admin.questions.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const remove = trpc.admin.deleteQuestion.useMutation({
    onSuccess: () => { toast.success("Асуулт устгагдлаа."); utils.admin.questions.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });

  const questions = (query.data?.items ?? []).filter(q => statusFilter === "all" ? true : statusFilter === "approved" ? q.isApproved : !q.isApproved);
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / QUESTIONS_PAGE_SIZE));
  // Сүүлийн хуудасны сүүлийн мөрийг устгахад хуудас pageCount-аас хэтэрч хоосон үлддэг байв.
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  type Question = (typeof questions)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const columns: GenericListColumn<Question>[] = [
    { id: "date", header: "ОГНОО", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)] whitespace-nowrap`, render: q => formatDateTime(q.createdAt) },
    { id: "product", header: "БҮТЭЭГДЭХҮҮН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs font-bold`, render: q => q.productName },
    { id: "body", header: "АСУУЛТ", headerClassName: headerCell, cellClassName: `${bodyCell} max-w-sm text-xs text-[var(--a-text-soft)]`, render: q => q.body },
    { id: "author", header: "АСУУСАН", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: q => q.authorName ?? "Нэргүй" },
    { id: "answers", header: "ХАРИУЛТ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs`, render: q => Number(q.answerCount) > 0 ? <span className="font-bold">{Number(q.answerCount)}</span> : <span className="text-[var(--a-neg)]">хүлээгдэж буй</span> },
    {
      id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell,
      render: q => q.isApproved
        ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]"><CheckCircle2 size={11} />Идэвхтэй</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]"><MessageSquareOff size={11} />Нуугдсан</span>,
    },
  ];

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-extrabold"><MessageCircleQuestion size={16} /> Бүтээгдэхүүний асуулт, хариулт</h2>
      <p className="mt-1 text-xs text-[var(--a-muted)]">Хариулт хүлээж буй асуултад барааны хуудас дээрээс (ажилтны эрхээр) хариулна. Энд зөвхөн нуух/устгах.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4">
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
          <GenericListView<Question>
            rows={questions}
            getRowId={q => q.id}
            columns={columns}
            tableClassName="min-w-[820px] w-full border-separate border-spacing-0 text-left"
            rowClassName="text-sm align-top"
            actionsHeaderClassName={headerCell}
            actionsCellClassName={`${bodyCell} text-right whitespace-nowrap`}
            emptyMessage={<><MessageCircleQuestion className="mx-auto mb-2 text-[var(--a-faint)]" size={22} />Асуулт алга.</>}
            rowActions={q => (
              <>
                <button type="button" onClick={() => setApproved.mutate({ id: q.id, isApproved: !q.isApproved })} disabled={setApproved.isPending} className="mr-2 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--a-soft)]">
                  {q.isApproved ? <><EyeOff size={12} className="mr-1 inline" />Нуух</> : <><CheckCircle2 size={12} className="mr-1 inline" />Харуулах</>}
                </button>
                <button type="button" onClick={async () => { if (await confirm({ title: "Энэ асуултыг хариултуудтай нь бүрмөсөн устгах уу?", danger: true })) remove.mutate({ id: q.id }); }} disabled={remove.isPending} className="rounded-full border border-[var(--a-neg)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-neg)] hover:bg-[var(--a-neg-soft)]">
                  <Trash2 size={12} className="mr-1 inline" />Устгах
                </button>
              </>
            )}
          />
          {total > QUESTIONS_PAGE_SIZE && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs" aria-label="Асуултын хуудаслалт">
              <span className="text-[var(--a-muted)]">{(page - 1) * QUESTIONS_PAGE_SIZE + 1}–{Math.min(page * QUESTIONS_PAGE_SIZE, total)} / {total}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-full border border-[var(--a-border)] px-3 py-1.5 font-bold hover:bg-[var(--a-soft)] disabled:opacity-40">Өмнөх</button>
                <button type="button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount} className="rounded-full border border-[var(--a-border)] px-3 py-1.5 font-bold hover:bg-[var(--a-soft)] disabled:opacity-40">Дараах</button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
