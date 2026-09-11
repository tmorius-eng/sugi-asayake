import { CircleAlert, Lightbulb, X } from "lucide-react";
import { getAdminTip } from "@shared/admin-tips";
import { setAdminTipsEnabled, useAdminTipsEnabled } from "@/lib/adminTips";

/**
 * The "what is this screen for" panel at the top of each /admin section
 * (2026-09-12, Tom's request after seeing Bitrix24's Useful tips).
 *
 * Deliberately a plain panel in the page flow rather than a popover tour:
 * a tour has to be dismissed before the person can work, has to be
 * re-triggered to be read again, and covers the very thing it describes.
 * This sits above the section, is readable at a glance, and the reader
 * scrolls straight past it once they know the screen. Turning it off is one
 * click, and the top-bar toggle brings every panel back.
 *
 * Copy lives in shared/admin-tips.ts -- see the note there on why this one
 * category of text is code rather than a CMS slot.
 */
export default function AdminSectionTip({ section }: { section: string }) {
  const enabled = useAdminTipsEnabled();
  const tip = getAdminTip(section);
  if (!enabled || !tip) return null;

  return (
    <aside
      className="admin-tip mb-6 rounded-3xl border border-[#3970a7]/20 bg-[var(--a-info-soft)] p-5"
      aria-label="Энэ хэсгийн тухай"
    >
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 shrink-0 text-[var(--a-info)]" size={19} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-[var(--a-info)]">{tip.summary}</p>

          <ul className="mt-3 grid gap-1.5">
            {tip.actions.map(action => (
              <li key={action} className="flex items-start gap-2 text-xs leading-5 text-[var(--a-text-soft)]">
                <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--a-info)]/50" />
                <span>{action}</span>
              </li>
            ))}
          </ul>

          {tip.caution && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--a-warn-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--a-warn)]">
              <CircleAlert className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
              <span>{tip.caution}</span>
            </p>
          )}
        </div>

        {/* Hides every tip, not just this one -- someone who closes the help
            on one screen does not want to close it again on the next twenty.
            The top bar's lightbulb brings them all back. */}
        <button
          type="button"
          onClick={() => setAdminTipsEnabled(false)}
          className="shrink-0 rounded-full p-1.5 text-[var(--a-faint)] transition hover:bg-[var(--a-card)] hover:text-[var(--a-text)]"
          title="Зааврыг унтраах (дээд талын 💡 товчоор буцааж асаана)"
          aria-label="Зааврыг унтраах"
        >
          <X size={15} />
        </button>
      </div>
    </aside>
  );
}
