import { Phone } from "lucide-react";
import { Facebook, Instagram, Youtube } from "@/components/icons/BrandIcons";
import { Link } from "wouter";
import InstallAppButton from "@/components/InstallAppButton";
import NotificationOptIn from "@/components/NotificationOptIn";
import { trpc } from "@/lib/trpc";
import { useCategories } from "@/hooks/useCategories";
import { useShopContact } from "@/hooks/useShopContact";
import { useSiteText } from "@/hooks/useSiteText";
import { useT } from "@/hooks/useLocale";
import { useBrandMedia } from "@/hooks/useBrandMedia";

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
// 2026-09-12: the two social links and the contact phone/email used to
// arrive as props from a hardcoded module constant (site-footer-data.ts);
// they are now admin-editable store settings, so the footer reads them
// itself and no page has to pass them in. 2026-09-17: the logo followed the
// same path -- it is the `brand-logo` media slot now (useBrandMedia), and
// that module is gone.

/**
 * `ctaBanner` (2026-09-06 homepage consolidation): optional, off by default
 * -- SiteFooter renders on nearly every page (Shop, Checkout, Profile,
 * Login, etc. all use it, see the grep this comment replaces a guess with),
 * so the old standalone `.final-cta` "Сайн сонголт ойрхон байна." band
 * folds in here as an opt-in prop rather than becoming permanent chrome on
 * every page site-wide. Only Home.tsx passes it.
 */
export type FooterCtaBanner = { eyebrow: string; headingLine1: string; headingLine2: string; phoneLabel: string };

export default function SiteFooter({ ctaBanner }: { ctaBanner?: FooterCtaBanner }) {
  const textFor = useSiteText();
  const t = useT();
  const contact = useShopContact();
  const categories = useCategories();
  const { logo: brandLogo } = useBrandMedia();
  const socials = [
    contact.facebookUrl ? { label: "Facebook", href: contact.facebookUrl, Icon: Facebook } : null,
    contact.instagramUrl ? { label: "Instagram", href: contact.instagramUrl, Icon: Instagram } : null,
    contact.youtubeUrl ? { label: "YouTube", href: contact.youtubeUrl, Icon: Youtube } : null,
  ].filter((social): social is { label: string; href: string; Icon: typeof Facebook } => social !== null);
  // "Controls everything" admin overhaul (2026-09-08, Phase J): replaces
  // locations-data.ts's hardcoded array -- react-query dedupes this against
  // the identical call StoreLocatorSection/Checkout already make on pages
  // that render both, so this is never a second real network request there.
  const branchesQuery = trpc.content.branches.useQuery();
  const branches = branchesQuery.data ?? [];
  return (
    <footer className="site-footer">
      {ctaBanner && (
        <div className="footer-cta-banner">
          <div>
            <p className="eyebrow">{ctaBanner.eyebrow}</p>
            <h2>{ctaBanner.headingLine1} <em>{ctaBanner.headingLine2}</em></h2>
          </div>
          <a className="button button-light" href={`tel:${contact.phoneHref}`}>{ctaBanner.phoneLabel} <Phone size={15} /></a>
        </div>
      )}
      <div className="footer-grid">
        <div>
          <img src={brandLogo ?? undefined} alt="SUGI ASAYAKE Mongolia" className="footer-logo" />
          <p>{textFor("footer-text-tagline", "Япон чанарыг гэр бүл бүрт.")}</p>
          <div className="footer-socials" aria-label="SUGI ASAYAKE сошиал хуудаснууд">
            {socials.map(({ label, href, Icon }) => <a className="footer-social-link" href={href} target="_blank" rel="noreferrer" aria-label={`${label} хуудас нээх`} key={label}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></a>)}
          </div>
          {/* 2026-09-16: суулгах боломжтой хөтөч дээр л өөрөө гарч ирнэ
              (суулгасны дараа болон Firefox дээр юу ч зурагдахгүй). Энэ нь
              дээрх §9-ийн "app-store badge оруулахгүй" дүрмийн эсрэг биш —
              дэлгүүрийн лого биш, хөтчийн өөрийнх нь суулгах үйлдэл. */}
          <InstallAppButton />
          <NotificationOptIn />
        </div>
        <div className="footer-column">
          <span>{textFor("footer-text-column-shop", "Дэлгүүр")}</span>
          {categories.map(category => <Link href={`/shop?category=${encodeURIComponent(category.name)}`} key={category.slug}>{category.name}</Link>)}
        </div>
        <div className="footer-column">
          <span>{textFor("footer-text-column-branches", "Салбарууд")}</span>
          {/* 2026-09-27: mapUrl байхгүй үед href="#" + target="_blank" хоосон
              таб нээдэг байв -- StoreLocatorSection-ий адил span болгоно.
              `.footer-plain` (index.css): `.footer-column > span` анхдагчаар
              баганын гарчгийн загвартай тул энэ span-ийг холбоосуудтай ЯГ
              адил харагдуулна. */}
          {branches.map(branch => branch.mapUrl
            ? <a href={branch.mapUrl} target="_blank" rel="noreferrer" key={branch.id}>{branch.name}</a>
            : <span className="footer-plain" key={branch.id}>{branch.name}</span>)}
        </div>
        <div className="footer-column">
          <span>{textFor("footer-text-column-legal", "Нөхцөл ба бодлого")}</span>
          <Link href="/about">{t("Бидний тухай")}</Link>
          <Link href="/careers">{t("Ажлын байр")}</Link>
          <Link href="/privacy">{t("Хувийн нууцлал")}</Link>
          <Link href="/terms">{t("Үйлчилгээний нөхцөл")}</Link>
          <Link href="/returns">{t("Буцаалт, солилцоо")}</Link>
          <Link href="/track-order">{t("Захиалгаа хянах")}</Link>
          <Link href="/help">{t("Тусламж, холбоо барих")}</Link>
          {/* 2026-09-06: resetConsent() is Silktide Consent Manager's own
              documented public method (client/public/vendor/silktide-consent-
              manager.js) -- re-shows the initial Accept/Reject/Preferences
              prompt (which itself has a "Тохиргоо" button into the granular
              modal). Deliberately NOT the undocumented #stcm-icon click-
              simulation trick some blog posts use to jump straight to
              preferences -- that's unsupported and could silently break on a
              future Silktide version. A <button>, not a <Link>: this
              triggers JS, not navigation. Optional chaining throughout so a
              blocked/failed script load never throws here. */}
          <button type="button" onClick={() => window.silktideConsentManager?.resetConsent?.()} className="footer-column-button">{t("Күкийн тохиргоо")}</button>
        </div>
        <div className="footer-column">
          <span>{textFor("footer-text-column-contact", "Холбоо барих")}</span>
          <a href={`tel:${contact.phoneHref}`}>{contact.phone}</a>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{textFor("footer-text-copyright", "© 2026 SUGI ASAYAKE Mongolia")}</span>
        <span>{textFor("footer-text-subsidiary", "Official SUGI Drug Store Japan subsidiary")}</span>
      </div>
    </footer>
  );
}
