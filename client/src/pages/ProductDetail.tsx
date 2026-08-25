import { useMemo, useState } from "react";
import { BadgeCheck, ChevronRight, ListChecks, LoaderCircle, Minus, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Star, Truck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import GlossaryText from "@/components/GlossaryText";
import ImageLightbox from "@/components/ImageLightbox";
import { LineSkeleton, Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getSalePercent, LOW_STOCK_THRESHOLD } from "@shared/catalog-filter";
import { UB_DELIVERY_FEE_MNT } from "@shared/const";

// A product with no uploaded photos at all falls back to just this one
// placeholder tile -- not a 3-item fake "gallery" of stock photography.
const previewGallery = ["/product-placeholder.svg"];
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Сагсанд нэмж чадсангүй.";
const reviewMessageFrom = (error: unknown) => error instanceof Error ? error.message : "Сэтгэгдэл илгээж чадсангүй.";

// PREMIUM-FEATURES.md TIER 2: shared star-rating glyph — used both for the
// read-only average (product header, review cards) and the interactive
// 1-5 picker in the review form below.
function StarRating({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return <span className="inline-flex items-center gap-0.5" aria-label={`${value} од`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} fill={n <= rounded ? "#f0b52d" : "none"} stroke={n <= rounded ? "#f0b52d" : "#c7c8cc"} />)}</span>;
}

// PREMIUM-FEATURES.md TIER 4: "Хамт авбал тохирно" / "Routine-оо дуусга" —
// shown only when this product is actually a step of a published routine.
function RoutineCrossSell({ productId }: { productId: number }) {
  const utils = trpc.useUtils();
  const routineQuery = trpc.routines.forProduct.useQuery({ productId });
  const addItem = trpc.cart.addItem.useMutation({
    onSuccess: () => { utils.cart.current.invalidate(); toast.success("Сагсанд нэмэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const routine = routineQuery.data;
  if (!routine) return null;
  const otherSteps = routine.steps.filter(step => step.productId !== productId);
  if (!otherSteps.length) return null;

  return <section className="mt-10 rounded-2xl border border-[#df1f3d]/20 bg-[#fff8f4] p-6">
    <p className="flex items-center gap-2 text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]"><ListChecks size={14} /> ROUTINE-ОО ДУУСГА</p>
    <h3 className="mt-2 font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">Хамт авбал тохирно</h3>
    <p className="mt-2 text-xs leading-5 text-[#75767b]">Энэ бүтээгдэхүүн <Link href={`/routine/${routine.slug}`} className="font-bold text-[#df1f3d] hover:underline">"{routine.name}"</Link> арчилгааны дараалалд багтдаг.{routine.discountPercent > 0 ? ` Бүгдийг хамт авбал -${routine.discountPercent}% хямдралтай.` : ""}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {otherSteps.map(step => <div key={step.id} className="flex items-center gap-3 rounded-xl bg-white p-3">
        <Link href={`/product/${step.slug}`} className="flex min-w-0 flex-1 items-center gap-3"><img src={step.imageUrl ?? previewGallery[0]} alt={step.name} className="size-12 shrink-0 rounded-lg object-cover" /><span className="min-w-0"><span className="block text-[10px] font-bold text-[#df1f3d]">{step.stepLabel}</span><strong className="block truncate text-xs">{step.name}</strong><span className="text-[11px] text-[#75767b]">{formatMnt(step.priceMnt)}</span></span></Link>
        <button type="button" disabled={addItem.isPending || step.stockQuantity === 0} onClick={() => addItem.mutate({ productId: step.productId, quantity: 1 })} className="shrink-0 rounded-full bg-[#17181b] p-2.5 text-white transition hover:bg-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`${step.name} сагслах`}><ShoppingBag size={14} /></button>
      </div>)}
    </div>
    <Link href={`/routine/${routine.slug}`} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#df1f3d] hover:underline"><Sparkles size={14} /> Бүтэн routine-г үзэх</Link>
  </section>;
}

function ReviewsSection({ productId }: { productId: number }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const reviewsQuery = trpc.reviews.list.useQuery({ productId });
  const eligibilityQuery = trpc.reviews.eligibility.useQuery({ productId }, { enabled: isAuthenticated });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const createReview = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("Сэтгэгдэл нийтлэгдлээ. Баярлалаа!");
      setComment("");
      setRating(5);
      utils.reviews.list.invalidate({ productId });
      utils.reviews.eligibility.invalidate({ productId });
      utils.catalog.bySlug.invalidate();
      utils.catalog.list.invalidate();
    },
    onError: error => toast.error(reviewMessageFrom(error)),
  });
  const reviews = reviewsQuery.data ?? [];
  const eligibility = eligibilityQuery.data;

  return <section className="mt-16 border-t border-black/10 pt-10">
    <h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-[-.06em]">Хэрэглэгчийн сэтгэгдэл{reviews.length ? ` (${reviews.length})` : ""}</h2>
    {reviewsQuery.isLoading ? <p className="mt-4 text-sm text-[#9a9ba0]">Ачааллаж байна...</p> : reviews.length === 0 ? <p className="mt-4 text-sm text-[#75767b]">Одоогоор сэтгэгдэл байхгүй байна. Эхний сэтгэгдлийг та үлдээгээрэй!</p> : <div className="mt-6 grid gap-4">{reviews.map(review => <article key={review.id} className="rounded-2xl bg-white p-5"><div className="flex items-center justify-between gap-3"><StarRating value={review.rating} /><span className="text-[11px] text-[#9a9ba0]">{new Date(review.createdAt).toLocaleDateString("mn-MN")}</span></div><p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-[#17181b]">{review.reviewerName ?? "Хэрэглэгч"}<span className="inline-flex items-center gap-1 rounded-full bg-[#eaf6ef] px-2 py-0.5 text-[10px] font-extrabold text-[#1f8a54]"><BadgeCheck size={12} /> Баталгаажсан худалдан авалт</span></p>{review.comment ? <p className="mt-2 text-sm leading-6 text-[#5c5d61]">{review.comment}</p> : null}</article>)}</div>}

    {!isAuthenticated ? <p className="mt-7 text-sm text-[#75767b]"><Link href="/login" className="font-bold text-[#df1f3d]">Нэвтэрч</Link> сэтгэгдэл үлдээгээрэй.</p>
      : eligibility?.canReview ? <form onSubmit={event => { event.preventDefault(); createReview.mutate({ productId, rating, comment: comment.trim() || null }); }} className="mt-8 max-w-lg rounded-2xl border border-black/10 bg-[#f8f5ef] p-6">
        <p className="text-sm font-bold text-[#17181b]">Сэтгэгдэл үлдээх</p>
        <div className="mt-3 flex items-center gap-1">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} од өгөх`} aria-pressed={rating === n}><Star size={24} fill={n <= rating ? "#f0b52d" : "none"} stroke={n <= rating ? "#f0b52d" : "#c7c8cc"} /></button>)}</div>
        <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={3} placeholder="Бүтээгдэхүүний талаарх сэтгэгдлээ бичнэ үү (заавал биш)" className="mt-3 w-full rounded-xl border border-black/12 bg-white p-3 text-sm outline-none focus:border-[#df1f3d]" />
        <button type="submit" disabled={createReview.isPending} className="mt-3 min-h-11 rounded-full bg-[#df1f3d] px-6 text-xs font-bold text-white transition hover:bg-[#bc1732] disabled:cursor-not-allowed disabled:opacity-55">{createReview.isPending ? <LoaderCircle className="mx-auto animate-spin" size={15} /> : "Нийтлэх"}</button>
      </form>
      : eligibility?.alreadyReviewed ? <p className="mt-7 text-sm text-[#75767b]">Та энэ бүтээгдэхүүнд сэтгэгдэл бичсэн байна. Баярлалаа!</p>
      : eligibilityQuery.isSuccess ? <p className="mt-7 text-sm text-[#75767b]">Зөвхөн энэ бүтээгдэхүүнийг захиалсан хэрэглэгч сэтгэгдэл бичих боломжтой.</p>
      : null}
  </section>;
}

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const utils = trpc.useUtils();
  const productQuery = trpc.catalog.bySlug.useQuery({ slug: params?.slug ?? "hada-labo-gokujyun-lotion" });
  const cartQuery = trpc.cart.current.useQuery();
  const addItem = trpc.cart.addItem.useMutation({ onSuccess: () => { utils.cart.current.invalidate(); setCartOpen(true); }, onError: error => toast.error(messageFrom(error)) });
  const product = productQuery.data;
  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  // NOTE: this hook must run on every render (loading/error/success alike) —
  // React requires the same hooks in the same order every time. Computing it
  // here, before any early `return`, is what fixes the
  // "Rendered more hooks than during the previous render" crash.
  const gallery = useMemo(() => {
    if (!product) return previewGallery;
    try {
      const saved = product.galleryJson ? JSON.parse(product.galleryJson) : [];
      return Array.from(new Set([product.imageUrl, ...(Array.isArray(saved) ? saved : [])].filter((image): image is string => typeof image === "string" && image.length > 0))).slice(0, 6).concat(product.imageUrl ? [] : previewGallery.slice(0, 1));
    } catch { return product.imageUrl ? [product.imageUrl] : previewGallery; }
  }, [product]);

  if (productQuery.isLoading) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12" aria-busy="true" aria-label="Бүтээгдэхүүнийг ачаалж байна"><div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-16"><div><Skeleton className="aspect-[4/5] w-full rounded-3xl" /><div className="mt-4 grid grid-cols-3 gap-3">{[0, 1, 2].map(index => <Skeleton key={index} className="aspect-square rounded-2xl" />)}</div></div><section className="max-w-xl pt-4 lg:pt-10"><LineSkeleton width="30%" height="10px" /><Skeleton style={{ width: "80%", height: "52px", marginTop: "14px" }} /><LineSkeleton width="95%" style={{ marginTop: "26px" }} /><LineSkeleton width="70%" style={{ marginTop: "10px" }} /><Skeleton style={{ width: "45%", height: "40px", marginTop: "26px" }} /><Skeleton style={{ width: "100%", height: "48px", marginTop: "26px", borderRadius: "999px" }} /></section></div></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }

  if (productQuery.isError || !product) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto grid min-h-[62vh] max-w-3xl place-items-center px-4 py-12 sm:px-8"><section className="w-full rounded-[2rem] border border-black/8 bg-white p-8 text-center shadow-[0_18px_55px_rgba(44,39,32,.08)] sm:p-12"><p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">CATALOG NOTICE</p><h1 className="mt-4 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">Бүтээгдэхүүн олдсонгүй.</h1><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[#67686c]">Таны хайсан бүтээгдэхүүн одоогоор нийтлэгдээгүй, эсвэл холбоос өөрчлөгдсөн байж болно. Манай каталогоос бусад сонголтыг хараарай.</p><Link href="/#products" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">Бүтээгдэхүүнүүдийг харах</Link></section></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }
  const display = product;
  const currentImage = gallery[Math.min(activeImage, Math.max(0, gallery.length - 1))] ?? previewGallery[0];
  const salePercent = getSalePercent(display.priceMnt, display.compareAtPriceMnt);
  const lowStock = display.stockQuantity > 0 && display.stockQuantity <= LOW_STOCK_THRESHOLD;

  const addToCart = () => {
    addItem.mutate({ productId: product.id, quantity });
  };

  return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12"><p className="mb-7 text-[10px] font-extrabold tracking-[.16em] text-[#85868a]">ДЭЛГҮҮР <ChevronRight className="mx-1 inline size-3" /> {display.categoryName ?? "АРЬС АРЧИЛГАА"} <ChevronRight className="mx-1 inline size-3" /> {display.brand ?? "SUGI ASAYAKE"}</p><div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-16"><div><div className="product-gallery-main relative aspect-[4/5] overflow-hidden rounded-3xl bg-[#e9f0f2]" onClick={() => setLightboxOpen(true)}><span className="absolute left-0 top-8 z-10 bg-[#f0b52d] px-5 py-2 text-[10px] font-extrabold tracking-[.18em] text-[#17181b]">01 / CARE SELECTION</span><img src={currentImage} alt={display.name} className="h-full w-full object-cover" /><button type="button" className="product-image-zoom-trigger" onClick={event => { event.stopPropagation(); setLightboxOpen(true); }} aria-label="Зургийг томруулж харах"><Search size={17} /></button></div><ImageLightbox images={gallery} index={Math.min(activeImage, Math.max(0, gallery.length - 1))} onIndexChange={setActiveImage} open={lightboxOpen} onOpenChange={setLightboxOpen} alt={display.name} /><div className="mt-4 grid grid-cols-3 gap-3">{gallery.map((image, index) => <button type="button" key={image} onClick={() => setActiveImage(index)} className={`aspect-square overflow-hidden rounded-2xl border-2 transition ${activeImage === index ? "border-[#df1f3d]" : "border-transparent opacity-70 hover:opacity-100"}`} aria-label={`${index + 1} дэх зургийг харах`}><img src={image} alt="" className="h-full w-full object-cover" /></button>)}</div></div><section className="max-w-xl pt-4 lg:pt-10"><p className="flex items-center gap-3 text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]"><span className="h-px w-10 bg-[#df1f3d]" />01 / {display.brand ?? "SUGI ASAYAKE"}</p><h1 className="mt-3 font-[var(--font-display)] text-5xl font-semibold tracking-[-.085em] sm:text-6xl">{display.name}</h1>{display.reviewCount > 0 ? <div className="mt-3 flex items-center gap-2"><StarRating value={display.avgRating ?? 0} /><span className="text-xs font-bold text-[#55565b]">{display.avgRating?.toFixed(1)}</span><span className="text-xs text-[#9a9ba0]">({display.reviewCount} сэтгэгдэл)</span></div> : null}<p className="mt-6 text-base leading-7 text-[#66676b]"><GlossaryText text={display.description ?? display.shortDescription} /></p><div className="my-8 border-y border-black/10 py-6"><div className="flex flex-wrap items-end gap-3"><strong className="font-[var(--font-display)] text-4xl tracking-[-.08em]">{formatMnt(display.priceMnt)}</strong>{salePercent ? <><s className="pb-1 text-lg text-[#a5a6ab]">{formatMnt(display.compareAtPriceMnt!)}</s><span className="mb-1 rounded-full bg-[#df1f3d] px-2.5 py-1 text-[11px] font-extrabold text-white">-{salePercent}%</span></> : <span className="pb-1 text-xs text-[#808186]">НӨАТ багтсан</span>}</div>{lowStock ? <p className="mt-3 text-xs font-bold text-[#df1f3d]">Зөвхөн {display.stockQuantity} ширхэг үлдсэн — удахгүй дуусна!</p> : null}</div><div className="flex flex-wrap items-center gap-4"><div className="inline-flex items-center rounded-full border border-black/12 bg-white"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="grid size-11 place-items-center" aria-label="Тоо хасах"><Minus size={16} /></button><span className="grid min-w-10 place-items-center font-bold">{quantity}</span><button type="button" disabled={quantity >= product.stockQuantity} onClick={() => setQuantity(quantity + 1)} className="grid size-11 place-items-center disabled:opacity-40" aria-label="Тоо нэмэх"><Plus size={16} /></button></div><button type="button" disabled={addItem.isPending || product.stockQuantity === 0} onClick={addToCart} className="min-h-12 flex-1 rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55">{addItem.isPending ? <LoaderCircle className="mx-auto animate-spin" size={17} /> : product.stockQuantity === 0 ? "Нөөц дууссан" : `Сагсанд нэмэх — ${formatMnt(display.priceMnt * quantity)}`}</button></div><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="flex gap-3 rounded-2xl bg-white p-4"><Truck className="shrink-0 text-[#df1f3d]" size={19} /><p className="text-xs leading-5"><strong className="block text-[#17181b]">УБ хүргэлт — {formatMnt(UB_DELIVERY_FEE_MNT)}</strong><span className="text-[#75767b]">24–48 цагийн дотор · Салбараас үнэгүй авах</span></p></div><div className="flex gap-3 rounded-2xl bg-white p-4"><ShieldCheck className="shrink-0 text-[#df1f3d]" size={19} /><p className="text-xs leading-5"><strong className="block text-[#17181b]">Албан ёсны баталгаа</strong><span className="text-[#75767b]">SUGI Drug Store Japan</span></p></div></div><div className="mt-10 rounded-2xl border border-black/8 bg-[#eef3f1] p-6"><div className="flex items-center gap-2 text-xs font-bold text-[#df1f3d]"><BadgeCheck size={16} /> Хэрэглэх зөвлөмж</div><p className="mt-3 text-sm leading-6 text-[#65666b]">Бүтээгдэхүүний дэлгэрэнгүй тайлбар, хэрэглээний зааврыг Admin хэсгээс оруулж шинэчилж болно.</p></div></section></div><RoutineCrossSell productId={product.id} /><ReviewsSection productId={product.id} /></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
}
