import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";
import AdminCalendarView, { type CalendarEvent } from "./AdminCalendarView";
import type { AdminSection } from "../AdminWorkspace";

/**
 * Project "SUGI Desk" Phase 6 -- first real consumer of AdminCalendarView.tsx.
 * Plots two already-real, already-fetched-elsewhere data sources onto one
 * month grid: posts.publishedAt (including future-dated/scheduled posts --
 * see the WordPress-parity `publishedAt <= NOW()` scheduling gate in
 * getPublishedPosts/server/db.ts) and sitePromotions' startsAt/endsAt
 * windows. No invented fields, no fabricated events -- a month with nothing
 * scheduled just renders empty, same discipline as CustomerVoices/
 * RecommendedForYou's honest-empty-state precedent elsewhere in this app.
 */
export default function AdminContentCalendarPanel({ onNavigate }: { onNavigate: (section: AdminSection) => void }) {
  const postsQuery = trpc.admin.posts.useQuery();
  const promotionsQuery = trpc.admin.promotions.useQuery();

  const isLoading = postsQuery.isLoading || promotionsQuery.isLoading;
  const error = postsQuery.error ?? promotionsQuery.error;

  const events: CalendarEvent[] = [];
  for (const post of postsQuery.data ?? []) {
    if (!post.publishedAt || post.deletedAt) continue;
    const isFuture = post.publishedAt.getTime() > Date.now();
    events.push({
      id: `post-${post.id}`,
      date: post.publishedAt,
      label: post.title,
      colorClass: post.isPublished && !isFuture ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
      onClick: () => onNavigate("posts"),
    });
  }
  for (const promotion of promotionsQuery.data ?? []) {
    if (!promotion.startsAt) continue;
    events.push({
      id: `promotion-${promotion.id}`,
      date: promotion.startsAt,
      endDate: promotion.endsAt ?? undefined,
      label: promotion.headline,
      colorClass: promotion.isActive ? "bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "bg-[var(--a-soft)] text-[var(--a-faint)]",
      onClick: () => onNavigate("promotions"),
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-bold text-[var(--a-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#2c7650]" />Нийтлэгдсэн пост</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#8a6412]" />Товлогдсон пост</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#a51630]" />Идэвхтэй урамшуулал</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#8a8b8f]" />Идэвхгүй урамшуулал</span>
      </div>
      {isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><CalendarDays className="animate-pulse" size={15} />Уншиж байна…</p>}
      {error && <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{error.message}</p>}
      {!isLoading && !error && <AdminCalendarView events={events} emptyHint="Энэ сард товлогдсон пост, урамшуулал алга." />}
    </div>
  );
}
