import { ArrowUpRight, Clock3, MapPin, Navigation, Phone } from "lucide-react";
import SectionEyebrow from "./SectionEyebrow";
import SectionHeading from "./SectionHeading";
import { locations, BRANCH_HOURS, BRANCH_PHONE } from "./locations-data";

// Rough, deliberately non-geographic placement for the 3 pins on the
// abstract map illustration -- this is an editorial graphic, not a real
// map, so there's no real coordinate to plot against (see the "no Google
// Maps key configured" note in index.css above .locator-section).
const PIN_POSITIONS: Record<string, { x: number; y: number }> = {
  "01": { x: 110, y: 90 },
  "02": { x: 230, y: 150 },
  "03": { x: 300, y: 70 },
};

/**
 * Tier 6 of the home redesign: a 3-zone composition (editorial copy /
 * static map illustration / numbered branch list) replacing the old
 * 2-column .locations-section. All 3 branch records are real (confirmed
 * with Tom 2026-08-25) and unchanged; the Google Maps links are the same
 * real search URLs as before -- only the layout and the map's visual
 * treatment change. See index.css's .locator-section comment for why this
 * doesn't wire the orphaned Map.tsx (no API key exists in this repo).
 */
export default function StoreLocatorSection() {
  return (
    <section className="locator-section page-section" id="stores" data-reveal>
      <div className="locator-grid">
        <div className="locator-copy">
          <SectionEyebrow number="04" label="FIND YOUR ASAYAKE" />
          <p className="eyebrow"><Navigation size={14} /> {locations.length} БАЙРШИЛ</p>
          <SectionHeading>Танд ойрхон<br /><em>салбар дээр.</em></SectionHeading>
          <p className="locator-lede">Улаанбаатарын өөр өөр цэгүүдэд япон чанарыг танд ойртуулж байна.</p>
          <a className="button button-primary" href="tel:94509911">9450-9911 руу залгах <Phone size={15} /></a>
        </div>

        <div className="locator-map" role="img" aria-label="SUGI ASAYAKE-ийн 3 салбарын байршлыг харуулсан зурган дүрслэл">
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <rect width="400" height="300" fill="none" />
            <g stroke="#c9d6cf" strokeWidth="1.5" opacity=".7">
              <path d="M0 60 H400" /><path d="M0 140 H400" /><path d="M0 220 H400" />
              <path d="M70 0 V300" /><path d="M180 0 V300" /><path d="M290 0 V300" />
            </g>
            <g fill="#dfe9e2">
              <rect x="20" y="20" width="34" height="26" rx="3" />
              <rect x="90" y="170" width="46" height="30" rx="3" />
              <rect x="200" y="20" width="40" height="28" rx="3" />
              <rect x="310" y="160" width="42" height="34" rx="3" />
              <rect x="150" y="230" width="60" height="28" rx="3" />
            </g>
            {locations.map((location) => {
              const pos = PIN_POSITIONS[location.number] ?? { x: 200, y: 150 };
              return (
                <a key={location.number} href={location.mapUrl} target="_blank" rel="noreferrer" className="locator-pin" data-branch={location.number} aria-label={`${location.name} — Google Maps дээр нээх`}>
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
                aria-label={`${location.name} Google Maps дээр нээх`}
                key={location.number}
              >
                <span>{location.number}</span>
                <div>
                  <strong>{location.name}</strong>
                  <small>{location.detail}</small>
                  <small className="location-meta">
                    <Clock3 size={11} /> {BRANCH_HOURS}
                    <span className="location-meta-divider" aria-hidden="true">•</span>
                    <Phone size={11} /> {BRANCH_PHONE}
                  </small>
                </div>
                <ArrowUpRight size={17} />
              </a>
            ))}
            <p className="location-note"><MapPin size={14} /> Салбарын байршлыг Google Maps дээр нээх</p>
          </div>
        </div>
      </div>
    </section>
  );
}
