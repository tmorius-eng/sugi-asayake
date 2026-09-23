import { lazy, Suspense, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImageUp, LayoutGrid, List, LoaderCircle, Pencil, PencilLine, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { slugify } from "@shared/slugify";
import MediaLibraryModal from "./admin/MediaLibraryModal";
import { COVER_SHAPE, IMAGE_UPLOAD_ACCEPT, MAX_UPLOAD_BYTES, isUploadableImageType, prepareImageUpload, type UploadImageType } from "@/lib/prepareImageUpload";
import UploadTips from "@/components/admin/UploadTips";

import { useConfirm } from "@/components/ConfirmDialog";
// Lazy, not a static import: TinyMCE is a genuinely large library (it alone
// pushed the whole /admin chunk over 2MB in a real `pnpm build` check) --
// every OTHER admin section (Orders, Analytics, Users, ...) would otherwise
// pay for downloading it too, even though only this one section ever uses
// it. `/admin` itself is already route-level lazy (client/src/App.tsx), so
// this is a second, narrower split one level down, inside it.
const TinyMceEditor = lazy(() => import("./admin/TinyMceEditor"));

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо.";
const POSTS_PAGE_SIZE = 10;

const postFormats = ["standard", "aside", "image", "video", "audio", "quote", "link", "gallery"] as const;
type PostFormat = (typeof postFormats)[number];
const formatLabels: Record<PostFormat, string> = { standard: "Энгийн", aside: "Тэмдэглэл", image: "Зураг", video: "Видео", audio: "Аудио", quote: "Ишлэл", link: "Холбоос", gallery: "Галерей" };

type AdminPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  publishedAt: Date | string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  format: string;
  deletedAt: Date | string | null;
  categories: { id: number; name: string; slug: string }[];
  tags: { id: number; name: string; slug: string }[];
};

type PostStatus = "published" | "scheduled" | "draft" | "trash";

function statusOf(post: AdminPost): PostStatus {
  if (post.deletedAt) return "trash";
  if (!post.isPublished) return "draft";
  if (post.publishedAt && new Date(post.publishedAt).getTime() > Date.now()) return "scheduled";
  return "published";
}

const statusLabels: Record<PostStatus, string> = { published: "Нийтлэгдсэн", scheduled: "Товлогдсон", draft: "Ноорог", trash: "Хогийн сав" };
const statusBadgeClass: Record<PostStatus, string> = {
  published: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  scheduled: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  draft: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  trash: "bg-[var(--a-neg-soft)] text-[var(--a-neg)]",
};

// datetime-local input <-> Date, in the browser's own local timezone --
// matches how the input renders/parses natively.
function toDatetimeLocal(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = {
  title: "", slug: "", excerpt: "", content: "", coverImageUrl: null as string | null,
  metaTitle: "", metaDescription: "", format: "standard" as PostFormat,
  categoryIds: [] as number[], tagNames: [] as string[], publishAt: "",
};

/**
 * WordPress-classic-editor-parity rebuild (2026-09-07) of the old plain-
 * textarea "LIVE POST COMPOSER" (previously inside AdminOperationsPanel.tsx,
 * shared with Orders -- Orders now stands alone there, this is its own file).
 * See docs/PROJECT-GUIDE.md / the approved plan for the full feature-scope rationale
 * (what's built 1:1 vs adapted vs deliberately excluded from the reference
 * screenshot).
 */
export default function AdminPostsPanel({ preview = false }: { preview?: boolean }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const postsQuery = trpc.admin.posts.useQuery(undefined, { enabled: !preview });
  const categoriesQuery = trpc.admin.postCategories.useQuery(undefined, { enabled: !preview });
  const createPost = trpc.admin.createPost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const updatePost = trpc.admin.updatePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate() });
  const trashPost = trpc.admin.trashPost.useMutation({ onSuccess: () => utils.admin.posts.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const restorePost = trpc.admin.restorePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const permanentlyDeletePost = trpc.admin.permanentlyDeletePost.useMutation({ onSuccess: () => utils.admin.posts.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const createPostCategory = trpc.admin.createPostCategory.useMutation({ onSuccess: () => utils.admin.postCategories.invalidate(), onError: error => toast.error(messageFrom(error)) });
  const deletePostCategory = trpc.admin.deletePostCategory.useMutation({ onSuccess: result => { utils.admin.postCategories.invalidate(); toast.success(`“${result.name}” ангиллыг устгалаа.`); }, onError: error => toast.error(messageFrom(error)) });
  const uploadCoverImage = trpc.admin.uploadPostCoverImage.useMutation();

  const [form, setForm] = useState(emptyForm);
  const [editingPost, setEditingPost] = useState<AdminPost | null>(null);
  const [editorMode, setEditorMode] = useState<"visual" | "text">("visual");
  const [editorKey, setEditorKey] = useState(0);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [excerptOpen, setExcerptOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | PostStatus>("all");
  const [page, setPage] = useState(1);
  // 2026-09-07 (Project "SUGI Desk"): same board/list toggle as
  // AdminOperationsPanel.tsx's Orders section -- board mode shows every
  // status as its own column (bypassing the pill filter, which is a
  // list-mode-only concept) instead of one flat, filtered list.
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const mediaResolveRef = useRef<((url: string | null) => void) | null>(null);

  const posts = useMemo(() => (preview ? [] : postsQuery.data ?? []) as AdminPost[], [preview, postsQuery.data]);
  const categories = preview ? [] : categoriesQuery.data ?? [];
  const savingPost = createPost.isPending || updatePost.isPending;

  const counts = useMemo(() => {
    const result: Record<"all" | PostStatus, number> = { all: posts.length, published: 0, scheduled: 0, draft: 0, trash: 0 };
    for (const post of posts) result[statusOf(post)]++;
    return result;
  }, [posts]);

  const filteredPosts = statusFilter === "all" ? posts : posts.filter(post => statusOf(post) === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PAGE_SIZE));
  const pagedPosts = filteredPosts.slice((page - 1) * POSTS_PAGE_SIZE, page * POSTS_PAGE_SIZE);

  const resetForm = () => {
    setEditingPost(null);
    setForm(emptyForm);
    setEditorMode("visual");
    setEditorKey(current => current + 1);
    setExcerptOpen(false);
    setSeoOpen(false);
  };

  const startEditPost = (item: AdminPost) => {
    setEditingPost(item);
    setForm({
      title: item.title, slug: item.slug, excerpt: item.excerpt ?? "", content: item.content,
      coverImageUrl: item.coverImageUrl, metaTitle: item.metaTitle ?? "", metaDescription: item.metaDescription ?? "",
      format: (item.format as PostFormat) ?? "standard",
      categoryIds: item.categories.map(category => category.id), tagNames: item.tags.map(tag => tag.name),
      publishAt: toDatetimeLocal(item.publishedAt),
    });
    setEditorMode("visual");
    setEditorKey(current => current + 1);
    setExcerptOpen(Boolean(item.excerpt));
    setSeoOpen(Boolean(item.metaTitle || item.metaDescription));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Switching Text -> Visual force-remounts TinyMceEditor with the
  // textarea's (possibly hand-edited) HTML as its fresh initialValue -- see
  // TinyMceEditor.tsx's own comment for why this is safer than a controlled
  // `value` prop.
  const switchEditorMode = (mode: "visual" | "text") => {
    if (mode === "visual" && editorMode === "text") setEditorKey(current => current + 1);
    setEditorMode(mode);
  };

  const requestMedia = () => new Promise<string | null>(resolve => {
    mediaResolveRef.current = resolve;
    setMediaModalOpen(true);
  });

  const handleMediaSelect = (url: string) => {
    if (mediaResolveRef.current) {
      mediaResolveRef.current(url);
      mediaResolveRef.current = null;
    } else {
      setForm(current => ({ ...current, coverImageUrl: url }));
    }
  };

  const handleMediaModalOpenChange = (open: boolean) => {
    setMediaModalOpen(open);
    if (!open && mediaResolveRef.current) {
      mediaResolveRef.current(null);
      mediaResolveRef.current = null;
    }
  };

  const handleCoverFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (preview) { toast.message("Preview горим", { description: "Зураг байршуулахын тулд хамгаалагдсан /admin хэсэгт нэвтэрнэ үү." }); return; }
    const prepared = await prepareImageUpload(picked, COVER_SHAPE);
    const file = prepared.file;
    if (!isUploadableImageType(file.type) || file.size > MAX_UPLOAD_BYTES) {
      toast.error("JPG, PNG, WEBP эсвэл GIF зураг сонгоно уу (8 MB хүртэл).");
      event.target.value = "";
      return;
    }
    if (prepared.note) toast.message("Зургийг илгээхээс өмнө жижгэрүүлэв", { description: prepared.note });
    if (prepared.warning) toast.warning(prepared.warning);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadCoverImage.mutateAsync({ fileName: file.name, contentType: file.type as UploadImageType, dataBase64: String(reader.result) });
        setForm(current => ({ ...current, coverImageUrl: stored.url }));
        toast.success("Зураг байршууллаа.");
      } catch (error) { toast.error(messageFrom(error)); }
      finally { event.target.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const addTagFromDraft = () => {
    const name = tagDraft.trim();
    if (!name) return;
    if (!form.tagNames.includes(name)) setForm(current => ({ ...current, tagNames: [...current.tagNames, name] }));
    setTagDraft("");
  };
  const onTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTagFromDraft(); }
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const category = await createPostCategory.mutateAsync({ name });
      setForm(current => ({ ...current, categoryIds: [...current.categoryIds, category.id] }));
      setNewCategoryName("");
      toast.success("Ангилал үүсгэлээ.");
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const buildPayload = (isPublished: boolean) => {
    const publishAtDate = form.publishAt ? new Date(form.publishAt) : null;
    return {
      title: form.title, slug: form.slug, excerpt: form.excerpt || null, content: form.content,
      coverImageUrl: form.coverImageUrl, isPublished,
      metaTitle: form.metaTitle || null, metaDescription: form.metaDescription || null,
      format: form.format, categoryIds: form.categoryIds, tagNames: form.tagNames,
      publishAt: publishAtDate,
    };
  };

  const savePost = async (isPublished: boolean) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит нийтлэл зөвхөн хамгаалагдсан admin хэсэгт хадгалагдана." });
    // 2026-09-23: талбарууд `required`-тай ч <form>-ын ГАДНА байдаг тул
    // хөтчийн шалгалт хэзээ ч ажилладаггүй байв: хоосон гарчигтай "Нийтлэх"
    // дарахад zod-ийн англи мессеж ("String must contain at least 3
    // character(s)") toast болж гардаг. Монголоор, хадгалахаас өмнө шалгана.
    if (form.title.trim().length < 3) return toast.error("Гарчиг дор хаяж 3 тэмдэгт байх ёстой.");
    if (!form.slug.trim()) return toast.error("Нийтлэлийн URL (slug) оруулна уу.");
    if (form.content.trim().length < 10) return toast.error("Нийтлэлийн агуулга дор хаяж 10 тэмдэгт байх ёстой.");
    try {
      const payload = buildPayload(isPublished);
      if (editingPost) {
        await updatePost.mutateAsync({ id: editingPost.id, ...payload });
        toast.success("Нийтлэлийг шинэчиллээ.");
      } else {
        await createPost.mutateAsync(payload);
        toast.success(isPublished ? "Нийтлэлийг нийтэллээ." : "Ноорог хадгаллаа.");
      }
      resetForm();
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const isScheduling = Boolean(form.publishAt) && new Date(form.publishAt).getTime() > Date.now();
  const alreadyPublished = Boolean(editingPost?.isPublished);

  return (
    <div className="grid gap-5">
      {/* 2026-09-07: the composer+sidebar stay a narrow 2-column block (the
          sidebar cards genuinely belong right next to the form they edit),
          but the post list/board below is now a SEPARATE, full-width child
          of the outer grid instead of being nested inside the narrow 1.4fr
          column -- the Kanban board added below needs real width to lay out
          its columns; squeezed into ~58% of the page it was an unusable,
          horizontally-scrolling mess. */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_.9fr]">
      {/* Without min-w-0, this column (a grid item with an fr track)
          defaults to min-width:auto -- if TinyMCE's toolbar/editor ever
          needs more room than its 1.4fr share, the grid refuses to shrink
          and pushes the .9fr sidebar column out past the container instead.
          Same bug class already found and fixed once in
          AdminAnalyticsPanel.tsx (2026-08-27); this file just missed it. */}
      <div className="grid min-w-0 gap-4">
        <div className="rounded-3xl bg-[var(--a-soft)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{editingPost ? "НИЙТЛЭЛ ЗАСАХ" : "ШИНЭ НИЙТЛЭЛ"}</p>
            {editingPost && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => window.open(`/${editingPost.slug}`, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-info)] hover:text-[#df1f3d]"><ExternalLink size={13} />Урьдчилан харах</button>
                <button type="button" onClick={resetForm} className="text-xs font-bold text-[var(--a-muted)] hover:text-[#df1f3d]">Цуцлах</button>
              </div>
            )}
          </div>
          <input required value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value, slug: current.slug || slugify(event.target.value) }))} placeholder="Гарчиг оруулах" className="mt-4 h-12 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-lg font-semibold outline-none focus:border-[#df1f3d]" />
          <label className="mt-2 grid gap-1 text-[11px] font-bold text-[var(--a-muted)]">
            URL: /{form.slug || "…"}
            <input required value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value }))} className="h-9 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
          </label>

          <div className="mt-4 flex items-center justify-between rounded-t-xl bg-[var(--a-card)] px-2 pt-2">
            <div className="flex gap-1">
              <button type="button" onClick={() => setMediaModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-xs font-bold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><ImageUp size={13} />Медиа нэмэх</button>
            </div>
            <div className="flex overflow-hidden rounded-full border border-[var(--a-border)] text-xs font-bold">
              <button type="button" onClick={() => switchEditorMode("visual")} className={`px-3 py-1.5 ${editorMode === "visual" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)]"}`}>Visual</button>
              <button type="button" onClick={() => switchEditorMode("text")} className={`px-3 py-1.5 ${editorMode === "text" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)]"}`}>Text</button>
            </div>
          </div>
          <div className="rounded-b-xl border border-t-0 border-[var(--a-border)] bg-[var(--a-card)] p-0.5">
            {editorMode === "visual"
              ? (
                <Suspense fallback={<div className="grid min-h-[420px] place-items-center text-xs text-[var(--a-faint)]"><LoaderCircle className="animate-spin" size={20} /></div>}>
                  <TinyMceEditor key={editorKey} initialValue={form.content} onChange={html => setForm(current => ({ ...current, content: html }))} onRequestMedia={requestMedia} />
                </Suspense>
              )
              : <textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} className="min-h-[420px] w-full rounded-lg p-4 font-mono text-xs outline-none" />}
          </div>

          <Collapsible open={excerptOpen} onOpenChange={setExcerptOpen} className="mt-4 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)]">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-xs font-extrabold tracking-[.08em] text-[var(--a-text-soft)]">Товч тайлбар (Excerpt)</CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <textarea value={form.excerpt} onChange={event => setForm(current => ({ ...current, excerpt: event.target.value }))} placeholder="Жагсаалт болон түгээмэл хуваалцахад ашиглагдана." className="min-h-16 w-full rounded-lg border border-[var(--a-border)] p-3 text-sm outline-none focus:border-[#df1f3d]" />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={seoOpen} onOpenChange={setSeoOpen} className="mt-3 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)]">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-xs font-extrabold tracking-[.08em] text-[var(--a-text-soft)]">SEO (хайлтын систем)</CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 px-4 pb-4">
              <label className="grid gap-1 text-xs font-bold">Мета гарчиг ({form.metaTitle.length}/70)<input maxLength={70} value={form.metaTitle} onChange={event => setForm(current => ({ ...current, metaTitle: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
              <label className="grid gap-1 text-xs font-bold">Мета тайлбар ({form.metaDescription.length}/160)<textarea maxLength={160} value={form.metaDescription} onChange={event => setForm(current => ({ ...current, metaDescription: event.target.value }))} className="min-h-14 rounded-lg border border-[var(--a-border)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:content-start">
        <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]">НИЙТЛЭХ</p>
          <label className="mt-3 grid gap-1 text-xs font-bold">Огноо {isScheduling ? "(товлох)" : ""}
            <input type="datetime-local" value={form.publishAt} onChange={event => setForm(current => ({ ...current, publishAt: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-2 text-xs outline-none focus:border-[#df1f3d]" />
          </label>
          <div className="mt-4 grid gap-2">
            {alreadyPublished ? (
              <button type="button" disabled={savingPost} onClick={() => savePost(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{savingPost && <LoaderCircle className="animate-spin" size={14} />}Шинэчлэх</button>
            ) : (
              <>
                <button type="button" disabled={savingPost} onClick={() => savePost(false)} className="inline-flex items-center justify-center gap-2 rounded-full border border-black/15 px-5 py-3 text-xs font-bold text-[var(--a-text-soft)] disabled:opacity-60">Ноорог хадгалах</button>
                <button type="button" disabled={savingPost || uploadCoverImage.isPending} onClick={() => savePost(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60"><Send size={14} />{savingPost ? "Хадгалж байна…" : isScheduling ? "Товлох" : "Нийтлэх"}</button>
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]">КОВЭР ЗУРАГ</p>
          {form.coverImageUrl ? (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-[var(--a-border)]"><img src={form.coverImageUrl} alt="" className="h-36 w-full object-cover" /><button type="button" onClick={() => setForm(current => ({ ...current, coverImageUrl: null }))} aria-label="Ковэр зураг хасах" className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-[#df1f3d]"><X size={14} /></button></div>
          ) : (
            <label className="mt-3 flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-[var(--a-soft)] text-xs font-normal text-[var(--a-faint)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
              {uploadCoverImage.isPending ? <LoaderCircle className="animate-spin" size={20} /> : <ImageUp size={20} />}
              {uploadCoverImage.isPending ? "Байршуулж байна…" : "Зураг сонгох"}
              <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={handleCoverFile} disabled={uploadCoverImage.isPending} className="hidden" />
            </label>
          )}
          <button type="button" onClick={() => setMediaModalOpen(true)} className="mt-2 text-[11px] font-bold text-[var(--a-info)] hover:text-[#df1f3d]">Медиа сангаас сонгох</button>
          <UploadTips kind="cover" className="mt-3" />
        </section>

        <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]">ФОРМАТ</p>
          <RadioGroup value={form.format} onValueChange={value => setForm(current => ({ ...current, format: value as PostFormat }))} className="mt-3 gap-2">
            {postFormats.map(value => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={value} id={`format-${value}`} />{formatLabels[value]}
              </label>
            ))}
          </RadioGroup>
        </section>

        <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]">АНГИЛАЛ</p>
          <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto">
            {categories.map(category => (
              <div key={category.id} className="flex items-center gap-2 text-sm">
                <label className="flex flex-1 items-center gap-2">
                  <Checkbox checked={form.categoryIds.includes(category.id)} onCheckedChange={checked => setForm(current => ({ ...current, categoryIds: checked ? [...current.categoryIds, category.id] : current.categoryIds.filter(id => id !== category.id) }))} />
                  {category.name}
                </label>
                {/* 2026-09-16: ангилал нэмэх боломжтой атлаа устгах арга
                    байгаагүй. Нийтлэлтэй ангиллыг сервер татгалзана. */}
                <button
                  type="button"
                  disabled={deletePostCategory.isPending}
                  onClick={async () => {
                    if (!await confirm({ title: `“${category.name}” ангиллыг устгах уу?`, danger: true })) return;
                    deletePostCategory.mutate({ id: category.id });
                  }}
                  aria-label={`${category.name} устгах`}
                  title="Устгах"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[var(--a-neg)] disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="text-xs text-[var(--a-faint)]">Ангилал алга.</p>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } }} placeholder="Шинэ ангилал" className="h-9 flex-1 rounded-lg border border-[var(--a-border)] px-2 text-xs outline-none focus:border-[#df1f3d]" />
            <button type="button" onClick={addCategory} disabled={createPostCategory.isPending} className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--a-btn-dark)] text-white disabled:opacity-50"><Plus size={15} /></button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]">ТЭГ</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {form.tagNames.map(name => (
              <span key={name} className="inline-flex items-center gap-1 rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--a-info)]">
                {name}
                <button type="button" onClick={() => setForm(current => ({ ...current, tagNames: current.tagNames.filter(tag => tag !== name) }))} aria-label={`${name} хасах`}><X size={11} /></button>
              </span>
            ))}
          </div>
          <input value={tagDraft} onChange={event => setTagDraft(event.target.value)} onKeyDown={onTagKeyDown} onBlur={addTagFromDraft} placeholder="Тег бичээд Enter дарна" className="mt-2 h-9 w-full rounded-lg border border-[var(--a-border)] px-2 text-xs outline-none focus:border-[#df1f3d]" />
        </section>
      </div>
      </div>

      <section className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {viewMode === "list" ? (
            <div className="flex flex-wrap gap-2">
              {(["all", "published", "scheduled", "draft", "trash"] as const).map(key => (
                <button key={key} type="button" onClick={() => { setStatusFilter(key); setPage(1); }} className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === key ? "bg-[var(--a-btn-dark)] text-white" : "bg-[var(--a-soft)] text-[var(--a-text-soft)] hover:bg-[var(--a-neg-soft)]"}`}>
                  {key === "all" ? "Бүгд" : statusLabels[key]} ({counts[key]})
                </button>
              ))}
            </div>
          ) : <span />}
          <div className="inline-flex rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
            <button type="button" onClick={() => setViewMode("board")} aria-label="Самбар харагдац" title="Самбар (Kanban)" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "board" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-faint)] hover:text-[var(--a-text)]"}`}><LayoutGrid size={14} /></button>
            <button type="button" onClick={() => setViewMode("list")} aria-label="Жагсаалт харагдац" title="Жагсаалт" className={`grid size-8 place-items-center rounded-full transition ${viewMode === "list" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-faint)] hover:text-[var(--a-text)]"}`}><List size={14} /></button>
          </div>
        </div>
        {postsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Нийтлэлүүдийг уншиж байна…</p>}
        {!postsQuery.isLoading && viewMode === "board" && (
          <PostsKanbanBoard
            posts={posts}
            onEdit={startEditPost}
            onTrash={id => trashPost.mutate({ id })}
            onRestore={id => restorePost.mutate({ id })}
            onPermanentlyDelete={async (id, title) => { if (await confirm({ title: `"${title}" нийтлэлийг бүрмөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.`, danger: true })) permanentlyDeletePost.mutate({ id }); }}
          />
        )}
        {viewMode === "list" && (pagedPosts.length === 0 && !postsQuery.isLoading ? (
          <div className="rounded-3xl bg-[var(--a-pos-soft)] p-7 text-center text-sm text-[var(--a-muted)]"><PencilLine className="mx-auto mb-3 text-[var(--a-info)]" size={27} />Одоогоор нийтлэл алга.</div>
        ) : pagedPosts.map(item => {
          const status = statusOf(item);
          return (
            <div key={item.id} className="flex min-w-0 gap-3 rounded-2xl border border-[var(--a-border)] p-4">
              {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-[var(--a-soft)] text-[var(--a-faint)]"><ImageUp size={20} /></div>}
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{item.title}</strong>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusBadgeClass[status]}`}>{statusLabels[status]}</span>
                    {item.categories.map(category => <span key={category.id} className="rounded-full bg-[var(--a-pos-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--a-info)]">{category.name}</span>)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {status !== "trash" && (status === "published" || status === "scheduled") && <a href={`/${item.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-info)] hover:text-[#df1f3d]"><ExternalLink size={13} />Харах</a>}
                  {status !== "trash" && <button type="button" onClick={() => startEditPost(item)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--a-info)] hover:text-[#df1f3d]"><Pencil size={12} />Засах</button>}
                  {status !== "trash" ? (
                    <button type="button" onClick={() => trashPost.mutate({ id: item.id })} className="text-xs font-bold text-[var(--a-neg)]">Хогийн сан</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => restorePost.mutate({ id: item.id })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--a-pos)]"><RotateCcw size={12} />Сэргээх</button>
                      <button type="button" onClick={async () => { if (await confirm({ title: `"${item.title}" нийтлэлийг бүрмөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.`, danger: true })) permanentlyDeletePost.mutate({ id: item.id }); }} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--a-neg)]"><Trash2 size={12} />Бүрмөсөн устгах</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        }))}
        {viewMode === "list" && filteredPosts.length > POSTS_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 text-xs text-[var(--a-muted)]">
            <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] disabled:opacity-35"><ChevronLeft size={15} /></button>
            <span>{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] disabled:opacity-35"><ChevronRight size={15} /></button>
          </div>
        )}
      </section>

      <MediaLibraryModal open={mediaModalOpen} onOpenChange={handleMediaModalOpenChange} onSelect={handleMediaSelect} />
    </div>
  );
}

// 2026-09-07 (Project "SUGI Desk"): editorial-status Kanban -- one column per
// PostStatus. Unlike Orders' board (a single `status` enum field any card can
// be reassigned to), a post's status is DERIVED (statusOf) from isPublished/
// publishedAt/deletedAt, so there's no single dropdown that moves a card
// between all four columns -- each column gets the exact same status-specific
// actions the list view already has (Засах/Хогийн сан for draft & scheduled,
// +Харах for published, Сэргээх/Бүрмөсөн устгах for trash) instead of one
// universal "move" control.
function PostsKanbanBoard({
  posts, onEdit, onTrash, onRestore, onPermanentlyDelete,
}: {
  posts: AdminPost[];
  onEdit: (post: AdminPost) => void;
  onTrash: (id: number) => void;
  onRestore: (id: number) => void;
  onPermanentlyDelete: (id: number, title: string) => void;
}) {
  const columns: PostStatus[] = ["draft", "scheduled", "published", "trash"];
  if (posts.length === 0) return <div className="rounded-3xl bg-[var(--a-pos-soft)] p-7 text-center text-sm text-[var(--a-muted)]"><PencilLine className="mx-auto mb-3 text-[var(--a-info)]" size={27} />Одоогоор нийтлэл алга.</div>;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map(status => {
        const columnPosts = posts.filter(post => statusOf(post) === status);
        return (
          <div key={status} className="w-72 shrink-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">{statusLabels[status].toUpperCase()}</p>
              <span className="rounded-full bg-[var(--a-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-text-soft)]">{columnPosts.length}</span>
            </div>
            <div className="grid min-w-0 gap-2.5 rounded-2xl bg-[var(--a-soft)] p-2.5">
              {columnPosts.map(post => (
                <div key={post.id} className="min-w-0 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-3.5">
                  <strong className="block truncate text-sm">{post.title}</strong>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-[var(--a-info)]">
                    {post.categories.map(category => <span key={category.id} className="rounded-full bg-[var(--a-pos-soft)] px-2 py-0.5 font-bold">{category.name}</span>)}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    {status !== "trash" && (status === "published" || status === "scheduled") && <a href={`/${post.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-info)] hover:text-[#df1f3d]"><ExternalLink size={12} />Харах</a>}
                    {status !== "trash" && <button type="button" onClick={() => onEdit(post)} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-info)] hover:text-[#df1f3d]"><Pencil size={11} />Засах</button>}
                    {status !== "trash" ? (
                      <button type="button" onClick={() => onTrash(post.id)} className="text-[11px] font-bold text-[var(--a-neg)]">Хогийн сан</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => onRestore(post.id)} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-pos)]"><RotateCcw size={11} />Сэргээх</button>
                        <button type="button" onClick={() => onPermanentlyDelete(post.id, post.title)} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-neg)]"><Trash2 size={11} />Устгах</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {columnPosts.length === 0 && <p className="py-6 text-center text-[11px] text-[var(--a-faint)]">Хоосон</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
