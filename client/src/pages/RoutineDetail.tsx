import { useState } from "react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { BadgeCheck, ChevronRight, LoaderCircle, ShoppingBag, Sparkles } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import { notifyAddedToCart } from "@/lib/addedToCartToast";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

// PREMIUM-FEATURES.md TIER 4: customer-facing Routine (bundle) detail page.
const fallbackImage = "/product-placeholder.svg";

export default function RoutineDetail() {
  useDocumentMeta("Арчилгааны багц — SUGI ASAYAKE", null);
  const [, params] = useRoute("/routine/:slug");
  const [cartOpen, setCartOpen] = useState(false);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const utils = trpc.useUtils();
  const routineQuery = trpc.routines.bySlug.useQuery({ slug: params?.slug ?? "" }, { enabled: Boolean(params?.slug) });
  const cartQuery = trpc.cart.current.useQuery();
  const addItem = trpc.cart.addItem.useMutation();
  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const routine = routineQuery.data;

  if (routineQuery.isLoading) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto grid min-h-[60vh] max-w-7xl place-items-center px-4 sm:px-8"><LoaderCircle className="animate-spin text-[#df1f3d]" size={28} aria-label="Routine ачаалж байна" /></main><SiteFooter /><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }

  if (routineQuery.isError || !routine) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto grid min-h-[62vh] max-w-3xl place-items-center px-4 py-12 sm:px-8"><section className="w-full rounded-[2rem] border border-black/8 bg-white p-8 text-center shadow-[0_18px_55px_rgba(44,39,32,.08)] sm:p-12"><p className="text-[10px] font-extrabold tracking-[.18em] text-[#c81b34]">ROUTINE NOTICE</p><h1 className="mt-4 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">Routine олдсонгүй.</h1><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[#67686c]">Таны хайсан routine одоогоор нийтлэгдээгүй, эсвэл холбоос өөрчлөгдсөн байж болно.</p><Link href="/shop" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white! transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">Дэлгүүр рүү очих</Link></section></main><SiteFooter /><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
  }

  const originalTotalMnt = routine.steps.reduce((sum, step) => sum + step.priceMnt, 0);
  const bundlePriceMnt = Math.round(originalTotalMnt * (100 - routine.discountPercent) / 100);
  const savingsMnt = originalTotalMnt - bundlePriceMnt;
  const heroImage = routine.steps.find(step => step.imageUrl)?.imageUrl ?? fallbackImage;
  const allOutOfStock = routine.steps.every(step => step.stockQuantity === 0);

  const addAllToCart = async () => {
    setIsAddingAll(true);
    let added = 0;
    let skipped = 0;
    for (const step of routine.steps) {
      if (step.stockQuantity === 0) { skipped++; continue; }
      try {
        await addItem.mutateAsync({ productId: step.productId, quantity: 1 });
        added++;
      } catch {
        skipped++;
      }
    }
    setIsAddingAll(false);
    await utils.cart.current.invalidate();
    if (added > 0) {
      notifyAddedToCart(skipped > 0 ? `${added} бараа сагсанд орлоо (${skipped} нөөцгүй тул алгассан).` : `Бүх ${added} бараа сагсанд орлоо.`);
      setCartOpen(true);
    } else {
      toast.error("Одоогоор бүх бараа нөөцгүй байна.");
    }
  };

  return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE дэлгүүр" /><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <p className="mb-7 text-[10px] font-extrabold tracking-[.16em] text-[#85868a]">ДЭЛГҮҮР <ChevronRight className="mx-1 inline size-3" /> ROUTINE <ChevronRight className="mx-1 inline size-3" /> {routine.name}</p>
    <div className="grid gap-10 lg:grid-cols-[1fr_.85fr] lg:gap-14">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#e9f0f2]"><span className="absolute left-0 top-8 z-10 bg-[#f0b52d] px-5 py-2 text-[10px] font-extrabold tracking-[.18em] text-[#17181b]">ROUTINE / {routine.steps.length} АЛХАМ</span><img src={heroImage} alt={routine.name} className="h-full w-full object-cover" /></div>
      <section>
        <p className="flex items-center gap-3 text-[10px] font-extrabold tracking-[.18em] text-[#c81b34]"><span className="h-px w-10 bg-[#df1f3d]" />ARCHILGAANY DARAALAL</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.07em] sm:text-5xl">{routine.name}</h1>
        {routine.description && <p className="mt-5 text-sm leading-6 text-[#66676b]">{routine.description}</p>}

        <div className="my-7 border-y border-black/10 py-6">
          <div className="flex items-end gap-3"><strong className="font-[var(--font-display)] text-4xl tracking-[-.08em]">{formatMnt(routine.discountPercent > 0 ? bundlePriceMnt : originalTotalMnt)}</strong>{routine.discountPercent > 0 && <span className="pb-1 text-sm text-[#a9a49a] line-through">{formatMnt(originalTotalMnt)}</span>}</div>
          {routine.discountPercent > 0 && <p className="mt-2 flex items-center gap-2 text-xs font-bold text-[#2c7650]"><Sparkles size={13} /> Багцаар авбал -{routine.discountPercent}% ({formatMnt(savingsMnt)} хэмнэнэ)</p>}
          {routine.discountPercent > 0 && <p className="mt-2 text-[11px] leading-5 text-[#9a9ba0]">Хямдрал нь захиалга баталгаажуулах үед, сагсанд routine-ийн бүх бараа байгаа тохиолдолд автоматаар тооцогдоно.</p>}
        </div>

        <button type="button" disabled={isAddingAll || allOutOfStock} onClick={addAllToCart} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55">{isAddingAll ? <LoaderCircle className="animate-spin" size={17} /> : <ShoppingBag size={17} />}{allOutOfStock ? "Нөөц дууссан" : "Бүгдийг сагслах"}</button>
      </section>
    </div>

    <section className="mt-14">
      <h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-[-.06em]">Арчилгааны алхамууд</h2>
      <div className="mt-6 grid gap-4">
        {routine.steps.map((step, index) => <Link key={step.id} href={`/product/${step.slug}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(20,22,24,.08)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#17181b] text-xs font-bold text-white">{index + 1}</span>
          <img src={step.imageUrl ?? fallbackImage} alt={step.name} className="size-16 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold tracking-[.1em] text-[#c81b34]">{step.stepLabel.toUpperCase()}</p><strong className="mt-1 block truncate text-sm">{step.name}</strong>{step.stockQuantity === 0 && <span className="mt-1 inline-block text-[10px] font-bold text-[#a51630]">Нөөц дууссан</span>}</div>
          <strong className="shrink-0 text-base">{formatMnt(step.priceMnt)}</strong>
        </Link>)}
      </div>
    </section>

    <div className="mt-10 rounded-2xl border border-black/8 bg-[#eef3f1] p-6"><div className="flex items-center gap-2 text-xs font-bold text-[#df1f3d]"><BadgeCheck size={16} /> Routine-ийн тухай</div><p className="mt-3 text-sm leading-6 text-[#65666b]">Энэхүү арчилгааны дараалал нь SUGI ASAYAKE-ийн сонгосон бүтээгдэхүүнүүдээс бүрдэнэ. Алхам бүрийг дараалан хэрэглэхийг зөвлөж байна.</p></div>
  </main><SiteFooter /><CartDrawer open={cartOpen} onOpenChange={setCartOpen} /></div>;
}
