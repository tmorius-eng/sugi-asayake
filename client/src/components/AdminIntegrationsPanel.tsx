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
const providerMeta: Record<Provider, { label: string; note: string; wiredUp: boolean }> = {
  ebarimt: { label: "И-баримт", note: "Татварын албаны цахим баримт (SmartSoftware эсвэл POS API 3.0)", wiredUp: false },
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
      <div className="rounded-3xl border border-black/8 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#3970a7]">QPAY</p><h3 className="mt-1 font-bold">QPay төлбөр</h3><p className="mt-1 text-xs text-[#77787d]">Тохиргоог `.env`-ээр удирддаг, энэ дэлгэцээс өөрчлөх боломжгүй.</p></div>
          {qpayQuery.isLoading ? <LoaderCircle className="animate-spin text-[#77787d]" size={16} /> : <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${qpayQuery.data?.configured ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#f1f1f2] text-[#75767b]"}`}>{qpayQuery.data?.configured ? "Тохируулагдсан" : "Тохируулаагүй"}</span>}
        </div>
      </div>

      {integrationsQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      <div className="mt-5 grid gap-3">
        {integrations.map(row => {
          const meta = providerMeta[row.provider];
          const isEditing = editingProvider === row.provider;
          return (
            <div key={row.provider} className="rounded-3xl border border-black/8 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{row.provider.toUpperCase()}</p><h3 className="mt-1 font-bold">{meta.label}</h3><p className="mt-1 text-xs text-[#77787d]">{meta.note}</p>{row.hasCredentials ? <p className="mt-1 text-[11px] text-[#8b8c90]">{row.configuredKeys.length} талбар тохируулагдсан: {row.configuredKeys.join(", ")}</p> : <p className="mt-1 text-[11px] text-[#8b8c90]">Тохиргоо оруулаагүй байна.</p>}{!meta.wiredUp && <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-[#9b6417]"><TriangleAlert size={13} className="mt-0.5 shrink-0" />"Идэвхтэй" гэдэг нь зөвхөн энэ тохиргоог хадгалсан гэсэн үг — захиалга/төлбөрийн урсгалд одоогоор холбогдоогүй тул харилцагчид харагдахгүй, нөлөөлөхгүй.</p>}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(row)} disabled={updateIntegration.isPending} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold transition ${row.isActive ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#f1f1f2] text-[#75767b]"}`}>{row.isActive ? "Идэвхтэй" : "Идэвхгүй"}</button>
                  <button type="button" onClick={() => { setEditingProvider(row.provider); openEditor(); }} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-[10px] font-extrabold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]"><KeyRound size={12} />Тохиргоо засах</button>
                </div>
              </div>

              {isEditing && <div className="mt-4 rounded-2xl bg-[#f8f5ef] p-4">
                <p className="text-[10px] font-extrabold tracking-[.08em] text-[#3970a7]">ШИНЭ ТОХИРГОО (одоо байгааг харуулахгүй, зөвхөн энд бичсэн утгыг хадгална)</p>
                <div className="mt-3 grid gap-2">
                  {rows.map((r, index) => <div key={index} className="flex gap-2">
                    <input value={r.key} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} placeholder="Түлхүүр (жишээ: apiKey)" className="h-10 w-44 shrink-0 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                    <input value={r.value} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="Утга" type="password" className="h-10 flex-1 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                    <button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))} className="grid size-10 shrink-0 place-items-center rounded-lg text-[#707176] hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label="Мөр хасах"><Trash2 size={14} /></button>
                  </div>)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setRows(current => [...current, { key: "", value: "" }])} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-2 text-[10px] font-extrabold text-[#57585e] hover:border-[#df1f3d] hover:text-[#df1f3d]"><Plus size={12} />Мөр нэмэх</button>
                  <button type="button" onClick={() => saveCredentials(row.provider)} disabled={updateIntegration.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-4 py-2 text-[10px] font-extrabold text-white disabled:opacity-60">{updateIntegration.isPending && <LoaderCircle className="animate-spin" size={12} />}Хадгалах</button>
                  <button type="button" onClick={closeEditor} className="text-[10px] font-extrabold text-[#707176]">Цуцлах</button>
                </div>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
