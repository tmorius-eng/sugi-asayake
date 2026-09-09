import { useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeRange, rangeOptions, toDayInput, type AdminDateRange } from "@/lib/analyticsRange";

/**
 * The reference's date control, with the piece Tom actually asked for added:
 * "7 honog 10 honog 30 honog 90 honog gej manaid baidag bol ene zurgan deer
 * hussen uduruu songoj boldog" -- presets were all this admin had, so this
 * adds a real from/to day picker beneath them.
 *
 * Two native <input type="date"> fields rather than the project's ui/calendar
 * primitive: they open the OS date picker (so a phone gets the phone's wheel),
 * they're keyboard- and screen-reader-complete for free, and they hand back
 * exactly the yyyy-mm-dd string analyticsRange.ts parses. The custom range is
 * only committed when both ends are set, so a half-typed date never fires a
 * query against a nonsense window.
 */
export default function AdminDateRangePicker({ value, onChange }: {
  value: AdminDateRange;
  onChange: (range: AdminDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = toDayInput(new Date());
  const [draftFrom, setDraftFrom] = useState(value.customFrom ?? "");
  const [draftTo, setDraftTo] = useState(value.customTo ?? today);

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    onChange({ key: "custom", customFrom: draftFrom, customTo: draftTo });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3.5 text-[13px] font-semibold text-[var(--a-text)] transition hover:border-[var(--a-border-strong)] hover:bg-[var(--a-soft)] active:scale-[.98]"
        >
          <CalendarDays size={15} className="text-[var(--a-muted)]" aria-hidden="true" />
          {describeRange(value)}
          <ChevronDown size={15} className={`text-[var(--a-muted)] transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="admin-pop w-72 rounded-2xl border-[var(--a-border)] bg-[var(--a-card)] p-2 text-[var(--a-text)] shadow-[var(--a-shadow-pop)]">
        <div className="grid">
          {rangeOptions.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => { onChange({ ...value, key: option.key }); setOpen(false); }}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition hover:bg-[var(--a-soft)]"
            >
              {option.label}
              {value.key === option.key && <Check size={15} className="text-[var(--a-pos)]" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="mt-2 border-t border-[var(--a-border)] pt-3">
          <p className="px-3 text-[11px] font-bold uppercase tracking-[.12em] text-[var(--a-faint)]">Хүссэн огноогоо сонгох</p>
          <div className="mt-2 grid grid-cols-2 gap-2 px-1">
            <label className="grid gap-1 text-[11px] font-semibold text-[var(--a-muted)]">
              Эхлэх
              <input
                type="date"
                value={draftFrom}
                max={draftTo || today}
                onChange={event => setDraftFrom(event.target.value)}
                className="h-9 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-[12px] font-medium text-[var(--a-text)] outline-none transition focus:border-[var(--a-info)]"
              />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-[var(--a-muted)]">
              Дуусах
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={event => setDraftTo(event.target.value)}
                className="h-9 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-[12px] font-medium text-[var(--a-text)] outline-none transition focus:border-[var(--a-info)]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!draftFrom || !draftTo}
            className="mt-3 h-9 w-full rounded-xl bg-[var(--a-invert-bg)] text-[12px] font-bold text-[var(--a-invert-text)] transition hover:bg-[var(--a-invert-bg-hover)] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Хэрэглэх
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
