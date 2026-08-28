import { MapPin, ShieldCheck, ShoppingBag } from "lucide-react";
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
  return (
    <section className="wcu-section" data-reveal aria-label="Яагаад биднийг сонгох вэ">
      <p className="eyebrow"><span /> ЯАГААД БИДНИЙГ СОНГОХ ВЭ</p>
      <div className="wcu-heading-row">
        <SectionHeading tone="onDark">Япон чанарыг<br /><em>танд ойртуулна.</em></SectionHeading>
        <p>SUGI ASAYAKE-ийг сонгох гурван шалтгаан — өргөн сонголт, баталгаат импорт, ойрхон салбарууд.</p>
      </div>
      <div className="wcu-cards">
        <div className="wcu-card">
          <span className="wcu-card-icon"><ShoppingBag size={20} /></span>
          <strong>Сонголт</strong>
          <span>Арчилгаа, гоо сайхан, эрүүл ахуйн 800+ төрөл</span>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><ShieldCheck size={20} /></span>
          <strong>Баталгаа</strong>
          <span>Японоос баталгаат, албан ёсны бүтээгдэхүүн</span>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><MapPin size={20} /></span>
          <strong>Ойрхон</strong>
          <span>Улаанбаатарын {branchCount} байршилд таныг хүлээнэ</span>
        </div>
      </div>
    </section>
  );
}
