import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@shared/i18n";
import { setLocale, useLocale, useT } from "@/hooks/useLocale";

/**
 * The header's language switch (2026-09-12, Tom asked for a translate
 * button beside the theme one, with English and Japanese in it).
 *
 * It changes the shop's own words -- navigation, buttons, headings, the
 * footer -- and sets <html lang>. Catalogue data (product names,
 * descriptions, brands) stays in the language it was entered in; see
 * shared/i18n.ts.
 */
export default function LocaleSwitch() {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="locale-switch" ref={containerRef}>
      <button
        type="button"
        className="locale-switch-trigger"
        onClick={() => setOpen(value => !value)}
        aria-label={t("Хэл")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("Хэл")}
      >
        <Globe size={19} aria-hidden="true" />
      </button>
      {open && (
        <div className="locale-switch-menu" role="menu">
          {LOCALES.map(option => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              className={option === locale ? "is-current" : ""}
              onClick={() => { setLocale(option); setOpen(false); }}
            >
              {LOCALE_LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
