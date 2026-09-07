import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarEvent = {
  id: string;
  date: Date;
  endDate?: Date;
  label: string;
  colorClass: string;
  onClick?: () => void;
};

const WEEKDAY_LABELS = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, delta: number) { return new Date(date.getFullYear(), date.getMonth() + delta, 1); }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function toDateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }

/**
 * Project "SUGI Desk" -- Frappe Desk's generic Calendar view (plan item 5):
 * a plain month grid bound to whatever date-ish events the caller hands it,
 * not tied to any one resource. AdminContentCalendarPanel.tsx is the first
 * (so far only) consumer, plotting posts.publishedAt + sitePromotions'
 * startsAt/endsAt -- a second consumer, if one ever shows up, reuses this
 * unchanged, same spirit as GenericListView.tsx.
 *
 * Deliberately simple: no drag-to-reschedule, no week/day view -- Frappe's
 * own Calendar doesn't need more than a month-at-a-glance planning view
 * here, and this repo has no drag-and-drop library (the Kanban boards
 * already worked around that with plain <select>s/buttons instead).
 */
export default function AdminCalendarView({ events, emptyHint }: { events: CalendarEvent[]; emptyHint?: string }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const start = event.date;
      const end = event.endDate ?? event.date;
      // Guards against a reversed or absurdly long range (bad/unexpected
      // data, not a crash) -- caps at 62 days so one malformed promotion
      // window can't spin this into rendering thousands of chips.
      const spanDays = Math.max(0, Math.min(62, Math.round((end.getTime() - start.getTime()) / 86_400_000)));
      for (let i = 0; i <= spanDays; i++) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const key = toDateKey(day);
        const bucket = map.get(key);
        if (bucket) bucket.push(event); else map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const firstWeekday = cursor.getDay(); // 0 = Sunday
    const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }, [cursor]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold capitalize">{cursor.toLocaleDateString("mn-MN", { month: "long", year: "numeric" })}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCursor(current => addMonths(current, -1))} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef]" aria-label="Өмнөх сар"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setCursor(startOfMonth(new Date()))} className="rounded-full px-3 py-1.5 text-xs font-bold text-[#707176] transition hover:bg-[#f8f5ef]">Өнөөдөр</button>
          <button type="button" onClick={() => setCursor(current => addMonths(current, 1))} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef]" aria-label="Дараах сар"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-2xl border border-black/8 bg-black/8 text-[10px] font-extrabold tracking-[.1em] text-[#8a8b8f]">
        {WEEKDAY_LABELS.map(label => <div key={label} className="bg-[#f8f5ef] px-2 py-2 text-center">{label}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-2xl border border-t-0 border-black/8 bg-black/8">
        {gridDays.map(day => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsByDay.get(toDateKey(day)) ?? [];
          return (
            <div key={day.toISOString()} className={`min-h-[92px] p-1.5 ${inMonth ? "bg-white" : "bg-[#fbfaf7]"}`}>
              <p className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-[#df1f3d] text-white" : inMonth ? "text-[#3a3b3f]" : "text-[#b7b8bc]"}`}>{day.getDate()}</p>
              <div className="grid gap-1">
                {dayEvents.slice(0, 3).map(event => (
                  <button key={event.id} type="button" onClick={event.onClick} disabled={!event.onClick} className={`truncate rounded-md px-1.5 py-1 text-left text-[10px] font-bold ${event.colorClass} ${event.onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`} title={event.label}>{event.label}</button>
                ))}
                {dayEvents.length > 3 && <p className="px-1.5 text-[10px] font-bold text-[#8a8b8f]">+{dayEvents.length - 3} бусад</p>}
              </div>
            </div>
          );
        })}
      </div>
      {events.length === 0 && emptyHint && <p className="mt-4 text-center text-xs text-[#8a8b8f]">{emptyHint}</p>}
    </div>
  );
}
