import { History, LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { actionLabel } from "@/lib/adminAuditLabels";

const formatDateTime = (date: Date | string) => new Date(date).toLocaleString("mn-MN", { dateStyle: "medium", timeStyle: "short" });

/**
 * Project "SUGI Desk" Phase 4 (2026-09-07) — the native answer to Frappe's
 * per-document Timeline: a small "History" card any admin edit screen can
 * drop in, reading the exact same admin_audit_logs table the global Security
 * Center viewer already reads (server/routers.ts's `admin.entityHistory`),
 * just scoped to one record via entityType/entityId.
 *
 * Admin-only, matching the global audit log's own tier (this reveals which
 * staff member did what -- the same sensitivity, not a lesser one). Staff
 * sees a locked placeholder instead of the panel silently 403ing.
 *
 * Does NOT show field-level before/after diffs -- the underlying
 * logAdminAction() calls only ever captured a partial metadata snapshot
 * (e.g. { slug, isPublished }), not a full before/after record, so a diff
 * view would be fabricating precision this data doesn't have. This shows
 * exactly what's real: who did what, and when.
 */
export default function AdminHistoryPanel({ entityType, entityId, canSeeAuditTrail }: { entityType: string; entityId: number; canSeeAuditTrail: boolean }) {
  const query = trpc.admin.entityHistory.useQuery({ entityType, entityId }, { enabled: canSeeAuditTrail });
  const entries = query.data ?? [];

  return (
    <div className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.14em] text-[var(--a-text-soft)]"><History size={12} />ТҮҮХ (ACTIVITY)</p>
      {!canSeeAuditTrail ? (
        <p className="mt-3 text-xs text-[var(--a-faint)]">🔒 Зөвхөн админд харагдана</p>
      ) : query.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--a-faint)]">Түүх алга.</p>
      ) : (
        <ol className="mt-3 grid gap-3">
          {entries.map(entry => (
            <li key={entry.id} className="relative border-l-2 border-[var(--a-border)] pl-3">
              <span className="absolute -left-[5px] top-1 size-2 rounded-full bg-[#df1f3d]" />
              <p className="text-xs font-bold">{actionLabel(entry.action)}</p>
              <p className="mt-0.5 text-[11px] text-[var(--a-faint)]">{entry.actorName ?? entry.actorEmail ?? `#${entry.actorUserId}`} · {formatDateTime(entry.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
