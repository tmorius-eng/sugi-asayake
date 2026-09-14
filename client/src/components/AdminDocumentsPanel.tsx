import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  getSiteDocumentFallbackFor,
  siteDocumentFallbacks,
  documentSectionsToHtml,
  type SiteDocumentKey,
  type SiteDocumentLocale,
} from "@shared/site-documents";
import { LOCALE_LABELS } from "@shared/i18n";

import MediaLibraryModal from "./admin/MediaLibraryModal";

const TinyMceEditor = lazy(() => import("./admin/TinyMceEditor"));

type DocumentRow = {
  documentKey: string;
  locale: string;
  title: string;
  lead: string | null;
  contentHtml: string;
  updatedLabel: string | null;
  updatedAt: Date;
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Баримтыг хадгалж чадсангүй. Дахин оролдоно уу.";

/**
 * /admin -> Баримт бичиг (2026-09-12).
 *
 * The three legal pages, edited with the same TinyMCE editor as the news
 * posts. Same override contract as Content & Media / Дэлгүүрийн тохиргоо:
 * the form starts from the live published text (a saved row if there is
 * one, otherwise the researched fallback in shared/site-documents.ts), and
 * "Анхны хувилбар руу буцаах" deletes the row so the fallback is served
 * again verbatim.
 *
 * The editor is deliberately re-mounted per document (`key={activeKey}`):
 * TinyMCE is an uncontrolled component seeded by `initialValue`, so
 * switching tabs without a remount would leave the previous document's body
 * in the box -- the same remount discipline AdminPostsPanel already uses
 * when toggling Visual/Text.
 *
 * 2026-09-14: one document per language. A second pill row (Монгол /
 * English / 日本語) picks the language; each language is its own row in
 * site_documents with its own fallback (shared/site-documents.i18n.ts), so
 * revising the Mongolian never silently changes what an English-speaking
 * shopper reads.
 */
const DOCUMENT_LOCALES: readonly SiteDocumentLocale[] = ["mn", "en", "ja"];
export default function AdminDocumentsPanel({ preview = false }: { preview?: boolean }) {
  const utils = trpc.useUtils();
  const documentsQuery = trpc.admin.siteDocuments.useQuery(undefined, { enabled: !preview });
  const updateDocument = trpc.admin.updateSiteDocument.useMutation();
  const clearDocument = trpc.admin.clearSiteDocument.useMutation();

  const [activeKey, setActiveKey] = useState<SiteDocumentKey>("privacy");
  const [activeLocale, setActiveLocale] = useState<SiteDocumentLocale>("mn");
  const [form, setForm] = useState<{ title: string; lead: string; updatedLabel: string; contentHtml: string } | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  // Same promise-bridge the posts editor uses: TinyMCE's image button awaits
  // a URL, the modal resolves it when a picture is chosen (or null on close).
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const mediaResolveRef = useRef<((url: string | null) => void) | null>(null);
  const requestMedia = () => new Promise<string | null>(resolve => {
    mediaResolveRef.current = resolve;
    setMediaModalOpen(true);
  });
  const handleMediaSelect = (url: string) => {
    mediaResolveRef.current?.(url);
    mediaResolveRef.current = null;
  };
  const handleMediaModalOpenChange = (open: boolean) => {
    setMediaModalOpen(open);
    if (!open && mediaResolveRef.current) {
      mediaResolveRef.current(null);
      mediaResolveRef.current = null;
    }
  };

  const savedByKey = useMemo(
    () => new Map((documentsQuery.data ?? []).map((row: DocumentRow) => [`${row.documentKey}:${row.locale}`, row])),
    [documentsQuery.data],
  );
  const saved = savedByKey.get(`${activeKey}:${activeLocale}`) as DocumentRow | undefined;
  // useMemo, not a plain call: getSiteDocumentFallbackFor builds a fresh
  // object per call, and the seeding effect below lists `fallback` as a
  // dependency -- without memoisation every render re-seeded the form and
  // re-mounted TinyMCE, which never got to show any content (2026-09-14,
  // Tom: "barimt bichegiin aguulguud bugd hooson").
  const fallback = useMemo(() => getSiteDocumentFallbackFor(activeKey, activeLocale), [activeKey, activeLocale]);
  const isCustom = Boolean(saved);

  // Seed the form from whatever is live for the selected document, and
  // re-seed whenever the selection or the server data changes.
  useEffect(() => {
    setForm({
      title: saved?.title ?? fallback.title,
      lead: saved?.lead ?? fallback.lead,
      updatedLabel: saved?.updatedLabel ?? fallback.updated,
      contentHtml: saved?.contentHtml ?? documentSectionsToHtml(fallback.sections),
    });
    setEditorKey(current => current + 1);
  }, [activeKey, activeLocale, saved, fallback]);

  const busy = updateDocument.isPending || clearDocument.isPending;
  const refresh = async () => {
    await Promise.all([utils.admin.siteDocuments.invalidate(), utils.content.siteDocuments.invalidate()]);
  };

  const save = async () => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!form) return;
    if (!form.title.trim()) return toast.error("Гарчиг хоосон байж болохгүй.");
    if (form.contentHtml.trim().length < 10) return toast.error("Агуулга хэт богино байна.");
    try {
      await updateDocument.mutateAsync({
        documentKey: activeKey,
        locale: activeLocale,
        title: form.title.trim(),
        lead: form.lead.trim() || null,
        contentHtml: form.contentHtml,
        updatedLabel: form.updatedLabel.trim() || null,
      });
      await refresh();
      toast.success("Баримтыг хадгаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const reset = async () => {
    if (preview) return toast.message("Preview горим", { description: "Бодит сэргээлт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!window.confirm("Энэ баримтыг SUGI-ийн анхны хувилбар руу буцаах уу? Таны бичсэн засвар устана.")) return;
    try {
      await clearDocument.mutateAsync({ documentKey: activeKey, locale: activeLocale });
      await refresh();
      toast.success("Анхны хувилбарыг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return <div>
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[var(--a-info-soft)] p-5 text-sm text-[var(--a-info)]">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-[var(--a-info)]" size={19} />
        <p>
          <strong>Эдгээр нь хуулийн хуудсууд — өөрчлөлт шууд сайт дээр гарна.</strong>{" "}
          Анхны эх бичвэрийг Монгол Улсын Хэрэглэгчийн эрхийг хамгаалах тухай хууль, Хүний хувийн мэдээлэл хамгаалах тухай хууль, Иргэний хуультай тулгаж бэлтгэсэн. Засварласны дараа хууль зүйн утга нь хэвээр байгаа эсэхийг шалгаарай — хүсвэл “Анхны хувилбар руу буцаах” товчоор хэдийд ч эргүүлж болно.
        </p>
      </div>
    </div>

    <div className="mt-5 inline-flex flex-wrap gap-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
      {siteDocumentFallbacks.map(document => {
        const isActive = document.key === activeKey;
        return (
          <button
            key={document.key}
            type="button"
            onClick={() => setActiveKey(document.key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${isActive ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)] hover:text-[var(--a-text)]"}`}
          >
            {savedByKey.get(`${document.key}:mn`)?.title ?? document.title}
          </button>
        );
      })}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-[var(--a-muted)]">Хэл:</span>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
        {DOCUMENT_LOCALES.map(locale => {
          const isActive = locale === activeLocale;
          const hasRow = savedByKey.has(`${activeKey}:${locale}`);
          return (
            <button
              key={locale}
              type="button"
              onClick={() => setActiveLocale(locale)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${isActive ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)] hover:text-[var(--a-text)]"}`}
              title={hasRow ? "Засварласан хувилбартай" : "Анхны хувилбар"}
            >
              {LOCALE_LABELS[locale]}{hasRow ? " •" : ""}
            </button>
          );
        })}
      </div>
      <span className="text-[11px] leading-4 text-[var(--a-muted)]">Хэл бүр тусдаа баримт — монголоор зассан өөрчлөлт англи, япон хувилбарт өөрөө орохгүй.</span>
    </div>

    {!preview && documentsQuery.isLoading && (
      <div className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Баримтуудыг уншиж байна…</div>
    )}
    {!preview && documentsQuery.error && (
      <div className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(documentsQuery.error)}</div>
    )}

    {form && (
      <div className="mt-5 rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.15em] text-[#df1f3d]">{fallback.path} · {LOCALE_LABELS[activeLocale]}</p>
            <h3 className="mt-1 font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">{form.title || fallback.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] ${isCustom ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-info-soft)] text-[var(--a-muted)]"}`}>
              {isCustom ? "ЗАСВАРЛАСАН" : "АНХНЫ ХУВИЛБАР"}
            </span>
            <a href={`${fallback.path}?lang=${activeLocale}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[var(--a-muted)] underline underline-offset-2">Амьд хуудсыг харах</a>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">Гарчиг
            <input
              value={form.title}
              onChange={event => setForm(current => current && { ...current, title: event.target.value })}
              maxLength={200}
              className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">Сүүлд шинэчилсэн огноо
            <input
              value={form.updatedLabel}
              onChange={event => setForm(current => current && { ...current, updatedLabel: event.target.value })}
              maxLength={40}
              placeholder="2026.09.12"
              className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]"
            />
            <span className="text-[11px] font-normal leading-4 text-[var(--a-muted)]">Хуудасны дээд талд харагдана. Үсгийн алдаа зассан бол өөрчлөхгүй байж болно.</span>
          </label>
        </div>

        <label className="mt-4 grid gap-1.5 text-xs font-bold">Товч тайлбар (хуудасны эхний догол мөр)
          <textarea
            value={form.lead}
            onChange={event => setForm(current => current && { ...current, lead: event.target.value })}
            rows={3}
            maxLength={2_000}
            className="w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[#3970a7]"
          />
        </label>

        <p className="mt-4 text-xs font-bold">Агуулга</p>
        <p className="mb-2 text-[11px] leading-4 text-[var(--a-muted)]">Хэсэг бүрийн гарчигт “Heading 2”-ыг ашиглана уу — сайт дээр тэдгээр нь бүлгийн гарчиг болж харагдана.</p>
        <div className="rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-0.5">
          <Suspense fallback={<div className="grid min-h-[420px] place-items-center text-xs text-[var(--a-faint)]"><LoaderCircle className="animate-spin" size={20} /></div>}>
            <TinyMceEditor
              key={`${activeKey}-${activeLocale}-${editorKey}`}
              initialValue={form.contentHtml}
              onChange={html => setForm(current => current && { ...current, contentHtml: html })}
              onRequestMedia={requestMedia}
            />
          </Suspense>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] disabled:opacity-55">
            <Save size={14} />{updateDocument.isPending ? "Хадгалж байна…" : "Хадгалах"}
          </button>
          {isCustom && (
            <button type="button" disabled={busy} onClick={reset} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-[11px] font-bold text-[var(--a-muted)] transition hover:text-[#df1f3d] disabled:opacity-55">
              <RotateCcw size={14} />Анхны хувилбар руу буцаах
            </button>
          )}
        </div>
      </div>
    )}

    <MediaLibraryModal open={mediaModalOpen} onOpenChange={handleMediaModalOpenChange} onSelect={handleMediaSelect} />
  </div>;
}
