import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ACTOR_KIND_LABELS, type ActorKind } from "@shared/process-timeline";
import { trpc } from "@/lib/trpc";
import { actionLabel } from "@/lib/adminAuditLabels";
import { actorChipClass, formatDateTime, intervalLabel, relativeTime } from "@/lib/processLabels";

const ACTOR_KINDS = Object.keys(ACTOR_KIND_LABELS) as ActorKind[];

export default function ProcessJobsAndAudit({ onOpenTrail }: { onOpenTrail: (orderId: number) => void }) {
  const [actorKind, setActorKind] = useState<ActorKind | "">("");
  const jobs = trpc.admin.process.jobs.useQuery();
  const feed = trpc.admin.process.auditFeed.useQuery({ limit: 100, actorKind: actorKind || undefined });
  const th = "px-3 py-2 text-[10px] font-extrabold tracking-[.1em] text-[var(--a-faint)]";
  const td = "px-3 py-2 align-top text-xs";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 [&>*]:min-w-0">
      <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
        <h2 className="text-sm font-bold">Автомат ажлууд</h2>
        {jobs.data && !jobs.data.schedulerActive && (
          <p className="mt-2 rounded-xl bg-[var(--a-warn-soft)] px-3 py-2 text-[11px] text-[var(--a-warn)]" data-testid="scheduler-inactive">
            Энэ сервер хуваарьт ажил ажиллуулдаггүй — staging схем, эсвэл cluster-ийн үндсэн (0-р) instance биш. Production дээр үндсэн instance л ажиллуулж, түүх нь энд бичигдэнэ.
          </p>
        )}
        {jobs.isLoading ? <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p> : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
                <thead><tr><th className={th}>АЖИЛ</th><th className={th}>ДАВТАМЖ</th><th className={th}>СҮҮЛД АЖИЛЛАСАН</th><th className={th}>ДАРААГИЙН</th><th className={th}>ТӨЛӨВ</th></tr></thead>
                <tbody>
                  {(jobs.data?.jobs ?? []).map(job => (
                    <tr key={job.name} className="border-t border-[var(--a-border)]">
                      <td className={`${td} font-mono`}>{job.name}</td>
                      <td className={td}>{intervalLabel(job.intervalMs)}</td>
                      <td className={td} title={formatDateTime(job.lastRunAt)}>{relativeTime(job.lastRunAt)}</td>
                      <td className={td} title={formatDateTime(job.nextDueAt)}>{relativeTime(job.nextDueAt)}</td>
                      <td className={td}>{job.claimedAt ? <span className="rounded-full bg-[var(--a-info-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-info)]">ажиллаж байна</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-5 text-xs font-bold">Сүүлийн ажиллалтууд</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
                <thead><tr><th className={th}>ЭХЭЛСЭН</th><th className={th}>АЖИЛ</th><th className={th}>ДҮН</th><th className={th}>ҮРГЭЛЖЛЭХ (С)</th><th className={th}>ӨӨРЧЛӨГДСӨН</th><th className={th}>ЭЗЭМШИГЧ</th><th className={th}>АЛДАА</th></tr></thead>
                <tbody>
                  {(jobs.data?.runs ?? []).map(run => {
                    const seconds = run.finishedAt ? Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)) : null;
                    return (
                      <tr key={run.id} className="border-t border-[var(--a-border)]">
                        <td className={td}>{formatDateTime(run.startedAt)}</td>
                        <td className={`${td} font-mono`}>{run.jobName}</td>
                        <td className={td}>
                          {run.finishedAt === null ? <span className="rounded-full bg-[var(--a-info-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-info)]">… ажиллаж байна</span>
                            : run.ok ? <span className="rounded-full bg-[var(--a-pos-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-pos)]">✓ амжилттай</span>
                            : <span className="rounded-full bg-[var(--a-neg-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--a-neg)]">✗ алдаа</span>}
                        </td>
                        <td className={td}>{seconds ?? "—"}</td>
                        <td className={td}>{run.affectedCount ?? "—"}</td>
                        <td className={`${td} font-mono`}>{run.claimedBy ?? "—"}</td>
                        <td className={`${td} max-w-[220px] truncate`} title={run.error ?? undefined}>{run.error ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Аудитын урсгал</h2>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--a-text-soft)]">
            Үйлдэгч
            <select value={actorKind} onChange={event => setActorKind(event.target.value as ActorKind | "")} className="h-9 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs">
              <option value="">Бүгд</option>
              {ACTOR_KINDS.map(kind => <option key={kind} value={kind}>{ACTOR_KIND_LABELS[kind]}</option>)}
            </select>
          </label>
        </div>
        {feed.isLoading ? <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>
          : (feed.data ?? []).length === 0 ? <p className="mt-3 text-xs text-[var(--a-faint)]">Бүртгэл алга.</p> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
                <thead><tr><th className={th}>ЦАГ</th><th className={th}>ҮЙЛДЭГЧ</th><th className={th}>ҮЙЛДЭЛ</th><th className={th}>ЗАХИАЛГА</th></tr></thead>
                <tbody>
                  {(feed.data ?? []).map(row => (
                    <tr key={row.key} className="border-t border-[var(--a-border)]">
                      <td className={td}>{formatDateTime(row.at)}</td>
                      <td className={td}><span className={actorChipClass(row.actorKind)}>{row.actorLabel ?? ACTOR_KIND_LABELS[row.actorKind as ActorKind] ?? row.actorKind}</span></td>
                      <td className={`${td} min-w-0 break-words`}>{row.source === "audit" ? actionLabel(row.kind) : row.summary}{row.ok === false && <span className="ml-1 text-[var(--a-neg)]">✗</span>}</td>
                      <td className={td}>
                        {row.entityType === "order" && row.entityId ? <button type="button" onClick={() => onOpenTrail(Number(row.entityId))} className="font-bold underline">{row.orderNumber ?? `#${row.entityId}`}</button> : (row.orderNumber ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
