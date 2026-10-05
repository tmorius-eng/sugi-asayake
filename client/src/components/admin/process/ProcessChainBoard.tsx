import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { ACTOR_KIND_LABELS, PROCESS_SIDE_STAGES, PROCESS_STAGES, stageLabel, type ActorKind } from "@shared/process-timeline";
import { formatMnt } from "@shared/format";
import { trpc } from "@/lib/trpc";
import { actorChipClass, formatDateTime, relativeTime } from "@/lib/processLabels";
import AdminCountUp from "../AdminCountUp";
import type { AdminSection } from "../../AdminWorkspace";

const STUCK_OPTIONS = [6, 12, 24, 48, 72];
const ACTOR_ORDER: ActorKind[] = ["customer", "staff", "job", "webhook", "system"];
const countFormat = (value: number) => String(Math.round(value));

type StageStatus = (typeof PROCESS_STAGES)[number] | (typeof PROCESS_SIDE_STAGES)[number];

export default function ProcessChainBoard({ onOpenTrail, onSearchIn, stageRequest }: {
  onOpenTrail: (orderId: number) => void;
  onSearchIn: (section: AdminSection, query: string) => void;
  stageRequest: { status: string; stuckOnly: boolean; nonce: number } | null;
}) {
  const [stuckHours, setStuckHours] = useState(24);
  const [selected, setSelected] = useState<StageStatus | null>(null);
  const [stuckOnly, setStuckOnly] = useState(false);
  const overview = trpc.admin.process.overview.useQuery({ stuckHours });

  useEffect(() => {
    if (!stageRequest) return;
    setSelected(stageRequest.status as StageStatus);
    setStuckOnly(stageRequest.stuckOnly);
  }, [stageRequest]);

  const data = overview.data;
  const stageByStatus = new Map((data?.stages ?? []).map(stage => [stage.status as string, stage]));
  const closedByStatus = new Map((data?.closed ?? []).map(item => [item.status as string, item.count]));

  if (overview.isLoading) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>;
  if (overview.error || !data) return <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">Процессын мэдээлэл уншигдсангүй. Дахин оролдоно уу.</p>;

  const actors = ACTOR_ORDER.map(kind => ({ kind, count: (data.actors24h as Record<string, number>)[kind] ?? 0 }));
  const sync = data.vendorSync;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0" aria-label="Захиалгын гинж">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[11px] text-[var(--a-muted)]">Сүүлийн 24 цаг:</p>
        <ul className="flex flex-wrap gap-1.5">
          {actors.map(item => (
            <li key={item.kind} className={actorChipClass(item.kind)}>{ACTOR_KIND_LABELS[item.kind]} <strong>{item.count}</strong></li>
          ))}
        </ul>
        <label className="ml-auto flex items-center gap-2 text-[11px] font-bold text-[var(--a-text-soft)]">
          Гацсан гэж үзэх
          <select value={stuckHours} onChange={event => setStuckHours(Number(event.target.value))} className="h-9 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs">
            {STUCK_OPTIONS.map(hours => <option key={hours} value={hours}>{hours} цаг</option>)}
          </select>
        </label>
      </div>
      {data.missingTrail > 0 && <p className="text-[11px] text-[var(--a-faint)]">Түүхгүй захиалга {data.missingTrail} (backfill хийгдээгүй)</p>}

      <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {PROCESS_STAGES.map((status, index) => {
          const stage = stageByStatus.get(status);
          return (
            <Fragment key={status}>
              {index > 0 && <span className="a-process-connector" aria-hidden="true"><ArrowRight size={16} /></span>}
              <StageLane status={status} count={stage?.count ?? 0} stuck={stage?.stuck ?? 0} oldestAt={stage?.oldestAt ?? null} active={selected === status} onSelect={() => { setSelected(selected === status ? null : status); setStuckOnly(false); }} />
            </Fragment>
          );
        })}
        <span className="a-process-connector" aria-hidden="true"><ArrowRight size={16} /></span>
        <SyncCard sync={sync} />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {PROCESS_SIDE_STAGES.map(status => (
          <StageLane key={status} status={status} count={closedByStatus.get(status) ?? 0} stuck={0} oldestAt={null} sub="сүүлийн 30 хоног" active={selected === status} onSelect={() => { setSelected(selected === status ? null : status); setStuckOnly(false); }} />
        ))}
      </div>

      {selected && <StageOrderList status={selected} stuckOnly={stuckOnly} setStuckOnly={setStuckOnly} stuckHours={stuckHours} onOpenTrail={onOpenTrail} onSearchIn={onSearchIn} />}
    </section>
  );
}

function StageLane({ status, count, stuck, oldestAt, sub, active, onSelect }: {
  status: StageStatus; count: number; stuck: number; oldestAt: string | Date | null; sub?: string; active: boolean; onSelect: () => void;
}) {
  const label = stageLabel(status);
  return (
    <button type="button" onClick={onSelect} aria-pressed={active} aria-label={`${label} — ${count} захиалга${stuck > 0 ? `, ${stuck} гацсан` : ""} — харах`} className={`a-process-lane ${active ? "a-process-lane-active" : ""}`}>
      <span className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">{label.toUpperCase()}</span>
      <span className="mt-2 block font-[var(--font-display)] text-3xl font-semibold" aria-hidden="true"><AdminCountUp value={count} format={countFormat} /></span>
      {sub && <span className="mt-1 block text-[11px] text-[var(--a-muted)]">{sub}</span>}
      {stuck > 0 && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--a-warn-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-warn)]" aria-hidden="true"><AlertTriangle size={11} />Гацсан {stuck}</span>}
      {oldestAt && <span className="mt-1 block text-[11px] text-[var(--a-muted)]">Хамгийн хуучин: {relativeTime(oldestAt)}</span>}
    </button>
  );
}

function SyncCard({ sync }: { sync: { configured: boolean; behindCount: number; lastOkAt: string | Date | null; lastRunAt: string | Date | null; lastError: string | null } }) {
  return (
    <div className="a-process-lane a-process-lane-terminal" role="group" aria-label="Smart Software sync">
      <span className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">SMART SOFTWARE SYNC</span>
      {!sync.configured ? (
        <p className="mt-2 text-xs text-[var(--a-muted)]">Холбогдоогүй</p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold">
            {sync.lastError ? <AlertTriangle size={14} className="text-[var(--a-warn)]" aria-hidden="true" /> : <CheckCircle2 size={14} className="text-[var(--a-pos)]" aria-hidden="true" />}
            {sync.behindCount > 0 ? `${sync.behindCount} дамжуулаагүй` : "Бүгд дамжсан"}
          </p>
          <p className="mt-1 text-[11px] text-[var(--a-muted)]" title={formatDateTime(sync.lastOkAt)}>Сүүлд амжилттай: {relativeTime(sync.lastOkAt)}</p>
          {sync.lastError && <p className="mt-1 line-clamp-2 text-[11px] text-[var(--a-warn)]" title={sync.lastError}>{sync.lastError}</p>}
        </>
      )}
    </div>
  );
}

function StageOrderList({ status, stuckOnly, setStuckOnly, stuckHours, onOpenTrail, onSearchIn }: {
  status: StageStatus; stuckOnly: boolean; setStuckOnly: (value: boolean) => void; stuckHours: number;
  onOpenTrail: (orderId: number) => void; onSearchIn: (section: AdminSection, query: string) => void;
}) {
  const query = trpc.admin.process.stageOrders.useQuery({ status, stuckOnly, stuckHours, limit: 50 });
  const rows = query.data ?? [];
  return (
    <div className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{stageLabel(status)} — захиалгууд</h2>
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--a-text-soft)]"><input type="checkbox" checked={stuckOnly} onChange={event => setStuckOnly(event.target.checked)} />Гацсан л</label>
      </div>
      {query.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--a-faint)]">Захиалга алга.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map(row => (
            <li key={row.id} className="grid min-w-0 gap-2 rounded-xl bg-[var(--a-soft)] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-xs font-bold">{row.orderNumber} · {formatMnt(row.totalMnt)} <span className="font-normal text-[var(--a-muted)]">· {row.paymentStatus} · {row.paymentMethod}</span></p>
                {row.lastEvent ? (
                  <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--a-text-soft)]">
                    <span className={actorChipClass(row.lastEvent.actorKind)}>{row.lastEvent.actorLabel ?? ACTOR_KIND_LABELS[row.lastEvent.actorKind as ActorKind] ?? row.lastEvent.actorKind}</span>
                    <span className="min-w-0 break-words">{row.lastEvent.summary}</span>
                  </p>
                ) : <p className="mt-1 text-[11px] text-[var(--a-faint)]">Түүх бүртгэгдээгүй</p>}
                <p className="mt-0.5 text-[11px] text-[var(--a-faint)]" title={formatDateTime(row.updatedAt)}>Шинэчлэгдсэн: {relativeTime(row.updatedAt)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onOpenTrail(row.id)} className="h-8 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">Түүх</button>
                <button type="button" onClick={() => onSearchIn("orders", row.orderNumber)} className="h-8 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-[11px] font-bold">Захиалгад</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
