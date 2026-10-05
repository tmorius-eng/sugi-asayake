import { useState, type ChangeEvent } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, ClipboardCopy, Download, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ConfirmDialog";
import { downloadJson } from "@/lib/fileDownload";
import { getSiteTextSlot, type SiteTextSlotKey } from "@shared/site-text";
import type { AdminSection } from "../../AdminWorkspace";

/**
 * Брэнд студи → Эзэн солих (B2, 2026-10-05). Сайтыг шинэ эзэнд шилжүүлэх алхам бүр нэг дор: нэр,
 * лого, өнгө, холбоо барих, салбар, хуулийн баримт, интеграц, брэнд багц, хуучин өгөгдөл цэвэрлэх.
 *
 * Өгөгдөл УСТГАХ нь энд товчгүй — зөвхөн серверт хандах эрхтэй хүн CLI-аар
 * (scripts/new-owner-reset.ts: dry-run анхдагч, нэрээр баталгаажуулалт, нэг транзакц). Вэб товч
 * нэг алдаатай даралтаар бүх харилцагчийн түүхийг устгах эрсдэлтэй тул зориуд.
 */
const NAME_SLOTS: Array<{ key: SiteTextSlotKey; label: string }> = [
  { key: "seo-text-site-name", label: "Сайтын бүтэн нэр (баримт, имэйл, хуваалцах)" },
  { key: "brand-text-short-name", label: "Богино нэр (толгой, гарчиг, ажилтны тэмдэг)" },
  { key: "brand-text-supplier", label: "Албан ёсны нийлүүлэгч (барааны хуудас)" },
  { key: "footer-text-copyright", label: "Хөлийн зохиогчийн эрх" },
];

const STEPS: Array<{ title: string; detail: string; section: AdminSection | "colors" }> = [
  { title: "Лого", detail: "Сайтын лого ба \"жижиг бэлгэ тэмдэг\" — Content & Media. Таб/апп дүрсийг тэмдгээс үүсгэх бол Дэлгүүрийн тохиргоо → \"Таб ба апп дүрсийг логоноос үүсгэх\" = 1.", section: "media" },
  { title: "Өнгө", detail: "Логоноос палитр гаргаж, Өнгө ба хэлбэр табаас хадгална.", section: "colors" },
  { title: "Холбоо барих, хүргэлт", detail: "Утас, имэйл, ажлын цаг, сошиал хаяг, хүргэлтийн үнэ, бэлгийн картын угтвар.", section: "storeSettings" },
  { title: "Салбарууд", detail: "Хаяг, газрын зураг, онлайн захиалга хүргэх үндсэн салбар (checkout-д заавал нэг).", section: "branches" },
  { title: "Хуулийн баримт", detail: "Нууцлалын бодлого, үйлчилгээний нөхцөл, буцаалт — компанийн нэр, регистрээр.", section: "documents" },
  { title: "Интеграцууд", detail: "QPay, StorePay, Brevo, ntfy, Smart Software — шинэ эзний данс, түлхүүрээр.", section: "integrations" },
  { title: "Хэмжилт", detail: "GA4 ба Meta Pixel ID — шинэ эзнийх.", section: "measurement" },
];

const RESET_COMMAND = 'pnpm exec tsx scripts/new-owner-reset.ts --keep-admin-phone=<шинэ эзний утас> --keep-catalog';

export default function OwnerChangeTab({ isAdmin, onNavigate, onColors }: { isAdmin: boolean; onNavigate?: (section: AdminSection) => void; onColors: () => void }) {
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();
  const siteText = trpc.admin.siteText.useQuery();
  const updateText = trpc.admin.updateSiteText.useMutation();
  const importPack = trpc.admin.brandStudio.importPack.useMutation();
  const [drafts, setDrafts] = useState<Partial<Record<SiteTextSlotKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const saved = new Map((siteText.data ?? []).map(row => [row.slotKey, row.textValue ?? ""]));
  const valueOf = (key: SiteTextSlotKey) => drafts[key] ?? (saved.get(key) || getSiteTextSlot(key).fallbackValue);
  const dirtyKeys = NAME_SLOTS.map(slot => slot.key).filter(key => drafts[key] !== undefined && drafts[key]!.trim() && drafts[key] !== (saved.get(key) || getSiteTextSlot(key).fallbackValue));

  const saveNames = async () => {
    setBusy(true);
    try {
      for (const key of dirtyKeys) await updateText.mutateAsync({ slotKey: key, textValue: drafts[key]!.trim() });
      setDrafts({});
      await utils.admin.siteText.invalidate();
      toast.success("Нэр хадгалагдлаа. Сайт даяар дараагийн ачаалалтад солигдоно.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Хадгалж чадсангүй.");
    } finally {
      setBusy(false);
    }
  };

  const exportPack = async () => {
    const pack = await utils.admin.brandStudio.exportPack.fetch();
    downloadJson(`brand-pack-${pack.exportedAt.slice(0, 10)}.json`, pack);
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let pack: unknown;
    try { pack = JSON.parse(await file.text()); } catch { toast.error("JSON файл уншигдсангүй."); return; }
    if ((pack as { format?: string } | null)?.format !== "brand-pack.v1") { toast.error("Энэ брэнд багц биш (format: brand-pack.v1 хэрэгтэй)."); return; }
    if (!await confirm({ title: "Брэнд багцыг импортлох уу? Өнгө, баярын загвар, нүүрний бүтэц, сайтын текст, зургийн хаяг багцынхаар солигдоно (өмнөх өнгө Түүх табд үлдэнэ).", danger: true })) return;
    try {
      const result = await importPack.mutateAsync(pack as Parameters<typeof importPack.mutateAsync>[0]);
      await Promise.all([utils.admin.brandStudio.invalidate(), utils.admin.siteText.invalidate()]);
      toast.success(`Импортлов: ${result.themes} загвар, ${result.texts} текст, ${result.media} зураг.${result.skipped.length ? ` Алгассан: ${result.skipped.length}.` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Импорт амжилтгүй.");
    }
  };

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ЭЗЭН СОЛИХ · 1</p>
        <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Брэндийн нэр</h3>
        <p className="mt-1 text-xs text-[var(--a-muted)]">Сайтыг өөр компани/хүнд шилжүүлэхэд эхэлж солино. Код дотор нэр хатуу бичигдээгүй — бүх газар эндээс уншина.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {NAME_SLOTS.map(slot => (
            <label key={slot.key} className="grid gap-1 text-[11px] font-bold">{slot.label}
              <input value={valueOf(slot.key)} onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))} maxLength={160}
                className="h-10 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal" />
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={saveNames} disabled={busy || !dirtyKeys.length} className="inline-flex items-center gap-2 rounded-full bg-[var(--a-pos)] px-5 py-2 text-[11px] font-extrabold text-[var(--a-invert-text)] disabled:opacity-40">
            {busy && <LoaderCircle className="animate-spin" size={13} />}Хадгалах
          </button>
        </div>
      </div>

      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ЭЗЭН СОЛИХ · 2</p>
        <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Шилжүүлэх алхмууд</h3>
        <ol className="mt-3 grid gap-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--a-border)] p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--a-soft)] font-mono text-[11px] font-bold">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{step.title}</p>
                <p className="text-[11px] text-[var(--a-muted)]">{step.detail}</p>
              </div>
              <button type="button" onClick={() => (step.section === "colors" ? onColors() : onNavigate?.(step.section))}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-extrabold transition hover:bg-[var(--a-soft)]">
                Нээх<ArrowRight size={12} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ЭЗЭН СОЛИХ · 3</p>
        <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Брэнд багц</h3>
        <p className="mt-1 text-xs text-[var(--a-muted)]">Өнгө, 13 баяр, нүүрний бүтэц, сайтын текст, зургийн хаягийг нэг JSON файлаар хадгалж, өөр суулгац дээр буцааж тавина. Нууц түлхүүр, хэрэглэгч, захиалга ороогүй.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportPack().catch(error => toast.error(error instanceof Error ? error.message : "Татаж чадсангүй."))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-invert-bg)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--a-invert-text)]"><Download size={13} />Брэнд багц татах</button>
          {isAdmin
            ? <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-extrabold ${importPack.isPending ? "opacity-50" : ""}`}>
                {importPack.isPending ? <LoaderCircle className="animate-spin" size={13} /> : <Upload size={13} />}Брэнд багц импортлох
                <input type="file" accept="application/json,.json" className="sr-only" disabled={importPack.isPending} onChange={onImport} />
              </label>
            : <span className="text-[11px] text-[var(--a-muted)]">Импорт зөвхөн admin эрхтэй.</span>}
        </div>
      </div>

      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-neg)]">ЭЗЭН СОЛИХ · 4 — СЕРВЕРТ</p>
        <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Хуучин эзний өгөгдөл цэвэрлэх</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">Харилцагч, захиалга, сэтгэгдэл, лог, хуучин интеграцийн түлхүүрийг устгаж, зөвхөн шинэ эзний admin данс үлдэнэ. Бараа/брэндийг сонголтоор үлдээнэ. Аюулгүйн үүднээс энэ нь <strong>вэбээс биш</strong>, серверт хандах эрхтэй хүн командаар хийнэ: эхлээд нөөц авч, dry-run-аар харж, сайтын нэрээ бичиж баталгаажуулна.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--a-soft)] p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{RESET_COMMAND}</code>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(RESET_COMMAND).then(() => toast.success("Хуулав."), () => toast.message(RESET_COMMAND)); }}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[11px] font-extrabold"><ClipboardCopy size={12} />Хуулах</button>
        </div>
        <ul className="mt-3 grid gap-1 text-[11px] text-[var(--a-muted)]">
          <li className="flex gap-1.5"><CircleDashed size={13} className="mt-0.5 shrink-0" />Нэмэлт сонголт: <code>--keep-content</code>, <code>--keep-branches</code>, <code>--keep-brand</code>. Бодитоор: <code>--apply --i-have-a-backup --confirm="&lt;сайтын нэр&gt;"</code>.</li>
          <li className="flex gap-1.5"><CheckCircle2 size={13} className="mt-0.5 shrink-0" />Дэлгэрэнгүй: docs/OWNER-HANDOVER.md — данс шилжүүлэх, домэйн, лиценз, хүлээлцэх акт.</li>
        </ul>
      </div>
    </div>
  );
}
