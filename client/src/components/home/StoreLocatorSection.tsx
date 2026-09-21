import { ArrowUpRight, Clock3, MapPin, Navigation, Phone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";
import { useT } from "@/hooks/useLocale";
import SectionHeading from "./SectionHeading";
import { useShopContact } from "@/hooks/useShopContact";

// Rough, deliberately non-geographic placement for each pin on the
// abstract map illustration -- this is an editorial graphic, not a real
// map, so there's no real coordinate to plot against (see the "no Google
// Maps key configured" note in index.css above .locator-section).
const PIN_POSITIONS: Record<string, { x: number; y: number }> = {
  "01": { x: 110, y: 90 },
  "02": { x: 230, y: 150 },
  "03": { x: 300, y: 70 },
  "04": { x: 150, y: 220 },
};

/**
 * Tier 6 of the home redesign: a 3-zone composition (editorial copy /
 * static map illustration / numbered branch list) replacing the old
 * 2-column .locations-section. Branch records are real (confirmed with
 * Tom 2026-08-25; 4th branch added 2026-09-01) -- each has its own
 * Google Maps search URL and phone number now (locations-data.ts's
 * `phone` field), since branch 04's line differs from the first 3
 * branches' shared one. Only the layout and the map's visual treatment
 * changed here, not the underlying data. See index.css's .locator-section
 * comment for why this doesn't wire the orphaned Map.tsx (no API key
 * exists in this repo).
 *
 * "Controls everything" admin overhaul (2026-09-08, Phase J): branch
 * records now come from the live `content.branches` query (backed by a
 * real `branches` table) instead of locations-data.ts's hardcoded array --
 * an admin can add/edit/deactivate a branch and it appears here without a
 * deploy. `number` (the "01".."04" display badge / pin key) is derived
 * from each branch's position in the already-sortOrder-sorted list, since
 * the table itself has no separate "display number" column.
 */
export default function StoreLocatorSection() {
  const textFor = useSiteText();
  const t = useT();
  const contact = useShopContact();
  const branchesQuery = trpc.content.branches.useQuery();
  const locations = (branchesQuery.data ?? []).map((branch, index) => ({
    number: String(index + 1).padStart(2, "0"),
    name: branch.name,
    detail: branch.address,
    phone: branch.phone ?? "",
    mapUrl: branch.mapUrl ?? "#",
  }));
  const [headingLine1, headingLine2] = textFor("home-text-locator-heading", "Танд ойрхон\nсалбар дээр").split("\n");
  if (!locations.length) return null;
  return (
    <section className="locator-section page-section" id="stores" data-reveal>
      <div className="locator-grid">
        <div className="locator-copy">
          {/* 2026-09-11 audit: the "04 / FIND YOUR ASAYAKE" marker went; the
              live branch count directly below it is kept, because that one
              reports a real number from the database. */}
          {/* locations.length is real data (see the file-level comment
              above) -- stays code, followed by an editable text slot. */}
          <p className="eyebrow"><Navigation size={14} /> {locations.length} {textFor("home-text-locator-count-suffix", "БАЙРШИЛ")}</p>
          <SectionHeading>{headingLine1}<br /><em>{headingLine2}</em></SectionHeading>
          <p className="locator-lede">{textFor("home-text-locator-description", "Улаанбаатарын өөр өөр цэгүүдэд япон чанарыг танд ойртуулж байна.")}</p>
          <a className="button button-primary" href={`tel:${contact.phoneHref}`}>{t("руу залгах")} {contact.phone} <Phone size={15} /></a>
        </div>

        {/* 2026-09-06 (real a11y-audit finding, axe-core aria-hidden-focus +
            nested-interactive): this used to put role="img"/aria-label on the
            wrapper and aria-hidden="true" on the <svg> itself -- but the svg
            contains REAL, focusable <a href={mapUrl}> pin links, not just a
            static picture. That combination hid genuinely interactive
            content from assistive tech while leaving it keyboard-focusable
            (a confusing, broken state), and role="img" contradicts having
            real interactive descendants at all. Fix: no role/aria-hidden on
            the container or <svg> -- only the truly decorative background
            shapes (grid lines, building blocks) are aria-hidden; the real
            pins keep their own already-correct aria-label each. */}
        <div className="locator-map">
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="group" aria-label={`SUGI ASAYAKE-ийн ${locations.length} салбарын байршлыг харуулсан зурган дүрслэл`}>
            <rect width="400" height="300" fill="none" aria-hidden="true" />
            <g stroke="#c9d6cf" strokeWidth="1.5" opacity=".7" aria-hidden="true">
              <path d="M0 60 H400" /><path d="M0 140 H400" /><path d="M0 220 H400" />
              <path d="M70 0 V300" /><path d="M180 0 V300" /><path d="M290 0 V300" />
            </g>
            <g fill="#dfe9e2" aria-hidden="true">
              <rect x="20" y="20" width="34" height="26" rx="3" />
              <rect x="90" y="170" width="46" height="30" rx="3" />
              <rect x="200" y="20" width="40" height="28" rx="3" />
              <rect x="310" y="160" width="42" height="34" rx="3" />
              <rect x="150" y="230" width="60" height="28" rx="3" />
            </g>
            {locations.map((location) => {
              const pos = PIN_POSITIONS[location.number] ?? { x: 200, y: 150 };
              return (
                <a key={location.number} href={location.mapUrl} target="_blank" rel="noreferrer" className="locator-pin" data-branch={location.number} aria-label={`${location.number} — ${location.name}, Google Maps дээр нээх`}>
                  <circle className="locator-pin-dot" cx={pos.x} cy={pos.y} r="8" />
                  <text x={pos.x} y={pos.y + 3} textAnchor="middle">{location.number}</text>
                </a>
              );
            })}
          </svg>
        </div>

        <div className="locator-list">
          <div className="location-list">
            {locations.map((location) => (
              <a
                className="location-row"
                data-branch={location.number}
                href={location.mapUrl}
                target="_blank"
                rel="noreferrer"
                key={location.number}
              >
                <span>{location.number}</span>
                <div>
                  <strong>{location.name}</strong>
                  {/* Холбоосын нэр = харагдах агуулга + энэ далд төгсгөл (aria-label-ыг
                      хассан: харагдах текст нэрэнд нь агуулагдах ёстой, WCAG 2.5.3). */}
                  <span className="sr-only"> — Google Maps дээр нээх</span>
                  <small>{location.detail}</small>
                  <small className="location-meta">
                    <Clock3 size={11} /> {contact.hours}
                    <span className="location-meta-divider" aria-hidden="true">•</span>
                    <Phone size={11} /> {location.phone}
                  </small>
                </div>
                <ArrowUpRight size={17} />
              </a>
            ))}
            <p className="location-note"><MapPin size={14} /> {textFor("home-text-locator-note", "Салбарын байршлыг Google Maps дээр нээх")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
