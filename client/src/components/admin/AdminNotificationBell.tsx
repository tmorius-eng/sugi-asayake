import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, LoaderCircle, Smartphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AdminSection } from "../AdminWorkspace";

/**
 * The admin top bar's bell (2026-09-11, Tom: "ene deer medeelel irdeg
 * bolgooroi"). Lists the same notifications the user's group gets pushed to
 * their phone -- new orders, payments, cancellations, refunds, low stock --
 * straight from notification_outbox, so the in-app list and the phone can
 * never disagree about what happened.
 *
 * Deliberately NOT the shared Popover primitive: that portals to <body>,
 * outside .admin-shell, where none of the admin colour tokens exist (the
 * panel would render in storefront colours, and wrong in dark mode). A small
 * self-contained disclosure inside the top bar keeps every token.
 *
 * "Unread" is stored on the account (users.lastSeenNotificationId), so the
 * shop PC and the owner's phone agree on what has been seen.
 */

const POLL_MS = 30_000;

function relativeTime(value: string | Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "дөнгөж сая";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин өмнө`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} өдрийн өмнө`;
  return new Date(value).toLocaleDateString("mn-MN");
}

function sectionFromClickPath(clickPath: string | null, allowed: ReadonlySet<AdminSection>): AdminSection | null {
  if (!clickPath) return null;
  const query = clickPath.split("?")[1] ?? "";
  const section = new URLSearchParams(query).get("adminSection") as AdminSection | null;
  return section && allowed.has(section) ? section : null;
}

export default function AdminNotificationBell({ preview, attentionCount, attentionLabel, visibleSections, onNavigate }: {
  preview: boolean;
  /** Low-stock + failed-payment count from the dashboard summary. */
  attentionCount: number;
  attentionLabel: string;
  visibleSections: ReadonlySet<AdminSection>;
  onNavigate: (section: AdminSection) => void;
}) {
  const utils = trpc.useUtils();
  const feedQuery = trpc.notifications.feed.useQuery(undefined, { enabled: !preview, refetchInterval: POLL_MS, refetchIntervalInBackground: false });
  const markSeen = trpc.notifications.markSeen.useMutation();
  const [open, setOpen] = useState(false);
  // What was unread at the moment the panel opened -- kept highlighted for
  // this viewing even though opening marks everything as seen.
  const [highlightAbove, setHighlightAbove] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const newestSeenRef = useRef<number | null>(null);

  const items = feedQuery.data?.items ?? [];
  const unreadCount = feedQuery.data?.unreadCount ?? 0;
  const lastSeenId = feedQuery.data?.lastSeenId ?? null;

  // A toast for anything that arrives while the admin is open, so a new
  // order is noticed without watching the bell.
  useEffect(() => {
    if (!items.length) return;
    const newest = items[0].id;
    if (newestSeenRef.current !== null && newest > newestSeenRef.current) {
      const fresh = items.filter(item => item.id > newestSeenRef.current!);
      if (fresh.length === 1) toast(fresh[0].title, { description: fresh[0].message.split("\n")[0], icon: <BellRing size={16} /> });
      else toast(`${fresh.length} шинэ мэдэгдэл`, { icon: <BellRing size={16} /> });
    }
    newestSeenRef.current = newest;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const markAllSeen = async () => {
    const newest = items[0]?.id;
    if (!newest || preview) return;
    try {
      await markSeen.mutateAsync({ upToId: newest });
      await utils.notifications.feed.invalidate();
    } catch {
      // Not worth interrupting anyone over; the next poll shows the truth.
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setHighlightAbove(lastSeenId ?? 0);
      if (unreadCount > 0) void markAllSeen();
    }
  };

  const go = (section: AdminSection | null) => {
    if (!section) return;
    setOpen(false);
    onNavigate(section);
  };

  const badge = preview ? 0 : unreadCount;
  const label = badge > 0 ? `${badge} шинэ мэдэгдэл` : attentionCount > 0 ? attentionLabel : "Шинэ мэдэгдэл алга";

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={toggle} className="admin-icon-btn relative" title={label} aria-label={label} aria-expanded={open} aria-haspopup="dialog">
        <Bell size={17} />
        {badge > 0 ? (
          <span className="admin-pop absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold leading-[18px] text-white" style={{ background: "var(--a-neg)" }} aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
        ) : attentionCount > 0 && (
          <span className="absolute right-2 top-2 size-2">
            <span className="admin-ping" aria-hidden="true" />
            <span className="absolute inset-0 rounded-full" style={{ background: "var(--a-neg)" }} aria-hidden="true" />
          </span>
        )}
      </button>

      {open && (
        // Phones: pinned to the viewport with a 16px gutter -- anchored to the
        // bell it hung 50px off the left edge at 390px, because the avatar
        // button sits to the bell's right. From `sm` up it hangs off the bell.
        <div role="dialog" aria-label="Мэдэгдлүүд" className="fixed inset-x-4 top-16 z-40 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] shadow-[0_18px_50px_rgba(15,20,25,.18)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--a-border)] px-4 py-3">
            <p className="text-sm font-bold text-[var(--a-text)]">Мэдэгдэл</p>
            <button type="button" onClick={markAllSeen} disabled={!items.length || markSeen.isPending} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[var(--a-text)] disabled:opacity-40">
              <CheckCheck size={13} />Бүгдийг уншсан
            </button>
          </div>

          {attentionCount > 0 && (
            <button type="button" onClick={() => go("dashboard")} className="flex w-full items-start gap-2.5 border-b border-[var(--a-border)] bg-[var(--a-warn-soft)] px-4 py-2.5 text-left text-[12px] font-semibold text-[var(--a-warn)]">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />{attentionLabel} — хянах самбарт харах
            </button>
          )}

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {feedQuery.isLoading && <p className="flex items-center gap-2 px-4 py-6 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}
            {!feedQuery.isLoading && !items.length && <p className="px-4 py-8 text-center text-xs leading-5 text-[var(--a-muted)]">Одоогоор мэдэгдэл алга.<br />Шинэ захиалга, төлбөр, нөөцийн мэдэгдэл энд гарна.</p>}
            {items.map(item => {
              const target = sectionFromClickPath(item.clickPath, visibleSections);
              const isNew = highlightAbove !== null && item.id > highlightAbove;
              return (
                <button key={item.id} type="button" onClick={() => go(target)} disabled={!target} className={`flex w-full gap-3 border-b border-[var(--a-border)] px-4 py-3 text-left last:border-b-0 transition enabled:hover:bg-[var(--a-soft)] ${isNew ? "bg-[var(--a-info-soft)]" : ""}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isNew ? "" : "opacity-0"}`} style={{ background: item.priority >= 5 ? "var(--a-neg)" : "var(--a-info)" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold leading-5 text-[var(--a-text)]">{item.title}</span>
                    <span className="mt-0.5 block whitespace-pre-line text-[12px] leading-[18px] text-[var(--a-text-soft)]">{item.message}</span>
                    <span className="mt-1 block text-[11px] text-[var(--a-muted)]">{relativeTime(item.createdAt)}{isNew && <span className="sr-only"> · шинэ</span>}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {visibleSections.has("notifications") && (
            <button type="button" onClick={() => go("notifications")} className="flex w-full items-center justify-center gap-2 border-t border-[var(--a-border)] px-4 py-3 text-[12px] font-bold text-[var(--a-info)] transition hover:bg-[var(--a-soft)]">
              <Smartphone size={14} />Утсан дээрээ мэдэгдэл авах
            </button>
          )}
        </div>
      )}
    </div>
  );
}
