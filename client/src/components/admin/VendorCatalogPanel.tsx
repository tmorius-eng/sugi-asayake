import { useState } from "react";
import { ArrowDownUp, Check, FileText, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * /admin -> Интеграцууд -> Smart Software -> Үнэ / Барааны факт (2026-09-15).
 *
 * The same vendor feed the stock sync reads also carries the selling price,
 * the discounts in force and the label text (ingredients, how to use,
 * warnings) -- all of which we used to parse past and discard.
 *
 * Stock applies itself; these do not. A wrong stock number is visible and
 * self-corrects at the next pull, while a wrong price is money lost on every
 * order until somebody notices, and overwritten label text is somebody's
 * work erased. So both arrive as a list of differences with a checkbox per
 * row, and only the ticked rows move.
 *
 * The click sends BARCODES, never values: the server re-fetches from the
 * vendor and writes the vendor's own numbers.
 */
const FIELD_LABEL: Record<string, string> = {
  ingredients: "Найрлага",
  usageInstructions: "Хэрэглэх заавар",
  warnings: "Анхааруулга",
};

const money = (amount: number) => `${amount.toLocaleString("mn-MN")}₮`;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const shorten = (text: string | null, max = 70) => !text ? "—" : text.length > max ? `${text.slice(0, max)}…` : text;

export default function VendorCatalogPanel() {
  const utils = trpc.useUtils();
  const compare = trpc.admin.vendorCatalogDiff.useMutation();
  const apply = trpc.admin.applyVendorCatalog.useMutation();
  const [tab, setTab] = useState<"price" | "facts">("price");
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof compare.mutateAsync>> | null>(null);
  const [picked, setPicked] = useState<Record<string, Set<string>>>({ price: new Set(), facts: new Set() });

  const rowsFor = (kind: "price" | "facts") => kind === "price" ? (diff?.priceRows ?? []) : (diff?.factRows ?? []);
  const keyOf = (kind: "price" | "facts", row: { sku: string; field?: string }) => kind === "price" ? row.sku : `${row.sku}:${row.field}`;
  const chosen = picked[tab];

  const toggle = (key: string) => setPicked(current => {
    const next = new Set(current[tab]);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { ...current, [tab]: next };
  });

  const toggleAll = () => setPicked(current => {
    const rows = rowsFor(tab);
    const all = rows.map(row => keyOf(tab, row));
    const complete = all.length > 0 && all.every(key => current[tab].has(key));
    return { ...current, [tab]: complete ? new Set<string>() : new Set(all) };
  });

  const runCompare = async () => {
    try {
      const result = await compare.mutateAsync();
      setDiff(result);
      setPicked({ price: new Set(), facts: new Set() });
      toast.success(`${result.matched} бараа таарлаа · үнэ ${result.priceRows.length}, факт ${result.factRows.length} зөрүүтэй`);
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const runApply = async () => {
    // The key carries the field for a fact row; the server takes barcodes.
    const skus = Array.from(chosen).map(key => key.split(":")[0]);
    if (!skus.length) return toast.message("Нэг ч мөр сонгоогүй байна.");
    if (tab === "price" && !window.confirm(`${skus.length} барааны үнийг вендорын үнээр солих уу? Энэ нь харилцагчийн төлөх үнэ.`)) return;
    try {
      const result = await apply.mutateAsync({ kind: tab, skus: Array.from(new Set(skus)) });
      toast.success(`${result.applied} мөр шинэчлэгдлээ.`);
      await Promise.all([utils.admin.products.invalidate(), utils.catalog.invalidate()]);
      await runCompare();
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const busy = compare.isPending || apply.isPending;
  const rows = rowsFor(tab);

  return (
    <div className="mt-4 rounded-2xl bg-[var(--a-soft)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">ҮНЭ БА БАРААНЫ МЭДЭЭЛЭЛ</p>
        <button type="button" onClick={runCompare} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)] disabled:opacity-50">
          {compare.isPending ? <LoaderCircle className="animate-spin" size={11} /> : <RefreshCw size={11} />}Зөрүү харах
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-4 text-[var(--a-muted)]">
        Үлдэгдлээс ялгаатай нь үнэ, барааны мэдээлэл автоматаар бичигдэхгүй — зөрүүг хараад сонгосон мөрийг л хэрэглэнэ.
      </p>

      {!diff && !compare.isPending && <p className="mt-3 text-[11px] text-[var(--a-faint)]">"Зөрүү харах" дарж Smart POS дахь үнэ, найрлага, заавартай харьцуулна.</p>}

      {diff && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {([["price", "Үнэ", diff.priceRows.length, ArrowDownUp], ["facts", "Барааны факт", diff.factRows.length, FileText]] as const).map(([key, label, count, Icon]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold transition ${tab === key ? "bg-[var(--a-info)] text-white" : "bg-[var(--a-card)] text-[var(--a-text-soft)]"}`}>
                <Icon size={11} />{label} · {count}
              </button>
            ))}
            <span className="text-[11px] text-[var(--a-muted)]">{diff.products} бараанаас {diff.matched} нь манай баркодтой таарлаа.</span>
          </div>

          {diff.adminEditedFacts > 0 && tab === "facts" && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-[var(--a-muted)]">
              <TriangleAlert size={12} className="mt-0.5 shrink-0 text-[var(--a-warn)]" />
              {diff.adminEditedFacts} барааны мэдээллийг хүн гараар засварласан тул синк хөндөхгүй.
            </p>
          )}

          {!rows.length && <p className="mt-3 text-[11px] text-[var(--a-faint)]">Энэ хэсэгт зөрүү алга — Smart POS-той таарч байна.</p>}

          {rows.length > 0 && (
            <>
              <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-[var(--a-border)] bg-[var(--a-card)]">
                <table className="w-full min-w-[640px] text-left text-[11px]">
                  <thead className="sticky top-0 bg-[var(--a-soft)] text-[10px] uppercase tracking-[.06em] text-[var(--a-muted)]">
                    <tr>
                      <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Бүгдийг сонгох" checked={rows.length > 0 && rows.every(row => chosen.has(keyOf(tab, row)))} onChange={toggleAll} /></th>
                      <th className="px-3 py-2">Бараа</th>
                      {tab === "price"
                        ? <><th className="px-3 py-2">Манай үнэ</th><th className="px-3 py-2">Вендорын үнэ</th><th className="px-3 py-2">Зөрүү</th></>
                        : <><th className="px-3 py-2">Талбар</th><th className="px-3 py-2">Одоо</th><th className="px-3 py-2">Вендорт</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 300).map(row => {
                      const key = keyOf(tab, row);
                      return (
                        <tr key={key} className="border-t border-[var(--a-border)] align-top">
                          <td className="px-2 py-2"><input type="checkbox" aria-label={`${row.name} сонгох`} checked={chosen.has(key)} onChange={() => toggle(key)} /></td>
                          <td className="px-3 py-2"><span className="font-bold">{row.name}</span><span className="block text-[var(--a-faint)]">{row.sku}</span></td>
                          {"vendorPriceMnt" in row ? (
                            <>
                              <td className="whitespace-nowrap px-3 py-2">{money(row.ourPriceMnt)}</td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span className="font-bold">{money(row.vendorPriceMnt)}</span>
                                {row.discountPercent ? <span className="block text-[var(--a-pos)]">хямдрал {row.discountPercent}%</span> : null}
                                {row.upcoming.length > 0 && <span className="block text-[var(--a-muted)]">{row.upcoming[0].beginDate}-наас {row.upcoming[0].percent}% товлогдсон</span>}
                              </td>
                              <td className={`whitespace-nowrap px-3 py-2 font-bold ${row.deltaPercent > 0 ? "text-[var(--a-neg)]" : "text-[var(--a-pos)]"}`}>
                                {row.deltaPercent > 0 ? "+" : ""}{row.deltaPercent}%
                                {!row.pricesWholeProduct && <span className="block font-normal text-[var(--a-muted)]">зөвхөн энэ хувилбар</span>}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="whitespace-nowrap px-3 py-2 font-bold">{FIELD_LABEL[row.field] ?? row.field}</td>
                              <td className="px-3 py-2 text-[var(--a-muted)]">{shorten(row.ourValue)}</td>
                              <td className="px-3 py-2">{shorten(row.vendorValue)}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 300 && <p className="mt-1.5 text-[11px] text-[var(--a-faint)]">Эхний 300 мөрийг харуулав ({rows.length} зөрүүтэй).</p>}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={runApply} disabled={busy || !chosen.size} className="inline-flex items-center gap-1.5 rounded-full bg-[#3970a7] px-3 py-1.5 text-[10px] font-extrabold text-white disabled:opacity-40">
                  {apply.isPending ? <LoaderCircle className="animate-spin" size={11} /> : <Check size={11} />}Сонгосныг хэрэглэх ({chosen.size})
                </button>
                {tab === "price" && <span className="text-[11px] text-[var(--a-muted)]">Үнэ нь барааны карт болон хувилбарын аль алинд бичигдэж, аудит логт үлдэнэ.</span>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
