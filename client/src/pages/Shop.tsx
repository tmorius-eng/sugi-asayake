import { ArrowDownUp, ArrowUpRight, ChevronLeft, ChevronRight, Eye, Heart, LoaderCircle, MapPin, PackageCheck, Phone, RotateCcw, Search, ShoppingBag, SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import QuickViewDialog, { type QuickViewProduct } from "@/components/QuickViewDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { filterCatalogProducts, filterCatalogSkinType, filterCatalogStock, getCatalogCategories, getCatalogSkinTypes, getSalePercent, LOW_STOCK_THRESHOLD, skinTypeLabels, sortCatalogProducts, type CatalogSortOption, type SkinType } from "@shared/catalog-filter";
import { rememberRecentlyViewed, resolveRecentlyViewed } from "@shared/recently-viewed";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const fallbackImage = "/manus-storage/sugi-professional-assortment_74fa4e31.jpg";
const RECENTLY_VIEWED_KEY = "sugi-asayake-recently-viewed-v1";

const discoveryCategories = [
  { number: "01", title: "Арьс арчилгаа", detail: "Зөөлөн, өдөр тутмын арчилгаа", tone: "rose" },
  { number: "02", title: "Гоо сайхан", detail: "Өөртөө итгэх жижиг мөчүүд", tone: "cobalt" },
  { number: "03", title: "Эрүүл мэнд", detail: "Гэр бүлийн тайван өдөр бүр", tone: "marigold" },
  { number: "04", title: "Ээж ба хүүхэд", detail: "Хамгийн зөөлөн сонголтууд", tone: "mint" },
];

type RecentlyViewedProps = {
  products: QuickViewProduct[];
  rememberedCount: number;
  onRemember: (id: number) => void;
  onQuickView: (product: QuickViewProduct) => void;
};

function RecentlyViewed({ products, rememberedCount, onRemember, onQuickView }: RecentlyViewedProps) {
  const unavailableCount = Math.max(0, rememberedCount - products.length);
  return <section className="recently-viewed-section" data-reveal>
    <div className="recently-viewed-heading">
      <div>
        <p className="shop-kicker"><span /> ТАНЫ СҮҮЛД ҮЗСЭН</p>
        <h2>Буцаад <em>хараарай.</em></h2>
      </div>
      <p>Энэ жагсаалт зөвхөн таны энэ төхөөрөмж дээр хадгалагдана. Нэвтрэх мэдээлэл, захиалга, эсвэл хувийн таних мэдээлэл цуглуулахгүй.</p>
    </div>
    {products.length ? <><div className="recently-viewed-grid">{products.map(product => <article className="recently-viewed-card" key={product.id}>
      <Link href={`/product/${product.slug}`} onClick={() => onRemember(product.id)}>
        <img src={product.imageUrl ?? fallbackImage} alt={product.name} />
        <div><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h3>{product.name}</h3><strong>{formatMnt(product.priceMnt)}</strong></div>
      </Link>
      <button type="button" onClick={() => onQuickView(product)} aria-label={`${product.name} шуурхай харах`}>Шуурхай харах <Eye size={14} /></button>
    </article>)}</div>{unavailableCount ? <p className="recently-viewed-notice">Таны өмнө үзсэн {unavailableCount} бүтээгдэхүүн одоогоор онлайн каталогоос хасагдсан байна.</p> : null}</> : <div className="recently-viewed-empty"><Eye size={19} /><p>{rememberedCount ? `Таны өмнө үзсэн ${rememberedCount} бүтээгдэхүүн одоогоор онлайн каталогоос хасагдсан байна. Шинэ сонголт нэмэгдэхэд энд дахин гарна.` : "Таны үзсэн бүтээгдэхүүн энд гарна. Бодит каталог нийтлэгдсэний дараа бүтээгдэхүүний картнаас “Шуурхай харах” эсвэл дэлгэрэнгүй хуудас нээгээрэй."}</p></div>}
  </section>;
}

type RecommendedForYouProps = {
  products: QuickViewProduct[];
  onRemember: (id: number) => void;
  onQuickView: (product: QuickViewProduct) => void;
};

function RecommendedForYou({ products, onRemember, onQuickView }: RecommendedForYouProps) {
  if (!products.length) return null;
  return <section className="recently-viewed-section" data-reveal>
    <div className="recently-viewed-heading">
      <div>
        <p className="shop-kicker"><span /> ТАНД ЗОРИУЛАН</p>
        <h2>Танд <em>санал болгож байна.</em></h2>
      </div>
      <p>Таны профайл дээр хадгалсан арьсны төрөл, арчилгааны сонирхол, интерьер загварт тохирсон бүтээгдэхүүнүүд.</p>
    </div>
    <div className="recently-viewed-grid">{products.map(product => <article className="recently-viewed-card" key={product.id}>
      <Link href={`/product/${product.slug}`} onClick={() => onRemember(product.id)}>
        <img src={product.imageUrl ?? fallbackImage} alt={product.name} />
        <div><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h3>{product.name}</h3><strong>{formatMnt(product.priceMnt)}</strong></div>
      </Link>
      <button type="button" onClick={() => onQuickView(product)} aria-label={`${product.name} шуурхай харах`}>Шуурхай харах <Eye size={14} /></button>
    </article>)}</div>
  </section>;
}

export default function Shop() {
  const qaHistoryMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("historyQa") : null;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [skinTypeFilter, setSkinTypeFilter] = useState<SkinType | "all">("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<CatalogSortOption>("featured");
  const [cartOpen, setCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<QuickViewProduct | null>(null);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>([]);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const catalog = trpc.catalog.list.useQuery();
  const wishlist = trpc.profile.wishlist.list.useQuery(undefined, { enabled: isAuthenticated });
  const recommended = trpc.catalog.recommended.useQuery(undefined, { enabled: isAuthenticated });
  const wishlistIds = useMemo(() => new Set(wishlist.data?.map(item => item.productId) ?? []), [wishlist.data]);
  const toggleWishlist = trpc.profile.wishlist.toggle.useMutation({ onSuccess: () => utils.profile.wishlist.list.invalidate() });
  const onToggleWishlist = (productId: number) => {
    if (!isAuthenticated) { startLogin(); return; }
    toggleWishlist.mutate({ productId, saved: !wishlistIds.has(productId) });
  };
  const cart = trpc.cart.current.useQuery();
  const products = catalog.data ?? [];
  const cartCount = cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const categories = useMemo(() => getCatalogCategories(products), [products]);
  const skinTypes = useMemo(() => getCatalogSkinTypes(products), [products]);
  const filtered = useMemo(() => {
    const matchingProducts = filterCatalogSkinType(filterCatalogProducts(products, search, category), skinTypeFilter);
    return sortCatalogProducts(filterCatalogStock(matchingProducts, inStockOnly), sort);
  }, [products, category, search, inStockOnly, sort, skinTypeFilter]);
  // ~940 real products (PRODUCT-IMPORT.md) made an unpaginated grid an
  // endless scroll — page it like any real catalog. 24 divides evenly into
  // the 4/3/2-column grid breakpoints (see .shop-product-grid in index.css).
  const SHOP_PAGE_SIZE = 24;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, category, skinTypeFilter, inStockOnly, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / SHOP_PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pagedProducts = useMemo(() => filtered.slice((page - 1) * SHOP_PAGE_SIZE, page * SHOP_PAGE_SIZE), [filtered, page]);
  const effectiveRecentIds = qaHistoryMode === "unavailable" ? [999_999] : recentlyViewedIds;
  const forceZeroResults = qaHistoryMode === "zero-filter";
  const recentlyViewed = useMemo(() => resolveRecentlyViewed(products, effectiveRecentIds), [products, effectiveRecentIds]);
  useScrollReveal(`${catalog.isLoading}-${products.length}-${pagedProducts.length}-${page}-${recentlyViewed.length}-${recommended.data?.length ?? 0}`);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
      if (Array.isArray(saved)) setRecentlyViewedIds(saved.filter((value): value is number => Number.isInteger(value)).slice(0, 6));
    } catch { window.localStorage.removeItem(RECENTLY_VIEWED_KEY); }
  }, []);

  const resetControls = () => { setSearch(""); setCategory("all"); setSkinTypeFilter("all"); setInStockOnly(false); setSort("featured"); };
  const rememberProduct = (productId: number) => setRecentlyViewedIds(current => {
    const next = rememberRecentlyViewed(current, productId);
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    return next;
  });
  const openQuickView = (product: QuickViewProduct) => { rememberProduct(product.id); setQuickViewProduct(product); };

  return <div className="sugi-commerce">
    <CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" />
    <main className="shop-main">
      <section className="shop-hero" data-reveal>
        <div className="shop-hero-copy"><p className="shop-kicker"><span /> 02 / SUGI MARKET</p><h1>Өдөр тутмын<br /><em>сонголтууд.</em></h1><p>Японоос албан ёсоор нийлүүлсэн арьс арчилгаа, эрүүл мэнд, гэр бүлийн хэрэгцээний бүтээгдэхүүнээ өөртөө тохируулан олоорой.</p><div className="shop-hero-signature"><Sparkles size={17} /><span>ТАНЫ ӨДӨР БҮРТ / ЯПОН ЧАНАР</span></div></div>
        <div className="shop-search-panel"><div className="shop-search-stamp" aria-hidden="true">CARE<br />IS<br />COLOR</div><label><Search size={19} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Бүтээгдэхүүн, брэндээр хайх" /></label><p><strong>{filtered.length}</strong> үр дүн / <span>{products.length} бүтээгдэхүүн</span></p></div>
      </section>
      <div className="shop-ribbon"><span>CURATED IN JAPAN</span><i /><span>FIND YOUR DAILY CARE</span><i /><span>УЛААНБААТАР / MONGOLIA</span><i /><span>CURATED IN JAPAN</span></div>
      <section className="shop-filter" data-reveal>
        <div><p><SlidersHorizontal size={15} /> АНГИЛЛААР ШҮҮХ</p><span>Таны өдөр тутмын хэрэгцээний хэмнэлээр</span></div>
        <div className="shop-filter-pills"><button type="button" onClick={() => setCategory("all")} className={category === "all" ? "active" : ""}>Бүгд</button>{categories.map(item => <button type="button" key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>)}</div>
        {skinTypes.length ? <div className="shop-filter-pills shop-skin-filter"><button type="button" onClick={() => setSkinTypeFilter("all")} className={skinTypeFilter === "all" ? "active" : ""}>Арьсны төрөл: Бүгд</button>{skinTypes.map(type => <button type="button" key={type} onClick={() => setSkinTypeFilter(type)} className={skinTypeFilter === type ? "active" : ""}>{skinTypeLabels[type]}</button>)}</div> : null}
        <div className="shop-control-row"><label className="stock-toggle"><input type="checkbox" checked={inStockOnly} onChange={event => setInStockOnly(event.target.checked)} /><span><PackageCheck size={14} /> Бэлэн нөөцтэй</span></label><label className="sort-control"><ArrowDownUp size={14} /><span>Эрэмбэ</span><select value={sort} onChange={event => setSort(event.target.value as CatalogSortOption)}><option value="featured">Онцлох</option><option value="price-low">Үнэ: багаас</option><option value="price-high">Үнэ: ихээс</option><option value="name-asc">Нэр: A–Я</option></select></label></div>
      </section>
      {catalog.isLoading ? <div className="shop-loading"><LoaderCircle className="animate-spin" size={30} /> Каталогийг бэлдэж байна</div> : catalog.isError ? <section className="shop-status-card error"><h2>Каталогийг ачаалж чадсангүй.</h2><p>Интернэт холболтоо шалгаад дахин оролдоно уу.</p></section> : products.length === 0 && !forceZeroResults ? <section className="shop-discovery" data-reveal>
        <div className="shop-discovery-heading"><p className="shop-kicker"><span /> SUGI ASAYAKE / DISCOVER</p><h2>Өнөөдрийн хэрэгцээ<br /><em>эндээс эхэлнэ.</em></h2><p>Онлайн каталогийг бид салбарын бодит нөөцтэй нь уялдуулан шинэчилж байна. Харин та өөрт ойр салбараас дараах ангиллаар шууд асууж болно.</p></div>
        <div className="shop-category-deck">{discoveryCategories.map(item => <div className={`shop-category-card ${item.tone}`} key={item.number}><span>{item.number}</span><div><small>SUGI DAILY CARE</small><h3>{item.title}</h3><p>{item.detail}</p></div><ArrowUpRight size={20} /></div>)}</div>
        <div className="shop-discovery-cta" id="shop-contact"><div><MapPin size={20} /><span><strong>3 салбар, нэг өдөр тутмын сонголт.</strong><small>Таны хайж буй бүтээгдэхүүнийг ойр салбараас асуугаарай.</small></span></div><div><Link href="/#stores">Салбар олох <ArrowUpRight size={16} /></Link><a href="tel:94509911">9450-9911 <Phone size={15} /></a></div></div>
      </section> : filtered.length ? <><section className="shop-product-grid" id="shop-product-grid">{pagedProducts.map((product, index) => {
        const salePercent = getSalePercent(product.priceMnt, product.compareAtPriceMnt);
        const lowStock = product.stockQuantity > 0 && product.stockQuantity <= LOW_STOCK_THRESHOLD;
        return <article key={product.id} className="shop-product-card" data-reveal style={{ transitionDelay: `${Math.min(index * 55, 300)}ms` }}>
        <button type="button" className={`shop-wishlist-toggle${wishlistIds.has(product.id) ? " active" : ""}`} onClick={() => onToggleWishlist(product.id)} aria-label={wishlistIds.has(product.id) ? `${product.name}-г хүслийн жагсаалтаас хасах` : `${product.name}-г хүслийн жагсаалтад нэмэх`}><Heart size={15} /></button>
        <Link href={`/product/${product.slug}`} onClick={() => rememberProduct(product.id)} className="shop-product-link"><div className="shop-product-image">{salePercent ? <span className="shop-sale-badge">-{salePercent}%</span> : null}<img src={product.imageUrl ?? fallbackImage} alt={product.name} /><span className={lowStock ? "is-low-stock" : undefined}>{product.stockQuantity > 0 ? `${product.stockQuantity} ширхэг үлдсэн` : "Нөөц дууссан"}</span><i aria-hidden="true">VIEW</i></div><div className="shop-product-copy"><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h2>{product.name}</h2>{product.reviewCount > 0 ? <span className="shop-product-rating"><Star size={12} fill="#f0b52d" stroke="#f0b52d" /> {product.avgRating?.toFixed(1)} <em>({product.reviewCount})</em></span> : null}<small>{product.shortDescription ?? "Японоос баталгаат бүтээгдэхүүн"}</small><div><div className="shop-product-price-group"><strong>{formatMnt(product.priceMnt)}</strong>{salePercent ? <s>{formatMnt(product.compareAtPriceMnt!)}</s> : null}</div><span><ShoppingBag size={15} /></span></div></div></Link>
        <button type="button" className="quick-view-trigger" onClick={() => openQuickView(product)} aria-label={`${product.name} шуурхай харах`}><Eye size={15} /> Шуурхай харах</button>
      </article>;
      })}</section>{totalPages > 1 ? <nav className="shop-pagination" aria-label="Хуудаслалт">
        <button type="button" onClick={() => { setPage(current => Math.max(1, current - 1)); document.getElementById("shop-product-grid")?.scrollIntoView({ block: "start", behavior: "smooth" }); }} disabled={page === 1}><ChevronLeft size={16} /> Өмнөх</button>
        <span>{page} / {totalPages} хуудас <em>({filtered.length} бүтээгдэхүүн)</em></span>
        <button type="button" onClick={() => { setPage(current => Math.min(totalPages, current + 1)); document.getElementById("shop-product-grid")?.scrollIntoView({ block: "start", behavior: "smooth" }); }} disabled={page === totalPages}>Дараах <ChevronRight size={16} /></button>
      </nav> : null}</> : <section className="shop-status-card" data-reveal><Search size={26} /><h2>Энэ удаа тохирох бүтээгдэхүүн олдсонгүй.</h2><p>Өөр хайлтын үг хэрэглэж үзэх эсвэл бүх ангиллыг дахин хараарай.</p><button type="button" onClick={resetControls}><RotateCcw size={14} /> Шүүлтүүр арилгах</button></section>}
      {isAuthenticated && recommended.data?.length ? <RecommendedForYou products={recommended.data} onRemember={rememberProduct} onQuickView={openQuickView} /> : null}
      {/* A premium site doesn't show a "recently viewed" module with nothing
          in it — that reads as an empty placeholder, not a feature. Only
          render this once the shopper has actually looked at something. */}
      {!catalog.isLoading && !catalog.isError && effectiveRecentIds.length > 0 ? <RecentlyViewed products={recentlyViewed} rememberedCount={effectiveRecentIds.length} onRemember={rememberProduct} onQuickView={openQuickView} /> : null}
    </main>
    <QuickViewDialog open={Boolean(quickViewProduct)} product={quickViewProduct} onOpenChange={open => { if (!open) setQuickViewProduct(null); }} onAdded={() => setCartOpen(true)} />
    <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
  </div>;
}
