import { avifSrcSet, HERO_FULL_WIDTH, HERO_IMAGE_SIZES, imageSrcSet } from "../../shared/image-variants";
import { getSiteMediaSlot, type SiteMediaSlotKey } from "../../shared/site-media";
import type { SiteTextSlotKey } from "../../shared/site-text";
import { hasAvif } from "./imagePreload";

/**
 * Нүүр хуудасны "дээд хэсэг" (зарын зурвас + толгой + hero) серверээс шууд HTML-ээр
 * (2026-09-21).
 *
 * ЯАГААД: утасны Lighthouse дээр LCP 4–5 с, үүний 1.5–3 с нь "render delay" —
 * зураг аль хэдийн татагдчихсан ч React (507 KB) ажиллаж зурах хүртэл дэлгэц
 * хоосон. Энэ функц HeroSection/HeroImageSlideshow/CommerceHeader/SitePromo-ийн
 * гаргадаг DOM-ыг ЯГ ИЖИЛ class-уудаар `<div id="root">`-ын ӨМНӨ статикаар зурна:
 * CSS-ийг хөтөч уншмагц hero зураг харагдана. Home.tsx нь React-ийн эхний
 * зурагдалттай НЭГ frame-д (useLayoutEffect) shell-ийг нуугаад текст/толгойг нь
 * устгана — ижил pixel, хэрэглэгч солигдсоныг мэдэхгүй. Нуусан `<img>` баримтад
 * үлддэг нь зориудынх: Lighthouse LCP элементээ олж чадвал зургийн замаар
 * загварчилдаг, устгасан бол JS-ээс хамаарсан пессимист загвар руу унадаг.
 *
 * ДҮРЭМ: markup энд React-ийнхаас салж болохгүй — `e2e/hero-shell.spec.ts` нь
 * JS-гүй shell ба React-ийн зурсан hero зургийн байрлал/хэмжээг утас ба
 * компьютерийн өргөнд харьцуулж хамгаална. Толгойн бүтэц өөрчлөгдвөл энд
 * мөн өөрчил.
 *
 * Shell бүхэлдээ `inert` (2026-09-22): фокус, товшилт авахгүй — React ирэхээс
 * өмнөх анхны Tab/товшилтыг client/src/main.tsx барьж аваад React-ийг шууд
 * mount хийж, тэр товшилтыг React-ийн ижил элемент рүү дамжуулна.
 *
 * Дотор нь юу ЗУРАХГҮЙ: интерактив зүйл (цэс, хайлтын хариу), хэрэглэгчийн
 * төлөв (сагсны тоо, хүслийн зүрх) — тэдгээр React ирмэгц гарна; өндөрт
 * нөлөөлөхгүй тул зураг хөдлөхгүй. `aria-hidden` учир дэлгэц уншигчид давхар
 * сонсохгүй (React-ийнх нь секундын дараа ирнэ).
 */
export type HeroShellInput = {
  media: Array<{ slotKey: string; imageUrl: string }>;
  textFor: (key: SiteTextSlotKey) => string;
  brandLogo: string;
  promo: { id: number; headline: string; message: string | null; ctaLabel: string | null; ctaUrl: string | null; displayMode: string } | null;
};

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// lucide-react-ийн яг path-ууд (node_modules/lucide-react/dist/esm/icons) —
// React ижил дүрсийг ижил хэмжээгээр зурдаг тул дүрс "гэнэт гарч ирэхгүй".
const ICON_PATHS: Record<string, string> = {
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "badge-check": '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  "shopping-bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
const icon = (name: keyof typeof ICON_PATHS, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

// CommerceHeader.tsx-ийн marketingNavItems-тэй ижил.
const NAV_ITEMS: Array<{ slot: SiteTextSlotKey; fallback: string; href: string }> = [
  { slot: "nav-text-shop", fallback: "Дэлгүүр", href: "/shop" },
  { slot: "nav-text-brands", fallback: "Топ брэнд", href: "#top-brands" },
  { slot: "nav-text-membership", fallback: "Гишүүнчлэл", href: "#membership" },
  { slot: "nav-text-stores", fallback: "Салбарууд", href: "#stores" },
  { slot: "nav-text-journal", fallback: "Зөвлөгөө", href: "/journal" },
];

// HeroSection.tsx-ийн зургийн жагсаалттай ижил (slot, холбоос, нэр).
const HERO_SLIDES: Array<{ slot: SiteMediaSlotKey; href: string; label: string }> = [
  { slot: "home-hero", href: "/shop", label: "Бүтээгдэхүүн үзэх" },
  { slot: "home-hero-2", href: "/shop", label: "Бүтээгдэхүүн үзэх" },
  { slot: "home-hero-3", href: "#stores", label: "Салбар олох" },
  { slot: "home-hero-4", href: "/shop", label: "Бүтээгдэхүүн үзэх" },
  { slot: "home-hero-5", href: "/shop", label: "Бүтээгдэхүүн үзэх" },
  { slot: "home-hero-6", href: "/shop", label: "Бүтээгдэхүүн үзэх" },
];

export async function renderHeroShell({ media, textFor, brandLogo, promo }: HeroShellInput): Promise<string> {
  const bySlot = new Map(media.map(row => [row.slotKey, row.imageUrl]));
  const slides = HERO_SLIDES
    .map(slide => ({ ...slide, url: bySlot.get(slide.slot) || getSiteMediaSlot(slide.slot).fallbackUrl }))
    .filter((slide): slide is typeof slide & { url: string } => Boolean(slide.url));
  const avif = await Promise.all(slides.map(slide => hasAvif(slide.url)));

  const figures = slides.map((slide, index) => {
    const webp = imageSrcSet(slide.url, HERO_FULL_WIDTH);
    const avifSet = avif[index] ? avifSrcSet(slide.url, HERO_FULL_WIDTH) : null;
    // HeroImageSlideshow: харагдах хуулбарын эхний зураг л eager + high.
    const priority = index === 0 ? ' fetchpriority="high" loading="eager"' : ' loading="lazy"';
    const img = `<img src="${esc(slide.url)}"${webp ? ` srcset="${esc(webp)}" sizes="${esc(HERO_IMAGE_SIZES)}"` : ""} alt="" draggable="false"${priority}>`;
    const picture = avifSet
      ? `<picture class="responsive-picture"><source type="image/avif" srcset="${esc(avifSet)}" sizes="${esc(HERO_IMAGE_SIZES)}">${img}</picture>`
      : img;
    return `<figure class="hero-rail-slide" data-hero-tile="" data-slot="${slide.slot}"><a href="${esc(slide.href)}" class="hero-rail-link" draggable="false" aria-label="${esc(slide.label)}" tabindex="-1">${picture}</a></figure>`;
  }).join("");

  const heading = esc(textFor("home-text-hero-heading").split("\n").filter(Boolean).join(" "));
  const [brandPart, ...rest] = textFor("home-text-hero-eyebrow").split("/");
  const placePart = rest.join("/").trim();
  const eyebrow = `<span class="hero-eyebrow-brand">${esc(brandPart.trim())}</span>`
    + (placePart ? `<span class="hero-eyebrow-sep" aria-hidden="true">/</span><span class="hero-eyebrow-place">${esc(placePart)}</span>` : "");

  // SitePromo.tsx-ийн banner markup (ticker 6 давталт × 2 мөр) — sessionStorage-д
  // хаасан бол /vendor/hero-shell.js энэ мөрийг зурагдахаас өмнө устгана.
  let promoBar = "";
  if (promo && promo.displayMode === "banner") {
    const text = esc(promo.message ? `${promo.headline} — ${promo.message}` : promo.headline);
    const row = Array.from({ length: 6 }, () => `<span>${text}</span><i></i>`).join("");
    const cta = promo.ctaLabel && promo.ctaUrl
      ? `<a href="${esc(promo.ctaUrl)}" class="shrink-0 rounded-full bg-[#df1f3d] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#bc1732]">${esc(promo.ctaLabel)}</a>`
      : "";
    promoBar = `<div class="site-promo-banner sticky top-0 z-[60] flex items-center gap-3 bg-[#17181b] px-4 py-2.5 text-white" data-promo-id="${promo.id}">`
      + `<div class="site-promo-ticker"><div>${row}</div><div aria-hidden="true">${row}</div></div>`
      + `<div class="flex shrink-0 items-center gap-3">${cta}<button type="button" tabindex="-1" class="-m-1.5 shrink-0 p-1.5 text-white/60 transition hover:text-white">${icon("x", 16)}</button></div></div>`;
  }

  const nav = NAV_ITEMS.map(item => `<a href="${item.href}">${esc(textFor(item.slot) || item.fallback)}</a>`).join("");

  // `inert` (2026-09-22): the shell is a picture of the page, not the page.
  // aria-hidden alone left its nav links and brand link focusable (a Tab
  // before React landed on hidden content and was lost when the shell went
  // away), and its buttons clickable-but-dead. Inert takes the whole subtree
  // out of focus and hit-testing; client/src/main.tsx mounts React on the
  // first key or press and hands the tap to React's identical control.
  return `<div id="hero-shell" aria-hidden="true" inert>${promoBar}<div class="sugi-site">`
    + `<header class="commerce-header"><div class="commerce-header-inner">`
    + `<div class="commerce-header-left"><a href="/" class="commerce-brand"><img src="${esc(brandLogo)}" alt=""></a></div>`
    + `<div class="commerce-header-search-slot"><div class="header-search header-search--inline"><div class="header-search-field"><input class="header-search-input" placeholder="Бүтээгдэхүүн, брэндээр хайх" readonly tabindex="-1"><button type="button" tabindex="-1" class="header-search-submit">${icon("search", 18)}</button></div></div></div>`
    + `<div class="commerce-header-actions">`
    + `<div class="header-search-compact"><div class="header-search"><button type="button" tabindex="-1" class="header-search-trigger">${icon("search", 18)}</button></div></div>`
    + `<div class="locale-switch"><button type="button" tabindex="-1" class="locale-switch-trigger">${icon("globe", 19)}</button></div>`
    + `<button type="button" tabindex="-1" class="header-theme-toggle">${icon("moon", 19)}</button>`
    + `<a href="/profile" class="profile-link" tabindex="-1">${icon("user", 19)}<span class="header-action-label">Профайл</span></a>`
    + `<button type="button" tabindex="-1">${icon("shopping-bag", 19)}<span class="header-action-label">Сагс</span></button>`
    + `<button type="button" tabindex="-1" class="commerce-menu-toggle">${icon("menu", 20)}</button>`
    + `</div></div>`
    + `<nav class="commerce-header-navrow commerce-marketing-nav">${nav}</nav>`
    + `</header>`
    + `<div><section class="hero-section">`
    + `<div class="hero-rail-wrap"><div class="hero-rail" role="group">${figures}</div></div>`
    + `<div class="hero-copy">`
    + `<p class="eyebrow hero-eyebrow">${eyebrow}</p>`
    + `<h1>${heading}</h1>`
    + `<p class="hero-description">${esc(textFor("home-text-hero-description"))}</p>`
    + `<div class="hero-actions"><a class="button button-primary" href="/shop" tabindex="-1">Бүтээгдэхүүн үзэх ${icon("chevron-right", 16)}</a><a class="quiet-link" href="#stores" tabindex="-1">Салбар олох</a></div>`
    + `<div class="hero-trust">${icon("badge-check", 18)}<div><strong>${esc(textFor("home-text-hero-trust-title"))}</strong><span>${esc(textFor("home-text-hero-trust-subtitle"))}</span></div></div>`
    + `</div></section></div></div></div>`;
}
