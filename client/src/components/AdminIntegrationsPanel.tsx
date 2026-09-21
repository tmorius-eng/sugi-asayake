import { useState } from "react";
import { CheckCircle2, ChevronDown, CircleDashed, KeyRound, LoaderCircle, Plus, RefreshCw, Send, TriangleAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { INTEGRATION_META, validateIntegrationSettings, type IntegrationProvider } from "@shared/integrations";
import IntegrationConnectCard, { type ConnectResult } from "./admin/IntegrationConnectCard";
import { IntegrationCardHeader, integrationStatus } from "./admin/integrationVisuals";
import VendorCatalogPanel from "./admin/VendorCatalogPanel";
import VendorStockAutoApplySwitch from "./admin/VendorStockAutoApplySwitch";
import { NOTIFICATION_EVENTS, NOTIFICATION_GROUP_LABELS, NTFY_TOPIC_FIELD, type NotificationEventType, type NotificationGroup } from "@shared/notification-events";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * /admin -> Интеграцууд.
 *
 * 2026-09-11 rewrite. What changed, and why:
 *  - Settings SAVE BY MERGING. The old editor sent only the keys typed into
 *    the form and the server replaced the whole stored config with them, so
 *    adding one key silently deleted every other one. Now each field is its
 *    own row: type a new value, or clear it; untouched fields are kept.
 *  - Fields come from shared/integrations.ts, so ntfy asks for exactly what
 *    it needs instead of a blank key/value grid.
 *  - ntfy (phone notifications) is the first provider actually wired to
 *    runtime code; it gets "generate topic" and "send test" buttons and the
 *    delivery log.
 *  - .env-configured services get a yes/no status card, so checking whether
 *    SMS verification or error tracking is set up no longer means opening
 *    the server's .env.
 *  - An honest card: there is no public REST API and no OAuth2 on this site
 *    (Tom asked, 2026-09-11) -- deliberately, until Smart Software's API
 *    shape is known.
 * Credentials stay write-only: the server never returns a secret or a topic.
 */
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type FieldState = { key: string; isSet: boolean; value: string | null };
type IntegrationRow = {
  provider: IntegrationProvider;
  isActive: boolean;
  hasCredentials: boolean;
  configuredKeys: string[];
  decryptFailed: boolean;
  fields: FieldState[];
  updatedAt: string | Date | null;
};

const TOPIC_GROUP_BY_FIELD = Object.fromEntries(Object.entries(NTFY_TOPIC_FIELD).map(([group, field]) => [field, group])) as Record<string, NotificationGroup>;

const statusStyles: Record<string, string> = {
  sent: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  pending: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  sending: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  failed: "bg-[var(--a-neg-soft)] text-[var(--a-neg)]",
  expired: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  suppressed: "bg-[var(--a-soft)] text-[var(--a-muted)]",
};
const statusLabels: Record<string, string> = { sent: "Илгээсэн", pending: "Хүлээгдэж буй", sending: "Илгээж байна", failed: "Амжилтгүй", expired: "Хугацаа хэтэрсэн", suppressed: "Илгээгээгүй" };

function ProviderCard({ row }: { row: IntegrationRow }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const updateIntegration = trpc.admin.updateIntegration.useMutation();
  const testIntegration = trpc.admin.testIntegration.useMutation();
  const generateTopic = trpc.admin.generateNtfyTopic.useMutation();
  const meta = INTEGRATION_META[row.provider];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraRows, setExtraRows] = useState<{ key: string; value: string }[]>([]);
  const [replaceAll, setReplaceAll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Lifted out of SmartSoftwareSyncPanel so a successful connect can hand the
  // vendor's location list straight to the branch-mapping form below.
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [skippedConnect, setSkippedConnect] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);

  const refresh = () => Promise.all([utils.admin.integrations.invalidate(), utils.notifications.mySubscriptions.invalidate()]);

  const run = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setBusyKey(key);
    try {
      await action();
      if (success) toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setBusyKey(null);
    }
  };

  const dirtySet = (): Record<string, string> => {
    const set: Record<string, string> = {};
    for (const [key, value] of Object.entries(drafts)) if (value.trim()) set[key] = value;
    for (const extra of extraRows) if (extra.key.trim() && extra.value.trim()) set[extra.key.trim()] = extra.value;
    return set;
  };

  const save = () => {
    const set = dirtySet();
    if (!Object.keys(set).length && !replaceAll) { toast.message("Өөрчлөх утга оруулаагүй байна."); return; }
    const problem = validateIntegrationSettings(row.provider, set);
    if (problem) { toast.error(problem); return; }
    return run("save", () => updateIntegration.mutateAsync({ provider: row.provider, set, replaceAll: replaceAll || undefined }).then(() => { setDrafts({}); setExtraRows([]); setReplaceAll(false); }), "Тохиргоо хадгалагдлаа.");
  };

  const clearKey = async (key: string) => {
    if (!await confirm({ title: `"${key}" тохиргоог устгах уу?`, danger: true })) return;
    return run(`clear:${key}`, () => updateIntegration.mutateAsync({ provider: row.provider, clearKeys: [key] }), "Устгалаа.");
  };

  // "Connected" is per-field, never row.hasCredentials -- that one is true as
  // soon as ANY key was saved (server/db.ts: Boolean(row.encryptedConfig)), so
  // a saved base URL alone would look like a finished sign-in.
  const connectMeta = meta.connect;
  const connected = !connectMeta || connectMeta.requiredFields.every(key => row.fields.find(field => field.key === key)?.isSet);
  const showConnect = Boolean(connectMeta) && !connected && !row.decryptFailed && !skippedConnect;
  const showEditor = !showConnect && (!connectMeta || !connected || showCredentials);

  /** Save the typed credentials, then ask the vendor whether they work. */
  const connectProvider = async (set: Record<string, string>): Promise<ConnectResult> => {
    if (Object.keys(set).length) await updateIntegration.mutateAsync({ provider: row.provider, set });
    if (row.provider !== "smartsoftware") { await refresh(); return { ok: true, detail: "Хадгаллаа." }; }
    const result = await testIntegration.mutateAsync({ provider: "smartsoftware" });
    // Only a PASSING test refreshes the parent query. `connected` is derived
    // from isSet, so refreshing after a failure would swap this card for the
    // operational panel and tell the admin it worked when it did not.
    if (!result.ok) return { ok: false, detail: result.detail ?? "Холбогдсонгүй." };
    setLocations(result.locations ?? []);
    toast.success("Холбогдлоо · " + result.detail);
    await refresh();
    return { ok: true, detail: result.detail };
  };

  const knownKeys = new Set(meta.fields.map(field => field.key));
  const handTypedKeys = row.fields.filter(field => !knownKeys.has(field.key));
  const hasDirty = Object.values(drafts).some(value => value.trim()) || extraRows.some(extra => extra.key.trim() && extra.value.trim());

  return (
    <div className="admin-card p-5">
      <IntegrationCardHeader meta={meta} status={integrationStatus(meta, row)} accentKey={meta.accent ?? "slate"} iconKey={meta.icon ?? "store"} />
      {!meta.wiredUp && <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-[var(--a-warn)]"><TriangleAlert size={13} className="mt-0.5 shrink-0" />"Идэвхтэй" гэдэг нь зөвхөн энэ тохиргоог хадгалсан гэсэн үг — захиалга/төлбөрийн урсгалд одоогоор холбогдоогүй тул харилцагчид харагдахгүй, нөлөөлөхгүй.</p>}
      {/* The switch is its own control now. While it doubled as the status
          pill, a provider that was configured but switched off looked exactly
          like one with nothing saved at all. */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl bg-[var(--a-soft)] px-3 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={row.isActive}
          aria-label={meta.label + " идэвхжүүлэх"}
          disabled={busyKey !== null}
          onClick={() => run("toggle", () => updateIntegration.mutateAsync({ provider: row.provider, isActive: !row.isActive }))}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${row.isActive ? "bg-[var(--a-pos)]" : "bg-[var(--a-border-strong)]"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${row.isActive ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className="text-[11px] font-extrabold">{busyKey === "toggle" ? "Хадгалж байна…" : row.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
        <span className="min-w-0 flex-1 text-[11px] leading-4 text-[var(--a-muted)]">Унтраасан үед тохиргоо хадгалагдсан хэвээр байх ч ажиллахгүй.</span>
      </div>
      {meta.guidance && <p className="mt-3 rounded-xl bg-[var(--a-info-soft)] p-3 text-[11px] leading-4 text-[var(--a-info)]">{meta.guidance}</p>}
      {row.decryptFailed && (
        <div className="mt-3 rounded-xl bg-[var(--a-neg-soft)] p-3 text-[11px] leading-4 text-[var(--a-neg)]">
          Хадгалсан тохиргоог тайлж чадсангүй (шифрлэлтийн түлхүүр өөрчлөгдсөн байж магадгүй). Бүх утгыг шинээр оруулж доорх "Бүгдийг солих"-г сонгоод хадгална уу.
          <label className="mt-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={replaceAll} onChange={event => setReplaceAll(event.target.checked)} />Бүгдийг солих</label>
        </div>
      )}

      {showConnect && connectMeta && (
        <IntegrationConnectCard
          provider={row.provider}
          connect={connectMeta}
          onConnect={connectProvider}
          onSkip={() => setSkippedConnect(true)}
        />
      )}

      {/* Without this, the base-URL fields become unreachable the moment the
          sign-in succeeds -- the connect card only ever shows requiredFields. */}
      {connectMeta && connected && !row.decryptFailed && (
        <button type="button" onClick={() => setShowCredentials(current => !current)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]">
          <ChevronDown size={12} className={showCredentials ? "rotate-180 transition" : "transition"} />Нэвтрэх мэдээлэл солих
        </button>
      )}

      {showEditor && meta.fields.length > 0 && (
        <div className="mt-4 grid gap-2">
          {meta.fields.map(field => {
            const state = row.fields.find(item => item.key === field.key);
            const isSecret = field.kind === "secret" || field.kind === "topic";
            const topicGroup = field.kind === "topic" ? TOPIC_GROUP_BY_FIELD[field.key] : undefined;
            return (
              <div key={field.key} className="rounded-2xl bg-[var(--a-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    {state?.isSet ? <CheckCircle2 size={13} className="text-[var(--a-pos)]" /> : <CircleDashed size={13} className="text-[var(--a-faint)]" />}
                    {field.label}
                    <span className="font-normal text-[var(--a-faint)]">· {state?.isSet ? (isSecret ? "тохируулсан (нууц)" : "тохируулсан") : "хоосон"}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {topicGroup && <button type="button" disabled={busyKey !== null} onClick={async () => { if (state?.isSet && !await confirm({ title: `"${NOTIFICATION_GROUP_LABELS[topicGroup]}" бүлгийн сэдвийг шинэчлэх үү? Одоо бүртгүүлсэн хүмүүс QR кодыг дахин уншуулах шаардлагатай болно.` })) return; void run(`topic:${field.key}`, () => generateTopic.mutateAsync({ group: topicGroup }), "Сэдэв үүслээ."); }} className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]">
                      {busyKey === `topic:${field.key}` ? <LoaderCircle className="animate-spin" size={11} /> : <RefreshCw size={11} />}{state?.isSet ? "Шинэчлэх" : "Сэдэв үүсгэх"}
                    </button>}
                    {topicGroup && meta.testable && state?.isSet && <button type="button" disabled={busyKey !== null} onClick={() => run(`test:${field.key}`, async () => { const result = await testIntegration.mutateAsync({ provider: "ntfy", group: topicGroup }); if (!result.ok) throw new Error(result.error ?? "Илгээж чадсангүй."); }, "Туршилт илгээлээ — утсаа шалгана уу.")} className="inline-flex items-center gap-1 rounded-full bg-[var(--a-info)] px-2.5 py-1 text-[10px] font-extrabold text-white disabled:opacity-60">
                      {busyKey === `test:${field.key}` ? <LoaderCircle className="animate-spin" size={11} /> : <Send size={11} />}Туршилт
                    </button>}
                    {state?.isSet && <button type="button" disabled={busyKey !== null} onClick={() => clearKey(field.key)} className="grid size-6 place-items-center rounded-full text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${field.label} устгах`}><X size={12} /></button>}
                  </div>
                </div>
                {!topicGroup && (
                  <input
                    value={drafts[field.key] ?? ""}
                    onChange={event => setDrafts(current => ({ ...current, [field.key]: event.target.value }))}
                    type={isSecret ? "password" : "text"}
                    aria-label={field.label}
                    autoComplete="off"
                    placeholder={state?.value ?? (state?.isSet ? "•••••••• (шинэ утга бичвэл солигдоно)" : field.defaultValue ?? "")}
                    className="mt-2 h-9 w-full rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 text-xs outline-none focus:border-[#df1f3d]"
                  />
                )}
                {field.help && <p className="mt-1.5 text-[11px] leading-4 text-[var(--a-muted)]">{field.help}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showEditor && meta.freeForm && (
        <div className="mt-4 rounded-2xl bg-[var(--a-soft)] p-3">
          <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">НЭМЭЛТ ТҮЛХҮҮРҮҮД</p>
          {handTypedKeys.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {handTypedKeys.map(field => <span key={field.key} className="inline-flex items-center gap-1 rounded-full bg-[var(--a-card)] px-2.5 py-1 text-[11px] font-bold"><KeyRound size={11} />{field.key}<button type="button" onClick={() => clearKey(field.key)} className="text-[var(--a-muted)] hover:text-[#df1f3d]" aria-label={`${field.key} устгах`}><X size={11} /></button></span>)}
            </div>
          ) : <p className="mt-1 text-[11px] text-[var(--a-faint)]">Одоогоор нэмэлт түлхүүр алга.</p>}
          <div className="mt-2 grid gap-2">
            {extraRows.map((extra, index) => (
              <div key={index} className="flex gap-2">
                <input value={extra.key} onChange={event => setExtraRows(current => current.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} placeholder="Түлхүүр (жишээ: apiKey)" className="h-9 w-40 shrink-0 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                <input value={extra.value} onChange={event => setExtraRows(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="Утга" type="password" autoComplete="off" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                <button type="button" onClick={() => setExtraRows(current => current.filter((_, i) => i !== index))} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label="Мөр хасах"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setExtraRows(current => [...current, { key: "", value: "" }])} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[#df1f3d] hover:text-[#df1f3d]"><Plus size={12} />Түлхүүр нэмэх</button>
        </div>
      )}

      {showEditor && (hasDirty || replaceAll) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={busyKey !== null} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-4 py-2 text-[11px] font-extrabold text-white disabled:opacity-60">{busyKey === "save" && <LoaderCircle className="animate-spin" size={12} />}Хадгалах</button>
          <button type="button" onClick={() => { setDrafts({}); setExtraRows([]); setReplaceAll(false); }} className="text-[11px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>
          <p className="text-[11px] text-[var(--a-faint)]">Зөвхөн бичсэн талбарууд солигдоно, бусад нь хэвээр үлдэнэ.</p>
        </div>
      )}

      {row.provider === "ntfy" && <NotificationOutboxLog />}
      {row.provider === "smartsoftware" && !showConnect && <SmartSoftwareSyncPanel locations={locations} setLocations={setLocations} />}
    </div>
  );
}

function NotificationOutboxLog() {
  const outboxQuery = trpc.admin.notificationOutbox.useQuery(undefined, { refetchInterval: 30_000 });
  const rows = outboxQuery.data ?? [];
  return (
    <div className="mt-4">
      <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">СҮҮЛИЙН МЭДЭГДЛҮҮД</p>
      {outboxQuery.isLoading && <p className="mt-2 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={13} />Уншиж байна…</p>}
      {!outboxQuery.isLoading && !rows.length && <p className="mt-2 text-[11px] text-[var(--a-faint)]">Одоогоор мэдэгдэл үүсээгүй.</p>}
      {rows.length > 0 && (
        <div className="mt-2 max-h-80 overflow-auto rounded-2xl border border-[var(--a-border)]">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="sticky top-0 bg-[var(--a-soft)] text-[10px] uppercase tracking-[.06em] text-[var(--a-muted)]">
              <tr><th className="px-3 py-2">Хэзээ</th><th className="px-3 py-2">Мэдэгдэл</th><th className="px-3 py-2">Бүлэг</th><th className="px-3 py-2">Төлөв</th></tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-[var(--a-border)] align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--a-muted)]">{new Date(row.createdAt).toLocaleString("mn-MN")}</td>
                  <td className="px-3 py-2"><span className="font-bold">{row.title}</span><span className="block text-[var(--a-faint)]">{NOTIFICATION_EVENTS[row.eventType as NotificationEventType]?.label ?? row.eventType}</span></td>
                  <td className="px-3 py-2">{NOTIFICATION_GROUP_LABELS[row.groupKey as NotificationGroup] ?? row.groupKey}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusStyles[row.status] ?? ""}`}>{statusLabels[row.status] ?? row.status}</span>
                    {row.attempts > 1 && <span className="ml-1 text-[var(--a-faint)]">×{row.attempts}</span>}
                    {row.lastError && row.status !== "sent" && <span className="mt-1 block max-w-[220px] break-words text-[var(--a-faint)]">{row.lastError}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Phase 6 (2026-09-12): the Smart Software sync. "Холболт шалгах" asks the
 * vendor for its location list (which doubles as the picker for the branch
 * mapping below), and "Үлдэгдэл татах" turns their stock figures into a
 * stocktake per branch that warehouse/admin approve in Бараа хүлээн авах →
 * Тооллого. Stock is never written from here -- see
 * server/integrations/inventorySync.ts's runPullSnapshot.
 */
function SmartSoftwareSyncPanel({ locations, setLocations }: { locations: { id: string; name: string }[]; setLocations: (next: { id: string; name: string }[]) => void }) {
  const utils = trpc.useUtils();
  const statusQuery = trpc.admin.inventorySyncStatus.useQuery();
  const setCode = trpc.admin.setBranchExternalId.useMutation();
  const testConnection = trpc.admin.testIntegration.useMutation();
  const pullStock = trpc.admin.pullVendorStock.useMutation();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [pulled, setPulled] = useState<Awaited<ReturnType<typeof pullStock.mutateAsync>> | null>(null);
  const data = statusQuery.data;
  if (statusQuery.isLoading || !data) return <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={13} />Уншиж байна…</p>;

  const save = async (branchId: number) => {
    try {
      await setCode.mutateAsync({ branchId, externalId: drafts[branchId]?.trim() || null });
      setDrafts(current => { const next = { ...current }; delete next[branchId]; return next; });
      await utils.admin.inventorySyncStatus.invalidate();
      toast.success("Салбарын код хадгалагдлаа.");
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const test = async () => {
    try {
      const result = await testConnection.mutateAsync({ provider: "smartsoftware" });
      setLocations(result.locations ?? []);
      if (result.ok) toast.success(`Холбогдлоо · ${result.detail}`);
      else toast.error(result.detail ?? "Холбогдсонгүй.");
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const pull = async () => {
    try {
      const result = await pullStock.mutateAsync();
      setPulled(result);
      await Promise.all([utils.admin.inventorySyncStatus.invalidate(), utils.inventory.counts.invalidate()]);
      const created = result.ran ? result.branches.filter(branch => branch.countId).length : 0;
      const applied = result.ran ? result.autoApplied.length : 0;
      toast.success(!created
        ? "Зөрүү олдсонгүй — Smart POS-той таарч байна."
        : applied ? `${applied} салбарын үлдэгдэл шинэчлэгдлээ.` : `${created} салбарт батлах тооллого үүслээ.`);
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const busy = testConnection.isPending || pullStock.isPending;
  return (
    <div className="mt-4 grid gap-3 [&>*]:min-w-0">
      <p className={`rounded-xl p-3 text-[11px] leading-4 ${data.credentialsSet ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>
        {data.credentialsSet
          ? data.isActive ? "Нэвтрэх мэдээлэл тохирсон, идэвхтэй — 15 минут тутам үлдэгдэл татна." : "Нэвтрэх мэдээлэл тохирсон. Автомат синк эхлэхийн тулд дээрх \"Идэвхтэй\" товчийг асаана уу (одоо ч гараар татаж болно)."
          : "Смарт Ложикоос ирсэн нэвтрэх нэр, нууц үгээ дээр оруулаад хадгална уу."}
      </p>
      <VendorStockAutoApplySwitch />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)] disabled:opacity-50">
          {testConnection.isPending ? <LoaderCircle className="animate-spin" size={11} /> : <RefreshCw size={11} />}Холболт шалгах
        </button>
        <button type="button" onClick={pull} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-[#3970a7] px-3 py-1.5 text-[10px] font-extrabold text-white disabled:opacity-50">
          {pullStock.isPending ? <LoaderCircle className="animate-spin" size={11} /> : <Send size={11} />}Үлдэгдэл татах
        </button>
      </div>
      {locations.length > 0 && <p className="text-[11px] text-[var(--a-muted)]">Smart POS байршлууд: {locations.map(location => `${location.id} · ${location.name}`).join(" | ")}</p>}
      <div className="rounded-2xl bg-[var(--a-soft)] p-3">
        <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">САЛБАРЫН КОД (SMART POS)</p>
        <div className="mt-2 grid gap-1.5 [&>*]:min-w-0">
          {data.branches.filter(branch => branch.isActive).map(branch => {
            const draft = drafts[branch.id];
            const dirty = draft !== undefined && draft.trim() !== (branch.externalId ?? "");
            return (
              <div key={branch.id} className="flex items-center gap-2 rounded-lg bg-[var(--a-card)] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{branch.name}{branch.kind === "warehouse" ? " (агуулах)" : ""}</span>
                <input list="smart-locations" value={draft ?? branch.externalId ?? ""} onChange={event => setDrafts(current => ({ ...current, [branch.id]: event.target.value }))} placeholder="Smart POS дахь код" className="h-8 w-40 rounded-md border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs outline-none focus:border-[var(--a-info)]" />
                <button type="button" disabled={!dirty || setCode.isPending} onClick={() => save(branch.id)} className="rounded-md bg-[#3970a7] px-2.5 py-1.5 text-[10px] font-extrabold text-white disabled:opacity-40">Хадгалах</button>
              </div>
            );
          })}
        </div>
        <datalist id="smart-locations">{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</datalist>
      </div>
      {pulled?.ran && (
        <div className="rounded-2xl bg-[var(--a-soft)] p-3 text-[11px] leading-4">
          <p className="font-bold">{pulled.products} бараанаас {pulled.matchedProducts} нь манай баркодтой таарлаа.</p>
          {pulled.branches.map(branch => (
            <p key={branch.branchId} className="mt-1 text-[var(--a-muted)]">{branch.branchName} ({branch.locationId}): {branch.countId ? <span className="font-bold text-[var(--a-info)]">{branch.code} — {branch.lines} зөрүүтэй бараа, батлахыг хүлээж байна</span> : "зөрүүгүй"}</p>
          ))}
          {pulled.autoApplied.length > 0 && <p className="mt-1 font-bold text-[var(--a-pos)]">Автоматаар бичигдлээ: {pulled.autoApplied.reduce((sum, branch) => sum + branch.adjustedLines, 0)} бараа, {pulled.autoApplied.length} салбарт.</p>}
          {pulled.autoApplySkipped && <p className="mt-1 font-bold text-[var(--a-warn)]">{pulled.autoApplySkipped}</p>}
          {pulled.unmappedLocations.length > 0 && <p className="mt-1 text-[var(--a-warn)]">Салбарт холбоогүй байршил: {pulled.unmappedLocations.join(", ")}</p>}
          {pulled.unknownSkuCount > 0 && <p className="mt-1 text-[var(--a-muted)]">Манайд байхгүй {pulled.unknownSkuCount} баркод алгаслаа{pulled.unknownSkus.length ? ` (${pulled.unknownSkus.slice(0, 5).join(", ")}…)` : ""}.</p>}
          {pulled.problems.map(problem => <p key={problem} className="mt-1 text-[var(--a-neg)]">{problem}</p>)}
        </div>
      )}
      <VendorCatalogPanel />
      {data.streams.length > 0 && (
        <div className="grid gap-1.5">
          {data.streams.map(stream => (
            <p key={stream.stream} className="text-[11px] text-[var(--a-muted)]"><strong className="text-[var(--a-text)]">{stream.stream}</strong> · сүүлд {stream.lastRunAt ? new Date(stream.lastRunAt).toLocaleString("mn-MN") : "—"}{stream.lastError ? <span className="text-[var(--a-neg)]"> · {stream.lastError}</span> : " · амжилттай"}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvStatusCard() {
  const statusQuery = trpc.admin.envIntegrationStatus.useQuery();
  return (
    <div className="admin-card p-5">
      <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">СЕРВЕРИЙН ТОХИРГОО (.env)</p>
      <h3 className="mt-1 font-bold">Сервер дээр тохируулдаг үйлчилгээнүүд</h3>
      <p className="mt-1 text-xs text-[var(--a-muted)]">Эдгээрийг энэ дэлгэцээс өөрчлөхгүй — зөвхөн тохируулагдсан эсэхийг харуулна. Нууц утга хэзээ ч харагдахгүй.</p>
      {statusQuery.isLoading && <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={13} />Шалгаж байна…</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(statusQuery.data ?? []).map(item => (
          <div key={item.key} className="flex items-start gap-2 rounded-2xl bg-[var(--a-soft)] p-3">
            {item.configured ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--a-pos)]" /> : <CircleDashed size={15} className="mt-0.5 shrink-0 text-[var(--a-faint)]" />}
            <div className="min-w-0">
              <p className="text-xs font-bold">{item.label}</p>
              <p className="text-[11px] leading-4 text-[var(--a-muted)]">{item.configured ? "Тохируулсан" : "Тохируулаагүй"} · {item.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminIntegrationsPanel() {
  const integrationsQuery = trpc.admin.integrations.useQuery();
  const qpayQuery = trpc.payments.qpayAvailability.useQuery();
  const integrations = (integrationsQuery.data ?? []) as IntegrationRow[];
  // The one wired-up provider first; the rest in their schema order.
  const ordered = [...integrations].sort((a, b) => Number(INTEGRATION_META[b.provider].wiredUp) - Number(INTEGRATION_META[a.provider].wiredUp));

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="admin-card p-5">
        <IntegrationCardHeader
          meta={{ label: "QPay төлбөр", note: "Тохиргоог сервер дээрх .env файлаар удирддаг, энэ дэлгэцээс өөрчлөх боломжгүй." }}
          status={qpayQuery.isLoading
            ? { label: "Шалгаж байна…", className: "bg-[var(--a-soft)] text-[var(--a-muted)]" }
            : qpayQuery.data?.configured
              ? { label: "Тохируулагдсан", className: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" }
              : { label: "Тохируулаагүй", className: "bg-[var(--a-soft)] text-[var(--a-muted)]" }}
          accentKey="green"
          iconKey="wallet"
        />
      </div>

      {integrationsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {integrationsQuery.error && <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(integrationsQuery.error)}</p>}
      {ordered.map(row => <ProviderCard key={row.provider} row={row} />)}

      <EnvStatusCard />

      <div className="rounded-3xl border border-dashed border-[var(--a-border)] bg-[var(--a-card)] p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">REST API / OAUTH2</p>
        <h3 className="mt-1 font-bold">Гадны системд зориулсан API — одоогоор байхгүй (зориуд)</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">Энэ сайт гадны программд нээлттэй REST API болон OAuth2 нэвтрэлт гаргадаггүй — ингэх шаардлага гарсангүй. Smart Software-ийн API-ийн хэлбэр 2026-09-12-нд тодорхой болсон: холболт нь нэг чиглэлтэй, МАНАЙ сервер тэдэн рүү залгаж (OAuth2 нэр/нууц үгээр) үлдэгдлээ татдаг тул тэдэнд манай руу хандах эрх хэрэггүй. Гадагшаа нээлттэй цэгүүд нь зөвхөн QPay, StorePay, verify.mn-ийн callback бөгөөд тэдгээр нь "төлбөр төллөө" гэдэгт callback-ийн үгээр итгэдэггүй, өөрсдөө эргэж шалгадаг. Хэрэв ирээдүйд гадны систем манай руу өгөгдөл илгээх шаардлага гарвал HMAC гарын үсэгтэй webhook нэмнэ.</p>
      </div>
    </div>
  );
}
