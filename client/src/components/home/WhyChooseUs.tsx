import { MapPin, ShieldCheck, ShoppingBag } from "lucide-react";
import { useSiteText } from "@/hooks/useSiteText";
import SectionHeading from "./SectionHeading";

/**
 * Tier 4 of the home redesign: a dark editorial "Why choose us" section
 * with 3 horizontal ivory cards, replacing the old light 3-column
 * .trust-grid that used to sit inside .story-section. This section did not
 * exist before -- see docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md.
 *
 * Copy is carried over unchanged from the old .trust-grid cells (real,
 * business-approved claims, not new marketing language). `branchCount`
 * comes from the shared `locations` data (same source TrustStrip and the
 * store locator use) so the "3 байршилд" claim can't drift from the actual
 * branch list.
 */
export default function WhyChooseUs({ branchCount }: { branchCount: number }) {
  const textFor = useSiteText();
  const [headingLine1, headingLine2] = textFor("home-text-wcu-heading", "Япон чанарыг\nтанд ойртуулна.").split("\n");
  return (
    <section className="wcu-section" data-reveal aria-label="Яагаад биднийг сонгох вэ">
      <p className="eyebrow"><span /> {textFor("home-text-wcu-eyebrow-label", "ЯАГААД БИДНИЙГ СОНГОХ ВЭ")}</p>
      <div className="wcu-heading-row">
        <SectionHeading tone="onDark">{headingLine1}<br /><em>{headingLine2}</em></SectionHeading>
        <p>{textFor("home-text-wcu-description", "SUGI ASAYAKE-ийг сонгох гурван шалтгаан — өргөн сонголт, баталгаат импорт, ойрхон салбарууд.")}</p>
      </div>
      <div className="wcu-cards">
        <div className="wcu-card">
          <span className="wcu-card-icon"><ShoppingBag size={20} /></span>
          <strong>{textFor("home-text-wcu-card1-title", "Сонголт")}</strong>
          <span>{textFor("home-text-wcu-card1-desc", "Арчилгаа, гоо сайхан, эрүүл ахуйн 800+ төрөл")}</span>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><ShieldCheck size={20} /></span>
          <strong>{textFor("home-text-wcu-card2-title", "Баталгаа")}</strong>
          <span>{textFor("home-text-wcu-card2-desc", "Японоос баталгаат, албан ёсны бүтээгдэхүүн")}</span>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><MapPin size={20} /></span>
          <strong>{textFor("home-text-wcu-card3-title", "Ойрхон")}</strong>
          {/* branchCount is real, derived data (see the file-level comment
              above) -- stays code, sandwiched between two editable text
              slots instead of being embedded in one free-text sentence. */}
          <span>{textFor("home-text-wcu-card3-prefix", "Улаанбаатарын")} {branchCount} {textFor("home-text-wcu-card3-suffix", "байршилд таныг хүлээнэ")}</span>
        </div>
      </div>
    </section>
  );
}
