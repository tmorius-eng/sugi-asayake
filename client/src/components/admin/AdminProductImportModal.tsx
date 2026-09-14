import { useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GenericListView, type GenericListColumn } from "./GenericListView";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { trpc, type RouterOutputs } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо.";

// Admin overhaul (2026-09-08, Phase H): the canonical field keys
// importProductsCsvRows (server/routers.ts) actually understands -- an
// admin/warehouse user maps their CSV's own column headers onto these, they
// don't need to already match. Kept in sync by hand with that function's
// candidate object; there's no single shared source since one lives in a
// Zod schema (server) and the other is UI label text (client).
const IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Нэр" },
  { key: "category", label: "Ангилал (нэрээр)" },
  { key: "priceMnt", label: "Үнэ (₮)" },
  { key: "compareAtPriceMnt", label: "Хуучин үнэ (₮)" },
  { key: "costMnt", label: "Өртөг үнэ (₮, зөвхөн админд)" },
  { key: "stockQuantity", label: "Үлдэгдэл" },
  { key: "isPublished", label: "Нийтлэх (true/false)" },
  { key: "slug", label: "URL slug (сонголтоор)" },
  { key: "brand", label: "Брэнд" },
  { key: "shortDescription", label: "Товч тайлбар" },
  { key: "description", label: "Дэлгэрэнгүй тайлбар" },
  { key: "imageUrl", label: "Зургийн URL" },
  { key: "skinType", label: "Арьсны төрөл" },
  { key: "skinConcerns", label: "Арчилгааны зорилго" },
  { key: "interiorStyle", label: "Интерьерийн загвар" },
  { key: "hairType", label: "Үсний төрөл" },
  { key: "hairConcerns", label: "Үсний асуудал" },
  { key: "fragrancePreference", label: "Үнэрийн сонголт" },
  { key: "wellnessInterests", label: "Эрүүл мэндийн сонирхол" },
  { key: "ingredients", label: "Найрлага" },
  { key: "netContent", label: "Хэмжээ (170ml, 3×50g)" },
  { key: "countryOfOrigin", label: "Гарал үүслийн улс" },
  { key: "shelfLifeMonths", label: "Хадгалах хугацаа (сар)" },
];
const IGNORE_FIELD = "__ignore__";

type ImportResult = RouterOutputs["admin"]["importProductsCsv"]["results"][number];
type Step = "pick" | "map" | "preview" | "done";

const OUTCOME_LABEL: Record<ImportResult["outcome"], string> = { created: "Шинээр үүсэх", updated: "Шинэчлэгдэх", skipped: "Алгасах", error: "Алдаа" };
const OUTCOME_COLOR: Record<ImportResult["outcome"], string> = { created: "#2c7650", updated: "#3970a7", skipped: "#8a8b8f", error: "#df1f3d" };

function ResultSummary({ results }: { results: ImportResult[] }) {
  const count = (outcome: ImportResult["outcome"]) => results.filter(r => r.outcome === outcome).length;
  return (
    <div className="flex flex-wrap gap-3 text-xs font-bold">
      {(["created", "updated", "skipped", "error"] as const).map(outcome => (
        <span key={outcome} style={{ color: OUTCOME_COLOR[outcome] }}>{OUTCOME_LABEL[outcome]}: {count(outcome)}</span>
      ))}
    </div>
  );
}

/**
 * Admin overhaul (2026-09-08, Phase H): bulk CSV product import. File picker
 * → column mapping → mandatory dry-run preview → confirm → commit → per-row
 * report. dryRun and the real commit call the exact same server-side
 * function (importProductsCsvRows) with the exact same mapped rows, so what
 * this preview shows can never disagree with what committing actually does.
 */
export default function AdminProductImportModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<Step>("pick");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [allowUpdateExisting, setAllowUpdateExisting] = useState(false);
  const [previewResults, setPreviewResults] = useState<ImportResult[]>([]);
  const [finalResults, setFinalResults] = useState<ImportResult[]>([]);
  const importCsv = trpc.admin.importProductsCsv.useMutation();

  const reset = () => {
    setStep("pick"); setHeaders([]); setRawRows([]); setMapping({}); setAllowUpdateExisting(false); setPreviewResults([]); setFinalResults([]);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { headers: detected, rows } = parseCsv(String(reader.result));
      if (!detected.length || !rows.length) {
        toast.error("CSV файлаас өгөгдөл олдсонгүй.");
        return;
      }
      // Auto-match: a header whose text already equals a known field key
      // (case-insensitive) gets pre-selected; everything else defaults to
      // "Алгасах" so a stray column never silently maps to the wrong field.
      const autoMapping: Record<string, string> = {};
      for (const header of detected) {
        const match = IMPORT_FIELDS.find(field => field.key.toLowerCase() === header.trim().toLowerCase());
        autoMapping[header] = match ? match.key : IGNORE_FIELD;
      }
      setHeaders(detected);
      setRawRows(rows);
      setMapping(autoMapping);
      setStep("map");
    };
    reader.readAsText(file, "UTF-8");
  };

  const mappedRows = (): Record<string, string>[] => rawRows.map(row => {
    const mapped: Record<string, string> = {};
    for (const header of headers) {
      const field = mapping[header];
      if (field && field !== IGNORE_FIELD) mapped[field] = row[header] ?? "";
    }
    return mapped;
  });

  const runPreview = async () => {
    if (!Object.values(mapping).includes("sku")) {
      toast.error("SKU багана заавал холбогдсон байх ёстой.");
      return;
    }
    try {
      const { results } = await importCsv.mutateAsync({ rows: mappedRows(), allowUpdateExisting, dryRun: true });
      setPreviewResults(results);
      setStep("preview");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const commit = async () => {
    try {
      const { results } = await importCsv.mutateAsync({ rows: mappedRows(), allowUpdateExisting, dryRun: false });
      setFinalResults(results);
      setStep("done");
      await Promise.all([utils.admin.products.invalidate(), utils.admin.categories.invalidate()]);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const downloadFailedRows = (results: ImportResult[]) => {
    const failed = results.filter(r => r.outcome === "error");
    downloadCsv("sugi-import-aldaa.csv", ["Мөр", "SKU", "Алдаа"], failed.map(r => [r.row + 1, r.sku, r.message ?? ""]));
  };

  const resultColumns: GenericListColumn<ImportResult>[] = [
    { id: "row", header: "МӨР", render: r => r.row + 1 },
    { id: "sku", header: "SKU", render: r => r.sku },
    { id: "outcome", header: "ТӨЛӨВ", render: r => <span style={{ color: OUTCOME_COLOR[r.outcome], fontWeight: 700 }}>{OUTCOME_LABEL[r.outcome]}</span> },
    { id: "message", header: "ТАЙЛБАР", render: r => r.message ?? "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>Бараа CSV-ээр импортлох</DialogTitle>
        <DialogDescription>
          {step === "pick" && "CSV файл сонгоно уу. Багана бүрийг дараагийн алхамд тохируулна."}
          {step === "map" && "CSV баганыг бүтээгдэхүүний талбартай тохируулна уу."}
          {step === "preview" && "Юу ч хараахан хадгалагдаагүй байна — эхлээд урьдчилан харна уу."}
          {step === "done" && "Импорт дууслаа."}
        </DialogDescription>

        {step === "pick" && (
          <label className="mt-3 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-[var(--a-soft)] text-xs font-normal text-[var(--a-faint)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
            <FileUp size={22} />
            CSV файл сонгох
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </label>
        )}

        {step === "map" && (
          <div className="grid gap-3">
            <div className="grid max-h-72 gap-2 overflow-y-auto rounded-xl border border-[var(--a-border)] p-3">
              {headers.map(header => (
                <div key={header} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{header}</span>
                  <select value={mapping[header] ?? IGNORE_FIELD} onChange={event => setMapping(current => ({ ...current, [header]: event.target.value }))} className="h-9 w-56 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">
                    <option value={IGNORE_FIELD}>Алгасах</option>
                    {IMPORT_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}{field.required ? " *" : ""}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={allowUpdateExisting} onChange={event => setAllowUpdateExisting(event.target.checked)} className="size-4 accent-[#df1f3d]" />
              Одоо байгаа SKU-г шинэчлэх зөвшөөрөх
            </label>
            <p className="text-[11px] text-[var(--a-faint)]">{rawRows.length} мөр олдлоо.{allowUpdateExisting ? " Файлд байгаа SKU-тай ижил бүтээгдэхүүнийг шинэ утгаар дарж бичнэ." : " Одоо байгаа SKU-тай мөр алгасагдана — устгаагүй."}</p>
            <button type="button" disabled={importCsv.isPending} onClick={runPreview} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60">
              {importCsv.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />} Урьдчилан харах
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="grid gap-3">
            <ResultSummary results={previewResults} />
            <div className="max-h-96 overflow-y-auto">
              <GenericListView<ImportResult> rows={previewResults} getRowId={r => r.row} columns={resultColumns} pageSize={50} itemLabel="мөр" />
            </div>
            {previewResults.some(r => r.outcome === "error") && (
              <div className="flex items-start gap-2 rounded-xl bg-[var(--a-neg-soft)] p-3 text-xs text-[var(--a-neg)]"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> Алдаатай мөрүүд импортлогдохгүй. Үлдсэн мөрүүдийг баталгаажуулах боломжтой.</div>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={importCsv.isPending || previewResults.every(r => r.outcome === "error" || r.outcome === "skipped")} onClick={commit} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 text-xs font-bold text-white disabled:opacity-60">
                {importCsv.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Баталгаажуулах ({previewResults.filter(r => r.outcome === "created" || r.outcome === "updated").length})
              </button>
              <button type="button" onClick={() => setStep("map")} className="h-11 rounded-full border border-[var(--a-border)] px-5 text-xs font-bold text-[var(--a-text-soft)]">Буцах</button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="grid gap-3">
            <ResultSummary results={finalResults} />
            <div className="max-h-96 overflow-y-auto">
              <GenericListView<ImportResult> rows={finalResults} getRowId={r => r.row} columns={resultColumns} pageSize={50} itemLabel="мөр" />
            </div>
            <div className="flex gap-2">
              {finalResults.some(r => r.outcome === "error") && (
                <button type="button" onClick={() => downloadFailedRows(finalResults)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--a-border)] px-4 text-xs font-bold text-[var(--a-text-soft)]"><Download size={14} /> Алдаатай мөрүүдийг татах</button>
              )}
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-full bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white">Хаах</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
