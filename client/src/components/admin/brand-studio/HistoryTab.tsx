import { useState } from "react";
import { History, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ConfirmDialog";

/** Брэнд студи → Түүх (2026-10-05): хадгалалт бүр хувилбар; сэргээх нь өөрөө шинэ хувилбар болно. */
export default function HistoryTab({ themes }: { themes: Array<{ key: string; name: string }> }) {
  const [themeKey, setThemeKey] = useState("base");
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();
  const versions = trpc.admin.brandStudio.versions.useQuery({ themeKey });
  const rollback = trpc.admin.brandStudio.rollback.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.admin.brandStudio.overview.invalidate(), utils.admin.brandStudio.versions.invalidate({ themeKey })]);
      toast.success("Хувилбар сэргээгдлээ. Сайтад 1 минутын дотор хүрнэ.");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="admin-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <History size={18} className="text-[var(--a-info)]" />
        <h3 className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Хадгалалтын түүх</h3>
        <select value={themeKey} onChange={event => setThemeKey(event.target.value)} aria-label="Загвар" className="ml-auto h-9 min-w-0 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-bold">
          {themes.map(theme => <option key={theme.key} value={theme.key}>{theme.name}</option>)}
        </select>
      </div>
      <p className="mt-1 text-xs text-[var(--a-muted)]">Хадгалах бүрт өмнөх төлөв энд үлдэнэ (сүүлийн 30). Сэргээх нь одоогийн төлөвийг ч мөн түүхэд үлдээнэ — буцаалтаа буцааж болно.</p>
      {versions.isLoading && <p className="mt-4 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}
      {versions.data && versions.data.length === 0 && <p className="mt-4 rounded-2xl bg-[var(--a-soft)] p-4 text-xs text-[var(--a-muted)]">Энэ загварыг хараахан өөрчлөөгүй байна.</p>}
      <ul className="mt-4 grid gap-2">
        {versions.data?.map(version => (
          <li key={version.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--a-border)] p-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--a-soft)] font-mono text-xs font-bold">#{version.version}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">{new Date(version.createdAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar", dateStyle: "medium", timeStyle: "short" })}</p>
              <p className="truncate text-[11px] text-[var(--a-muted)]">{version.note || "Хадгалахаас өмнөх төлөв"}</p>
            </div>
            <button type="button" disabled={rollback.isPending}
              onClick={async () => {
                if (!await confirm({ title: `#${version.version} хувилбарыг сэргээх үү? Сайтын өнгө тэр үеийнх болно.` })) return;
                rollback.mutate({ themeKey, version: version.version });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-extrabold transition hover:bg-[var(--a-soft)] disabled:opacity-40">
              <RotateCcw size={13} />Сэргээх
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
