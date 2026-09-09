import { useState } from "react";
import { KeyRound, LoaderCircle, Plus, TriangleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
// card/eBuuhia courier) -- moves credentials out of .env into the DB so an
// admin can toggle a provider and paste in its API keys without a code
// deploy. QPay is shown alongside these for a unified view but is NOT
// managed here -- it already works end-to-end from .env (server/qpay.ts)
// and isn't retrofitted into this table. Credential edits are write-only:
// the server never returns decrypted values back, only which keys are set.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type Provider = "ebarimt" | "storepay" | "card_golomt" | "courier_ebuuhia";
type IntegrationRow = {
  provider: Provider;
  isActive: boolean;
  hasCredentials: boolean;
  configuredKeys: string[];
  updatedAt: string | Date | null;
};

// 2026-09-04 audit finding: this screen lets an admin flip a provider to
// "Идэвхтэй" and paste in real credentials, but that flag has never had a
// runtime reader anywhere -- no code path in Checkout.tsx/server/db.ts ever
// offers StorePay/Golomt-card as a payment method or calls eBarimt/eBuuhia.
// The "Идэвхтэй" toggle only reflects the admin's own intent, not whether
// the feature does anything for a real customer -- which could otherwise
// mislead Tom into thinking a provider is live. `wiredUp: false` for all 4
// records that honestly; flip a provider's flag to true only once real
// checkout/order code actually calls it (see server/qpay.ts for what a
// wired-up provider looks like -- QPay isn't in this table because it's
// already real).
const providerMeta: Record<Provider, { label: string; note: string; wiredUp: boolean; guidance?: string }> = {
  // 2026-09-04: read the developer.smartsoftware.mn page Tom pointed at --
  // it's a marketing/company-overview page with zero API/webhook docs, not
  // a technical integration guide. Separately confirmed (3 independent
  // open-source ebarimt client libraries, incl. a Node.js one) that
  // Mongolia's underlying POS API 3.0 -- which every ebarimt POS vendor,
  // SmartSoftware included, is built on -- requires a "PosService" process
  // running LOCALLY on the merchant's own network (e.g. 127.0.0.1:7080),
  // registered with an 8-digit POS number, not a plain cloud REST call our
  // Aiven-hosted server could dial from anywhere. Writing server/ebarimt.ts
  // against a guessed cloud shape would risk shipping something that looks
  // configured but can never actually reach the tax system -- see
  // EBARIMT.md's now-7 open questions for exactly what to ask SmartSoftware
  // support before any code here can be real.
  ebarimt: {
    label: "И-баримт",
    note: "Татварын албаны цахим баримт (SmartSoftware эсвэл POS API 3.0)",
    wiredUp: false,
    guidance: "developer.smartsoftware.mn-д техникийн API баримт бичиг байхгүй байсныг баталгаажуулсан. EBARIMT.md-д SmartSoftware-аас тодруулах 7 асуулт бэлэн байгаа -- ялангуяа: манай сервер таны PosService-тэй нэг сүлжээнд байх ёстой юу, эсвэл хаанаас ч дуудаж болох cloud endpoint байгаа юу? Хариу ирмэгц энд бодит талбарууд (жишээ нь posServiceUrl/posNumber) нэмэгдэнэ.",
  },
  storepay: { label: "StorePay", note: "Хэсэгчилсэн төлбөр (BNPL)", wiredUp: false },
  card_golomt: { label: "Голомт банк (карт)", note: "Visa/Mastercard шууд төлбөр (e-Merchant)", wiredUp: false },
  courier_ebuuhia: { label: "eBuuhia хүргэлт", note: "Эльчийн хүргэлтийн үйлчилгээ", wiredUp: false },
};

export default function AdminIntegrationsPanel() {
  const utils = trpc.useUtils();
  const integrationsQuery = trpc.admin.integrations.useQuery();
  const qpayQuery = trpc.payments.qpayAvailability.useQuery();
  const updateIntegration = trpc.admin.updateIntegration.useMutation();

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);

  const openEditor = () => { setRows([{ key: "", value: "" }]); };
  const closeEditor = () => { setEditingProvider(null); setRows([]); };

  const toggleActive = async (row: IntegrationRow) => {
    try {
      await updateIntegration.mutateAsync({ provider: row.provider, isActive: !row.isActive });
      utils.admin.integrations.invalidate();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const saveCredentials = async (provider: Provider) => {
    const config: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) config[key] = row.value;
    }
    try {
      await updateIntegration.mutateAsync({ provider, config: Object.keys(config).length > 0 ? config : undefined });
      toast.success("Тохиргоо хадгалагдлаа.");
      utils.admin.integrations.invalidate();
      closeEditor();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const integrations = (integrationsQuery.data ?? []) as IntegrationRow[];

  return (
    <div>
      <div className="rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">QPAY</p><h3 className="mt-1 font-bold">QPay төлбөр</h3><p className="mt-1 text-xs text-[var(--a-muted)]">Тохиргоог `.env`-ээр удирддаг, энэ дэлгэцээс өөрчлөх боломжгүй.</p></div>
          {qpayQuery.isLoading ? <LoaderCircle className="animate-spin text-[var(--a-muted)]" size={16} /> : <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${qpayQuery.data?.configured ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{qpayQuery.data?.configured ? "Тохируулагдсан" : "Тохируулаагүй"}</span>}
        </div>
      </div>

      {integrationsQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      <div className="mt-5 grid gap-3">
        {integrations.map(row => {
          const meta = providerMeta[row.provider];
          const isEditing = editingProvider === row.provider;
          return (
            <div key={row.provider} className="rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{row.provider.toUpperCase()}</p><h3 className="mt-1 font-bold">{meta.label}</h3><p className="mt-1 text-xs text-[var(--a-muted)]">{meta.note}</p>{row.hasCredentials ? <p className="mt-1 text-[11px] text-[var(--a-faint)]">{row.configuredKeys.length} талбар тохируулагдсан: {row.configuredKeys.join(", ")}</p> : <p className="mt-1 text-[11px] text-[var(--a-faint)]">Тохиргоо оруулаагүй байна.</p>}{!meta.wiredUp && <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-[var(--a-warn)]"><TriangleAlert size={13} className="mt-0.5 shrink-0" />"Идэвхтэй" гэдэг нь зөвхөн энэ тохиргоог хадгалсан гэсэн үг — захиалга/төлбөрийн урсгалд одоогоор холбогдоогүй тул харилцагчид харагдахгүй, нөлөөлөхгүй.</p>}{meta.guidance && <p className="mt-2 rounded-xl bg-[var(--a-info-soft)] p-3 text-[11px] leading-4 text-[var(--a-info)]">{meta.guidance}</p>}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(row)} disabled={updateIntegration.isPending} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold transition ${row.isActive ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{row.isActive ? "Идэвхтэй" : "Идэвхгүй"}</button>
                  <button type="button" onClick={() => { setEditingProvider(row.provider); openEditor(); }} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]"><KeyRound size={12} />Тохиргоо засах</button>
                </div>
              </div>

              {isEditing && <div className="mt-4 rounded-2xl bg-[var(--a-soft)] p-4">
                <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">ШИНЭ ТОХИРГОО (одоо байгааг харуулахгүй, зөвхөн энд бичсэн утгыг хадгална)</p>
                <div className="mt-3 grid gap-2">
                  {rows.map((r, index) => <div key={index} className="flex gap-2">
                    <input value={r.key} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} placeholder="Түлхүүр (жишээ: apiKey)" className="h-10 w-44 shrink-0 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                    <input value={r.value} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="Утга" type="password" className="h-10 flex-1 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                    <button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))} className="grid size-10 shrink-0 place-items-center rounded-lg text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label="Мөр хасах"><Trash2 size={14} /></button>
                  </div>)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setRows(current => [...current, { key: "", value: "" }])} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-2 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><Plus size={12} />Мөр нэмэх</button>
                  <button type="button" onClick={() => saveCredentials(row.provider)} disabled={updateIntegration.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-4 py-2 text-[10px] font-extrabold text-white disabled:opacity-60">{updateIntegration.isPending && <LoaderCircle className="animate-spin" size={12} />}Хадгалах</button>
                  <button type="button" onClick={closeEditor} className="text-[10px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>
                </div>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
