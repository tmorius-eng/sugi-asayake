/**
 * SUGI ASAYAKE professional direction: quiet Japanese retail authority with a
 * warm paper base, disciplined vermilion accents, editorial spacing, and clear
 * trust / shop / visit actions. This page intentionally avoids heavy overlays,
 * novelty effects, and oversized template-like compositions.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleCheck,
  Facebook,
  Flower2,
  Gift,
  Instagram,
  Menu,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import HeaderSearch from "@/components/HeaderSearch";
import SeasonalCampaignCarousel from "@/components/SeasonalCampaignCarousel";
import HeroSection from "@/components/home/HeroSection";
import TrustStrip from "@/components/home/TrustStrip";
import CategoryMasonry from "@/components/home/CategoryMasonry";
import WhyChooseUs from "@/components/home/WhyChooseUs";
import JournalSection from "@/components/home/JournalSection";
import StoreLocatorSection from "@/components/home/StoreLocatorSection";
import QuickStatsSection from "@/components/home/QuickStatsSection";
import { locations } from "@/components/home/locations-data";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";

const logoUrl = "/manus-storage/sugi-logo-transparent-clean_fee66cad.png";
// These have no bundled fallback photo (unlike product shots, there's no
// generic stand-in for real store/lifestyle photography) -- null here
// means "nothing to show until an admin uploads one for this slot", which
// lets the .hero-image/.cat-mosaic-anchor CSS gradient show through
// instead of a broken <img>. Upload real photos via /admin -> Content &
// Media for slots: home-hero, home-categories, summer-slide-1/2/3,
// home-family. (home-stores no longer applies -- the store locator's map
// is now a static illustration, not a photo slot, see StoreLocatorSection.)
const heroImage = null;
const assortmentImage = "/product-placeholder.svg";
const familyImage = null;
const symbolImage = "/manus-storage/sugi-symbol_0a534a76.png";

const navItems = [
  { label: "Бидний тухай", href: "#story" },
  { label: "Бүтээгдэхүүн", href: "#collection" },
  { label: "Салбарууд", href: "#stores" },
];

const socials = [
  { label: "Facebook", href: "https://www.facebook.com/AsayakeJapaneseDrugstore/", Icon: Facebook },
  { label: "Instagram", href: "https://www.instagram.com/asayake_japan_cosmetics/", Icon: Instagram },
];

// slug matches the real product_categories.slug values (confirmed against
// backups/sugi-catalog-export-2026-08-27.sql) -- used by CategoryMasonry's
// image-led cards to resolve the real per-category placeholder art via
// shared/catalog-filter.ts's getCategoryPlaceholderImage.
const categories = [
  { number: "01", title: "Арьс арчилгаа", detail: "Өдөр тутмын цэвэр, зөөлөн арчилгаа", slug: "arhis-archilgaa", Icon: Flower2 },
  { number: "02", title: "Гоо сайхан", detail: "Японы сонгомол хэрэгцээт бүтээгдэхүүн", slug: "goo-saikhan", Icon: Sparkles },
  { number: "03", title: "Эрүүл мэнд", detail: "Өдөр тутмын сайн сайхны найдвартай сонголт", slug: "eruul-mend", Icon: ShieldCheck },
  { number: "04", title: "Эрүүл ахуй", detail: "Гэр бүлд хэрэгтэй цэвэр, аюулгүй хэрэглээ", slug: "eruul-akhui", Icon: BadgeCheck },
  { number: "05", title: "Үс ба бие", detail: "Өдөр бүрийн арчилгааг илүү хялбар болгоно", slug: "us-ba-bie", Icon: CircleCheck },
  { number: "06", title: "Ээж ба хүүхэд", detail: "Зөөлөн, хэрэгцээт сонголтууд", slug: "eej-ba-khuukhed", Icon: Gift },
];

const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const bestsellerFallbackImage = "/product-placeholder.svg";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const siteMediaQuery = trpc.content.siteMedia.useQuery();
  // matsukiyococokara-online.com's 売れ筋ランキング (bestseller ranking) —
  // adapted as a real-data section, not a curated list. See
  // getBestsellingProducts in server/db.ts.
  const bestsellersQuery = trpc.catalog.bestsellers.useQuery();
  const bestsellers = bestsellersQuery.data ?? [];
  // Same reference site's お役立ち情報 (useful info) homepage rail — the
  // content/post system has existed since the PostDetail page was built,
  // but nothing ever surfaced it on the homepage itself.
  const latestPostsQuery = trpc.content.latestPosts.useQuery();
  const latestPosts = (latestPostsQuery.data ?? []).slice(0, 3);
  const mediaBySlot = useMemo(() => new Map((siteMediaQuery.data ?? []).map(media => [media.slotKey, media.imageUrl])), [siteMediaQuery.data]);
  const imageFor = (slotKey: string, fallbackUrl: string | null) => mediaBySlot.get(slotKey) || fallbackUrl;
  // Only sets an inline background-image when there's an actual URL --
  // omitting the property entirely (rather than pointing it at a known-bad
  // URL) is what lets the CSS gradient fallback on these classes show
  // through until a real photo is uploaded for the slot.
  const bgStyle = (slotKey: string, fallbackUrl: string | null) => {
    const url = imageFor(slotKey, fallbackUrl);
    return url ? { backgroundImage: `url(${url})` } : undefined;
  };
  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sugi-site" id="top">
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="site-header-inner">
          <a className="site-brand" href="#top" aria-label="SUGI ASAYAKE Mongolia home">
            <img src={logoUrl} alt="SUGI ASAYAKE Mongolia" />
          </a>
          <nav className="site-nav" aria-label="Үндсэн цэс">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </nav>
          <div className="site-actions">
            <span className="official-note">Албан ёсны эрхтэй</span>
            <div className="header-socials" aria-label="Сошиал хуудаснууд">
              {socials.map(({ label, href, Icon }) => <a className="social-icon-link" href={href} target="_blank" rel="noreferrer" aria-label={`${label} хуудас нээх`} key={label}><Icon size={15} strokeWidth={1.8} /></a>)}
            </div>
            <HeaderSearch />
            <Link className="shop-entry" href="/shop"><ShoppingBag size={14} /> Дэлгүүр</Link>
            <a className="phone-link" href="tel:94509911"><Phone size={14} /> 9450-9911</a>
            <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? "Цэс хаах" : "Цэс нээх"} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
              <span>{item.label}</span><ArrowUpRight size={16} />
            </a>
          ))}
          <a href="tel:94509911" onClick={() => setMenuOpen(false)}><span>9450-9911</span><Phone size={16} /></a>
        </div>
      </header>

      <main>
        <HeroSection heroImageStyle={bgStyle("home-hero", heroImage)} />

        <TrustStrip branchCount={locations.length} />

        <div className="sunrise-ribbon" aria-label="SUGI ASAYAKE brand promise">
          <div><span>JAPANESE DAILY CARE</span><i /><span>УЛААНБААТАР / MONGOLIA</span><i /><span>ГЭР БҮЛИЙН ГИШҮҮН БҮРТ</span><i /></div>
          <div aria-hidden="true"><span>JAPANESE DAILY CARE</span><i /><span>УЛААНБААТАР / MONGOLIA</span><i /><span>ГЭР БҮЛИЙН ГИШҮҮН БҮРТ</span><i /></div>
        </div>

        {/* Home redesign Tier 7 -- replaces the old membership-strip promo
            panel (generic "3-10%" prose, no real data) with a real,
            server-authoritative membership summary. See
            client/src/components/home/QuickStatsSection.tsx. */}
        <QuickStatsSection />

        <section className="story-section page-section" id="story" data-reveal>
          <div className="section-heading"><span>01</span><span>THE SUGI DIFFERENCE</span></div>
          <div className="story-grid">
            <h2>Японы чанарыг<br /><em>ойртуулна.</em></h2>
            <div className="story-copy"><p>SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.</p><a className="inline-link" href="#collection">Бидний ялгаа <ArrowUpRight size={16} /></a></div>
          </div>
        </section>

        <WhyChooseUs branchCount={locations.length} />

        <CategoryMasonry
          categories={categories}
          anchorImageStyle={bgStyle("home-categories", assortmentImage)}
          symbolImage={symbolImage}
        />

        {/* matsukiyococokara-online.com's 売れ筋ランキング (bestseller ranking)
            section, adapted: real paid-order history via getBestsellingProducts,
            not a manually curated "featured" list. Hidden entirely (not shown
            with an empty state) until real orders exist — same "don't show a
            placeholder" rule as RecentlyViewed/RecommendedForYou on /shop. */}
        {bestsellers.length > 0 && (
          <section className="bestseller-section" data-reveal>
            <div className="bestseller-heading">
              <div><p className="shop-kicker"><TrendingUp size={12} /> ОНЦЛОХ СОНГОЛТ</p><h2>Их зарагддаг<br /><em>бараанууд.</em></h2></div>
              <p>Манай захиалгын бодит түүхээр эрэмбэлсэн, хамгийн их итгэл олсон сонголтууд.</p>
            </div>
            <div className="bestseller-grid">
              {bestsellers.slice(0, 6).map((product, index) => (
                <Link href={`/product/${product.slug}`} className="bestseller-card" key={product.id}>
                  <span className="bestseller-rank">{index + 1}</span>
                  <img src={product.imageUrl ?? bestsellerFallbackImage} alt={product.name} />
                  <div>
                    <p>{product.brand ?? "SUGI ASAYAKE"}</p>
                    <h3>{product.name}</h3>
                    {product.reviewCount > 0 && <span className="bestseller-rating"><Star size={11} fill="#17181b" stroke="#17181b" /> {product.avgRating?.toFixed(1)} <em>({product.reviewCount})</em></span>}
                    <strong>{formatMnt(product.priceMnt)}</strong>
                  </div>
                </Link>
              ))}
            </div>
            <Link href="/shop" className="bestseller-all-link">Бүх бүтээгдэхүүн үзэх <ArrowUpRight size={16} /></Link>
          </section>
        )}

        <SeasonalCampaignCarousel imageOverrides={{ "summer-slide-1": imageFor("summer-slide-1", heroImage) ?? undefined, "summer-slide-2": imageFor("summer-slide-2", assortmentImage) ?? undefined, "summer-slide-3": imageFor("summer-slide-3", familyImage) ?? undefined }} />

        <section className="care-section" data-reveal>
          <div className="care-image" style={bgStyle("home-family", familyImage)}><span>03 / FAMILY CARE</span></div>
          <div className="care-copy-panel"><div className="care-sun-stamp" aria-hidden="true"><span>FAMILY<br />CARE</span></div><p className="eyebrow">ГЭР БҮЛИЙН ӨДӨР БҮРТ</p><h2>Багахан <em>итгэл.</em><br />Их халамж.</h2><p>Бидний сонголт зөвхөн бүтээгдэхүүн биш. Таны гэр бүлийн өдөр тутмын амар тайван байдал, итгэл, халамж юм.</p><div className="care-points"><div><CircleCheck size={17} /> Баталгаат Япон бүтээгдэхүүн</div><div><CircleCheck size={17} /> Гэр бүл бүрт зориулсан сонголт</div><div><CircleCheck size={17} /> Storepay-ээр төлөх боломжтой</div></div><div className="storepay-note"><strong>Storepay</strong><span>Хэрэгтэй зүйлээ өнөөдөр сонгоод,<br />төлбөрөө өөрт тохиромжтой хуваарил.</span></div></div>
        </section>

        {/* matsukiyococokara-online.com's お役立ち情報 (useful info) rail —
            the content/post system already exists (admin can write + publish
            a post, PostDetail.tsx renders it at /:slug); nothing ever
            surfaced it on the homepage until now. Hidden entirely, same
            empty-state discipline as the bestseller rail above, until an
            admin has actually published something. */}
        <JournalSection posts={latestPosts} />

        <StoreLocatorSection />

        <section className="final-cta" data-reveal><div className="final-cta-sun" aria-hidden="true">SUGI<br />CARE</div><div><p className="eyebrow">NEED A LITTLE HELP?</p><h2>Сайн сонголт <em>ойрхон байна.</em></h2></div><a className="button button-light" href="tel:94509911">9450-9911 <Phone size={15} /></a></section>
      </main>

      <footer className="site-footer"><div className="footer-grid"><div><img src={logoUrl} alt="SUGI ASAYAKE Mongolia" className="footer-logo" /><p>Япон чанарыг гэр бүл бүрт.</p><div className="footer-socials" aria-label="SUGI ASAYAKE сошиал хуудаснууд">{socials.map(({ label, href, Icon }) => <a className="footer-social-link" href={href} target="_blank" rel="noreferrer" aria-label={`${label} хуудас нээх`} key={label}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></a>)}</div></div><div className="footer-column"><span>Шуурхай холбоос</span><a href="#story">Бидний тухай</a><a href="#collection">Бүтээгдэхүүн</a><a href="#stores">Салбарууд</a></div><div className="footer-column"><span>Нөхцөл ба бодлого</span><Link href="/privacy">Хувийн нууцлал</Link><Link href="/terms">Үйлчилгээний нөхцөл</Link><Link href="/returns">Буцаалт, солилцоо</Link></div><div className="footer-column"><span>Холбоо барих</span><a href="tel:94509911">9450-9911</a><a href="mailto:asayake0307@gmail.com">asayake0307@gmail.com</a><small>Storepay боломжтой</small></div></div><div className="footer-bottom"><span>© 2026 SUGI ASAYAKE Mongolia</span><span>Official SUGI Drug Store Japan subsidiary</span></div></footer>
    </div>
  );
}
