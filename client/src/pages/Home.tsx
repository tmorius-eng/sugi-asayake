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
  Clock3,
  Facebook,
  Flower2,
  Instagram,
  MapPin,
  Menu,
  Navigation,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import HeaderSearch from "@/components/HeaderSearch";
import SeasonalCampaignCarousel from "@/components/SeasonalCampaignCarousel";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";

const logoUrl = "/manus-storage/sugi-logo-transparent-clean_fee66cad.png";
// These four have no bundled fallback photo (unlike product shots, there's
// no generic stand-in for real store/lifestyle photography) -- null here
// means "nothing to show until an admin uploads one for this slot", which
// lets the .hero-image/.collection-image/etc CSS gradient show through
// instead of a broken <img>. Upload real photos via /admin -> Content &
// Media for slots: home-hero, home-categories, summer-slide-1/2/3,
// home-family, home-stores.
const heroImage = null;
const assortmentImage = "/product-placeholder.svg";
const familyImage = null;
const storeImage = null;
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

// PREMIUM-FEATURES.md TIER 3 Store Locator: hours/phone are the same across
// all 3 branches (confirmed with Tom, 2026-08-25) — daily 11:00-20:00, one
// shared central line (already the "залгах" button just above this list).
const BRANCH_HOURS = "Өдөр бүр 11:00–20:00";
const BRANCH_PHONE = "9450-9911";
const locations = [
  { number: "01", name: "Орос элчингийн салбар", detail: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", mapUrl: "https://www.google.com/maps/search/?api=1&query=Chin+Van+Handdorj+St%2C+SBD+-+4+khoroo%2C+Ulaanbaatar+13120" },
  { number: "02", name: "Их наяд плаза", detail: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", mapUrl: "https://www.google.com/maps/search/?api=1&query=Ikh+Mongol+State+Street+4%2C+HUD+-+15+khoroo%2C+Ulaanbaatar+17009" },
  { number: "03", name: "Яармаг FOOD CITY", detail: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", mapUrl: "https://www.google.com/maps/search/?api=1&query=Naadamchid+Rd%2C+HUD+-+24+khoroo%2C+Ulaanbaatar+17080" },
];

const categories = [
  { number: "01", title: "Арьс арчилгаа", detail: "Өдөр тутмын цэвэр, зөөлөн арчилгаа" },
  { number: "02", title: "Гоо сайхан", detail: "Японы сонгомол хэрэгцээт бүтээгдэхүүн" },
  { number: "03", title: "Эрүүл мэнд", detail: "Өдөр тутмын сайн сайхны найдвартай сонголт" },
  { number: "04", title: "Эрүүл ахуй", detail: "Гэр бүлд хэрэгтэй цэвэр, аюулгүй хэрэглээ" },
  { number: "05", title: "Үс ба бие", detail: "Өдөр бүрийн арчилгааг илүү хялбар болгоно" },
  { number: "06", title: "Ээж ба хүүхэд", detail: "Зөөлөн, хэрэгцээт сонголтууд" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const siteMediaQuery = trpc.content.siteMedia.useQuery();
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
        <section className="hero-section hero-sunrise" aria-labelledby="hero-title">
          <div className="hero-color-orbit orbit-one" aria-hidden="true" />
          <div className="hero-color-orbit orbit-two" aria-hidden="true" />
          <div className="hero-copy">
            <div className="hero-topline"><p className="eyebrow"><span /> SUGI ASAYAKE / MONGOLIA</p><span className="hero-time">ASAYAKE / 06:07</span></div>
            <h1 id="hero-title">ГЭР БҮЛИЙН<br /><span>ГИШҮҮН БҮРТ</span><br /><strong>ЯПОН ЧАНАР</strong></h1>
            <p className="hero-description">Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/shop">Бүтээгдэхүүн үзэх <ArrowUpRight size={16} /></Link>
              <a className="quiet-link" href="#stores">Салбар олох <ChevronRight size={16} /></a>
            </div>
            <div className="hero-trust">
              <BadgeCheck size={20} />
              <div><strong>100% албан ёсны эрхтэй</strong><span>SUGI Drug Store Japan-ийн охин компани</span></div>
            </div>
            <div className="hero-signature" aria-label="SUGI ASAYAKE daily care signature"><Flower2 size={17} /><span>Өглөөнөөс орой хүртэл<br />таны өдөр тутмын сонголт.</span></div>
          </div>
          <div className="hero-image" style={bgStyle("home-hero", heroImage)} aria-label="SUGI ASAYAKE everyday-care products" role="img">
            <div className="hero-image-shade" />
            <div className="hero-image-sun" aria-hidden="true"><span>800+</span><small>DAILY<br />CHOICES</small></div>
            <div className="hero-image-marker" aria-hidden="true"><Sparkles size={15} /><span>THE MORNING<br />OF CARE</span></div>
            <div className="hero-image-label"><span>JAPAN QUALITY</span><strong>01</strong></div>
            <div className="hero-image-caption">Өдөр бүрийн арчилгаа, илүү ойрхон</div>
          </div>
        </section>

        <div className="hero-facts" aria-label="SUGI ASAYAKE facts">
          <div><strong>800<span>+</span></strong><span>төрлийн бүтээгдэхүүн</span></div>
          <div><strong>03</strong><span>УБ дахь салбар</span></div>
          <div><strong>01</strong><span>Японы албан ёсны эрх</span></div>
        </div>

        <div className="sunrise-ribbon" aria-label="SUGI ASAYAKE brand promise">
          <div><span>JAPANESE DAILY CARE</span><i /><span>УЛААНБААТАР / MONGOLIA</span><i /><span>ГЭР БҮЛИЙН ГИШҮҮН БҮРТ</span><i /></div>
          <div aria-hidden="true"><span>JAPANESE DAILY CARE</span><i /><span>УЛААНБААТАР / MONGOLIA</span><i /><span>ГЭР БҮЛИЙН ГИШҮҮН БҮРТ</span><i /></div>
        </div>

        <section className="story-section page-section" id="story" data-reveal>
          <div className="section-heading"><span>01</span><span>THE SUGI DIFFERENCE</span></div>
          <div className="story-grid">
            <h2>Японы чанарыг<br /><em>ойртуулна.</em></h2>
            <div className="story-copy"><p>SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.</p><a className="inline-link" href="#collection">Бидний ялгаа <ArrowUpRight size={16} /></a></div>
          </div>
          <div className="trust-grid">
            <div><ShoppingBag size={20} /><strong>Сонголт</strong><span>Арчилгаа, гоо сайхан, эрүүл ахуйн 800+ төрөл</span></div>
            <div><ShieldCheck size={20} /><strong>Баталгаа</strong><span>Японоос баталгаат, албан ёсны бүтээгдэхүүн</span></div>
            <div><MapPin size={20} /><strong>Ойрхон</strong><span>Улаанбаатарын 3 байршилд таныг хүлээнэ</span></div>
          </div>
        </section>

        <section className="collection-section page-section" id="collection" data-reveal>
          <div className="section-heading"><span>02</span><span>EVERYDAY JAPAN</span></div>
          <div className="collection-heading"><div><h2>Японы бүтээгдэхүүний<br /><em>үндсэн ангилал.</em></h2><div className="collection-color-key" aria-hidden="true"><i /><i /><i /><span>COLOR AS CARE</span></div></div><p>Арьс арчилгаа, гоо сайхан, эрүүл ахуй, гэр бүлийн өдөр тутмын хэрэгцээг 800+ сонголтоос нэг дороос.</p></div>
          <div className="collection-grid">
            <div className="collection-image" style={bgStyle("home-categories", assortmentImage)}>
              <div className="collection-image-shade" />
              <div className="collection-card"><span>OUR SELECTION</span><strong>Нэг өдөрт<br />хэрэгтэй бүх зүйл.</strong><a href="#stores">Ойр салбараа олох <ArrowUpRight size={15} /></a></div>
            </div>
            <div className="category-list">
              {categories.map((category) => <Link href="/shop" className="category-item" key={category.number}><span className="category-number">{category.number}</span><div><strong>{category.title}</strong><span>{category.detail}</span></div><ArrowUpRight size={17} /></Link>)}
              <div className="category-note"><img src={symbolImage} alt="" /><span>Бидний тавиур дээрх бүтээгдэхүүн бүр<br />өдөр тутмын хэрэгцээнээс эхэлнэ.</span></div>
            </div>
          </div>
        </section>

        <SeasonalCampaignCarousel imageOverrides={{ "summer-slide-1": imageFor("summer-slide-1", heroImage) ?? undefined, "summer-slide-2": imageFor("summer-slide-2", assortmentImage) ?? undefined, "summer-slide-3": imageFor("summer-slide-3", familyImage) ?? undefined }} />

        <section className="care-section" data-reveal>
          <div className="care-image" style={bgStyle("home-family", familyImage)}><span>03 / FAMILY CARE</span></div>
          <div className="care-copy-panel"><div className="care-sun-stamp" aria-hidden="true"><span>FAMILY<br />CARE</span></div><p className="eyebrow">ГЭР БҮЛИЙН ӨДӨР БҮРТ</p><h2>Багахан <em>итгэл.</em><br />Их халамж.</h2><p>Бидний сонголт зөвхөн бүтээгдэхүүн биш. Таны гэр бүлийн өдөр тутмын амар тайван байдал, итгэл, халамж юм.</p><div className="care-points"><div><CircleCheck size={17} /> Баталгаат Япон бүтээгдэхүүн</div><div><CircleCheck size={17} /> Гэр бүл бүрт зориулсан сонголт</div><div><CircleCheck size={17} /> Storepay-ээр төлөх боломжтой</div></div><div className="storepay-note"><strong>Storepay</strong><span>Хэрэгтэй зүйлээ өнөөдөр сонгоод,<br />төлбөрөө өөрт тохиромжтой хуваарил.</span></div></div>
        </section>

        <section className="locations-section page-section" id="stores" data-reveal>
          <div className="locations-copy"><div className="section-heading"><span>04</span><span>FIND YOUR ASAYAKE</span></div><p className="eyebrow"><Navigation size={14} /> 3 БАЙРШИЛ</p><h2>Танд ойрхон<br /><em>салбар дээр.</em></h2><p className="locations-lede">Улаанбаатарын өөр өөр цэгүүдэд япон чанарыг танд ойртуулж байна.</p><a className="button button-primary" href="tel:94509911">9450-9911 руу залгах <Phone size={15} /></a></div>
          <div className="location-side"><div className="location-image" style={bgStyle("home-stores", storeImage)}><span>UB / MONGOLIA</span></div><div className="location-list">{locations.map((location) => <a className="location-row" href={location.mapUrl} target="_blank" rel="noreferrer" aria-label={`${location.name} Google Maps дээр нээх`} key={location.number}><span>{location.number}</span><div><strong>{location.name}</strong><small>{location.detail}</small><small className="location-meta"><Clock3 size={11} /> {BRANCH_HOURS}<span className="location-meta-divider" aria-hidden="true">•</span><Phone size={11} /> {BRANCH_PHONE}</small></div><ArrowUpRight size={17} /></a>)}<p className="location-note"><MapPin size={14} /> Салбарын байршлыг Google Maps дээр нээх</p></div></div>
        </section>

        <section className="final-cta" data-reveal><div className="final-cta-sun" aria-hidden="true">SUGI<br />CARE</div><div><p className="eyebrow">NEED A LITTLE HELP?</p><h2>Сайн сонголт <em>ойрхон байна.</em></h2></div><a className="button button-light" href="tel:94509911">9450-9911 <Phone size={15} /></a></section>
      </main>

      <footer className="site-footer"><div className="footer-grid"><div><img src={logoUrl} alt="SUGI ASAYAKE Mongolia" className="footer-logo" /><p>Япон чанарыг гэр бүл бүрт.</p><div className="footer-socials" aria-label="SUGI ASAYAKE сошиал хуудаснууд">{socials.map(({ label, href, Icon }) => <a className="footer-social-link" href={href} target="_blank" rel="noreferrer" aria-label={`${label} хуудас нээх`} key={label}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></a>)}</div></div><div className="footer-column"><span>Шуурхай холбоос</span><a href="#story">Бидний тухай</a><a href="#collection">Бүтээгдэхүүн</a><a href="#stores">Салбарууд</a></div><div className="footer-column"><span>Нөхцөл ба бодлого</span><Link href="/privacy">Хувийн нууцлал</Link><Link href="/terms">Үйлчилгээний нөхцөл</Link><Link href="/returns">Буцаалт, солилцоо</Link></div><div className="footer-column"><span>Холбоо барих</span><a href="tel:94509911">9450-9911</a><a href="mailto:asayake0307@gmail.com">asayake0307@gmail.com</a><small>Storepay боломжтой</small></div></div><div className="footer-bottom"><span>© 2026 SUGI ASAYAKE Mongolia</span><span>Official SUGI Drug Store Japan subsidiary</span></div></footer>
    </div>
  );
}
