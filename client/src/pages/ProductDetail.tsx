import { useMemo, useState } from "react";
import { BadgeCheck, ChevronRight, LoaderCircle, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

const previewGallery = ["/manus-storage/sugi-professional-assortment_74fa4e31.jpg", "/manus-storage/sugi-professional-hero_d1a42bb9.jpg", "/manus-storage/sugi-care-retail_e5616f81.jpg"];
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Сагсанд нэмж чадсангүй.";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const productQuery = trpc.catalog.bySlug.useQuery({ slug: params?.slug ?? "hada-labo-gokujyun-lotion" });
  const cartQuery = trpc.cart.current.useQuery(undefined, { enabled: isAuthenticated });
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
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto grid min-h-[60vh] max-w-7xl place-items-center px-4 sm:px-8"><LoaderCircle className="animate-spin text-[#df1f3d]" size={28} aria-label="Бүтээгдэхүүнийг ачаалж байна" /></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }

  if (productQuery.isError || !product) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto grid min-h-[62vh] max-w-3xl place-items-center px-4 py-12 sm:px-8"><section className="w-full rounded-[2rem] border border-black/8 bg-white p-8 text-center shadow-[0_18px_55px_rgba(44,39,32,.08)] sm:p-12"><p className="text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]">CATALOG NOTICE</p><h1 className="mt-4 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">Бүтээгдэхүүн олдсонгүй.</h1><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[#67686c]">Таны хайсан бүтээгдэхүүн одоогоор нийтлэгдээгүй, эсвэл холбоос өөрчлөгдсөн байж болно. Манай каталогоос бусад сонголтыг хараарай.</p><Link href="/#products" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">Бүтээгдэхүүнүүдийг харах</Link></section></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }
  const display = product;
  const currentImage = gallery[Math.min(activeImage, Math.max(0, gallery.length - 1))] ?? previewGallery[0];

  const addToCart = () => {
    if (!isAuthenticated) { toast.message("Нэвтрэх шаардлагатай", { description: "Сагсаа хадгалахын тулд нэвтэрнэ үү." }); startLogin(); return; }
    addItem.mutate({ productId: product.id, quantity });
  };

  return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12"><p className="mb-7 text-[10px] font-extrabold tracking-[.16em] text-[#85868a]">ДЭЛГҮҮР <ChevronRight className="mx-1 inline size-3" /> {display.categoryName ?? "АРЬС АРЧИЛГАА"} <ChevronRight className="mx-1 inline size-3" /> {display.brand ?? "SUGI ASAYAKE"}</p><div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-16"><div><div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[#e9f0f2]"><span className="absolute left-0 top-8 z-10 bg-[#f0b52d] px-5 py-2 text-[10px] font-extrabold tracking-[.18em] text-[#17181b]">01 / CARE SELECTION</span><img src={currentImage} alt={display.name} className="h-full w-full object-cover" /></div><div className="mt-4 grid grid-cols-3 gap-3">{gallery.map((image, index) => <button type="button" key={image} onClick={() => setActiveImage(index)} className={`aspect-square overflow-hidden rounded-2xl border-2 transition ${activeImage === index ? "border-[#df1f3d]" : "border-transparent opacity-70 hover:opacity-100"}`} aria-label={`${index + 1} дэх зургийг харах`}><img src={image} alt="" className="h-full w-full object-cover" /></button>)}</div></div><section className="max-w-xl pt-4 lg:pt-10"><p className="flex items-center gap-3 text-[10px] font-extrabold tracking-[.18em] text-[#df1f3d]"><span className="h-px w-10 bg-[#df1f3d]" />01 / {display.brand ?? "SUGI ASAYAKE"}</p><h1 className="mt-3 font-[var(--font-display)] text-5xl font-semibold tracking-[-.085em] sm:text-6xl">{display.name}</h1><p className="mt-6 text-base leading-7 text-[#66676b]">{display.description ?? display.shortDescription}</p><div className="my-8 border-y border-black/10 py-6"><div className="flex items-end gap-3"><strong className="font-[var(--font-display)] text-4xl tracking-[-.08em]">{formatMnt(display.priceMnt)}</strong><span className="pb-1 text-xs text-[#808186]">НӨАТ багтсан</span></div></div><div className="flex flex-wrap items-center gap-4"><div className="inline-flex items-center rounded-full border border-black/12 bg-white"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="grid size-11 place-items-center" aria-label="Тоо хасах"><Minus size={16} /></button><span className="grid min-w-10 place-items-center font-bold">{quantity}</span><button type="button" disabled={quantity >= product.stockQuantity} onClick={() => setQuantity(quantity + 1)} className="grid size-11 place-items-center disabled:opacity-40" aria-label="Тоо нэмэх"><Plus size={16} /></button></div><button type="button" disabled={addItem.isPending || product.stockQuantity === 0} onClick={addToCart} className="min-h-12 flex-1 rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55">{addItem.isPending ? <LoaderCircle className="mx-auto animate-spin" size={17} /> : product.stockQuantity === 0 ? "Нөөц дууссан" : `Сагсанд нэмэх — ${formatMnt(display.priceMnt * quantity)}`}</button></div><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="flex gap-3 rounded-2xl bg-white p-4"><Truck className="shrink-0 text-[#df1f3d]" size={19} /><p className="text-xs leading-5"><strong className="block text-[#17181b]">УБ хүргэлт</strong><span className="text-[#75767b]">24–48 цагийн дотор</span></p></div><div className="flex gap-3 rounded-2xl bg-white p-4"><ShieldCheck className="shrink-0 text-[#df1f3d]" size={19} /><p className="text-xs leading-5"><strong className="block text-[#17181b]">Албан ёсны баталгаа</strong><span className="text-[#75767b]">SUGI Drug Store Japan</span></p></div></div><div className="mt-10 rounded-2xl border border-black/8 bg-[#eef3f1] p-6"><div className="flex items-center gap-2 text-xs font-bold text-[#df1f3d]"><BadgeCheck size={16} /> Хэрэглэх зөвлөмж</div><p className="mt-3 text-sm leading-6 text-[#65666b]">Бүтээгдэхүүний дэлгэрэнгүй тайлбар, хэрэглээний зааврыг Admin хэсгээс оруулж шинэчилж болно.</p></div></section></div></main><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
}
