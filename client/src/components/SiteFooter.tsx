import type { LucideIcon } from "lucide-react";
import { Phone } from "lucide-react";
import { Link } from "wouter";
import { categories } from "@/components/home/categories-data";
import { locations } from "@/components/home/locations-data";

// NEWVISION.md §9: replaces Home.tsx's old single-row footer (logo + one
// "Шуурхай холбоос" column mixing an about-anchor, a category-anchor, and a
// stores-anchor together) with the real multi-column structure Isetan's
// reference footer has -- Дэлгүүр now lists all 6 real categories (not one
// generic link), Салбарууд lists all 4 real branches with real Google Maps
// links (not one generic link), each real enough to stand as its own
// column. Deliberately built as a standalone component ("ирээдүйд бусад
// хуудсанд ашиглахад бэлэн" -- NEWVISION.md's own phrasing) so it can be
// dropped onto another page later without re-deriving this structure.
//
// Content discipline, explicitly excluded per NEWVISION.md §9 (none of
// these exist for SUGI, so none are invented): the Japanese parent
// company's own logo, app-store download badges, a newsletter signup
// field, a business registration number. Нөхцөл links are exactly the 3
// real pages that exist (/privacy, /terms, /returns) -- no invented /faq
// or /shipping page.
export type FooterSocial = { label: string; href: string; Icon: LucideIcon };

/**
 * `ctaBanner` (2026-09-06 homepage consolidation): optional, off by default
 * -- SiteFooter renders on nearly every page (Shop, Checkout, Profile,
 * Login, etc. all use it, see the grep this comment replaces a guess with),
 * so the old standalone `.final-cta` "Сайн сонголт ойрхон байна." band
 * folds in here as an opt-in prop rather than becoming permanent chrome on
 * every page site-wide. Only Home.tsx passes it.
 */
export type FooterCtaBanner = { eyebrow: string; headingLine1: string; headingLine2: string; phoneLabel: string };

export default function SiteFooter({ logoUrl, socials, ctaBanner }: { logoUrl: string; socials: FooterSocial[]; ctaBanner?: FooterCtaBanner }) {
  return (
    <footer className="site-footer">
      {ctaBanner && (
        <div className="footer-cta-banner">
          <div>
            <p className="eyebrow">{ctaBanner.eyebrow}</p>
            <h2>{ctaBanner.headingLine1} <em>{ctaBanner.headingLine2}</em></h2>
          </div>
          <a className="button button-light" href="tel:94509911">{ctaBanner.phoneLabel} <Phone size={15} /></a>
        </div>
      )}
      <div className="footer-grid">
        <div>
          <img src={logoUrl} alt="SUGI ASAYAKE Mongolia" className="footer-logo" />
          <p>Япон чанарыг гэр бүл бүрт.</p>
          <div className="footer-socials" aria-label="SUGI ASAYAKE сошиал хуудаснууд">
            {socials.map(({ label, href, Icon }) => <a className="footer-social-link" href={href} target="_blank" rel="noreferrer" aria-label={`${label} хуудас нээх`} key={label}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></a>)}
          </div>
        </div>
        <div className="footer-column">
          <span>Дэлгүүр</span>
          {categories.map(category => <Link href={`/shop?category=${encodeURIComponent(category.title)}`} key={category.slug}>{category.title}</Link>)}
        </div>
        <div className="footer-column">
          <span>Салбарууд</span>
          {locations.map(location => <a href={location.mapUrl} target="_blank" rel="noreferrer" key={location.number}>{location.name}</a>)}
        </div>
        <div className="footer-column">
          <span>Нөхцөл ба бодлого</span>
          <Link href="/privacy">Хувийн нууцлал</Link>
          <Link href="/terms">Үйлчилгээний нөхцөл</Link>
          <Link href="/returns">Буцаалт, солилцоо</Link>
        </div>
        <div className="footer-column">
          <span>Холбоо барих</span>
          <a href="tel:94509911">9450-9911</a>
          <a href="mailto:asayake0307@gmail.com">asayake0307@gmail.com</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 SUGI ASAYAKE Mongolia</span>
        <span>Official SUGI Drug Store Japan subsidiary</span>
      </div>
    </footer>
  );
}
