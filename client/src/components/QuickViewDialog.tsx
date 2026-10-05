import { Eye, LoaderCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import VariantPicker from "@/components/VariantPicker";
import { notifyAddedToCart } from "@/lib/addedToCartToast";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/hooks/useLocale";
import { useProductName } from "@/hooks/useProductName";
import { translateProductText } from "@shared/product-i18n";
import { getCategoryPlaceholderImage, getSalePercent } from "@shared/catalog-filter";
import { formatMnt } from "@shared/format";

export type QuickViewProduct = {
  id: number;
  slug: string;
  name: string;
  /** Монгол нэр (2026-09-20) — харагдах дараалал shared/product-name.ts. */
  nameMn?: string | null;
  /** Санал болголт v3: яагаад санал болгосон ("Хуурай арьсанд", "Нөхжилт"). */
  reasons?: string[];
  brand?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  stockQuantity: number;
};

type QuickViewDialogProps = {
  open: boolean;
  product: QuickViewProduct | null;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Сагсанд нэмж чадсангүй.";

export default function QuickViewDialog({ open, product, onOpenChange, onAdded }: QuickViewDialogProps) {
  const locale = useLocale();
  const [quantity, setQuantity] = useState(1);
  const utils = trpc.useUtils();
  const detail = trpc.catalog.bySlug.useQuery({ slug: product?.slug ?? "catalog-preview" }, { enabled: open && Boolean(product) });
  const addItem = trpc.cart.addItem.useMutation({
    onSuccess: () => {
      utils.cart.current.invalidate();
      // 2026-09-23: `useProductName()`-ээр (PROJECT-GUIDE: storefront барааны
      // нэрийг зөвхөн түүгээр харуулна). Өмнө нь латин `product.name`-ийг
      // шууд уншдаг тул `mn` горимд toast нь худалдан авагчийн дөнгөж уншсан
      // монгол гарчигнаас өөр нэр дуудаж байв.
      notifyAddedToCart(`${namesRef.current || "Бараа"} сагсанд нэмэгдлээ.`);
      onOpenChange(false);
      onAdded();
    },
    onError: error => toast.error(messageFrom(error)),
  });
  const display = detail.data ?? product;
  const displayName = useProductName();
  const names = display ? displayName(display) : { primary: "", secondary: null };
  // `names` нь mutation-ийн ДАРАА тунхаглагдсан тул onSuccess дотор шууд
  // уншиж болохгүй — ref-ээр дамжуулна (2026-09-23).
  const namesRef = useRef(names.primary);
  namesRef.current = names.primary;
  // PHASE 2 of product variants: same "only when there's an actual choice"
  // rule as ProductDetail -- a single-variant product shows no picker here
  // either.
  const variantsQuery = trpc.catalog.variants.useQuery({ productId: product?.id ?? 0 }, { enabled: open && Boolean(product) });
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);

  useEffect(() => { setQuantity(1); setSelectedVariantId(null); }, [product?.id, open]);
  useEffect(() => {
    if (selectedVariantId !== null) return;
    const variants = variantsQuery.data;
    if (!variants?.length) return;
    // 2026-09-27: default variant дууссан нөөцтэй байвал шууд "Нөөц дууссан"
    // харуулахын оронд эхлээд нөөцтэй default, дараа нь нөөцтэй ямар ч
    // variant сонгоно (ProductDetail.tsx-тэй ижил дараалал).
    const defaultVariant = variants.find(variant => variant.isDefault);
    const preferred = (defaultVariant && defaultVariant.stockQuantity > 0 ? defaultVariant : null)
      ?? variants.find(variant => variant.stockQuantity > 0)
      ?? defaultVariant
      ?? variants[0];
    setSelectedVariantId(preferred.id);
  }, [variantsQuery.data, selectedVariantId]);

  const variants = variantsQuery.data ?? [];
  const hasVariantChoice = variants.length > 1;
  const selectedVariant = variants.find(variant => variant.id === selectedVariantId) ?? null;
  const availableStock = Math.max(0, hasVariantChoice && selectedVariant ? selectedVariant.stockQuantity : display?.stockQuantity ?? 0);
  // 2026-09-23: сонгосон variant (эсвэл түүний нөөц) солигдоход тоог хязгаарт
  // буулгана. Өмнө нь `quantity` зөвхөн `[product?.id, open]` дээр л
  // шинэчлэгддэг тул 20 үлдэгдэлтэй variant дээр 3 болгоод 1 үлдэгдэлтэй
  // variant рүү сэлгэхэд "+" товч хаагддаг ч утга 3 хэвээр үлдэж, "Сагсанд
  // нэмэх" нь серверийн "нөөц хүрэлцэхгүй" алдаанд (production-д ерөнхий
  // INTERNAL мессеж болж маскалагддаг) унадаг байв.
  useEffect(() => {
    setQuantity(current => Math.min(Math.max(1, current), Math.max(1, availableStock)));
  }, [availableStock]);

  const addToCart = () => {
    if (!display) return;
    if (hasVariantChoice && selectedVariant) addItem.mutate({ variantId: selectedVariant.id, quantity });
    else addItem.mutate({ productId: display.id, quantity });
  };

  if (!display) return null;
  const activePriceMnt = hasVariantChoice && selectedVariant ? selectedVariant.priceMnt : display.priceMnt;
  const activeCompareAtPriceMnt = hasVariantChoice && selectedVariant ? selectedVariant.compareAtPriceMnt ?? null : display.compareAtPriceMnt;
  const available = availableStock;
  const description = translateProductText(detail.data?.description ?? display.shortDescription ?? "Японоос албан ёсоор нийлүүлсэн өдөр тутмын арчилгааны сонголт.", locale, display);
  const salePercent = getSalePercent(activePriceMnt, activeCompareAtPriceMnt);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="quick-view-dialog max-h-[calc(100vh-1.5rem)] overflow-y-auto border-0 bg-[#fffdf9] p-0 shadow-[0_28px_100px_rgba(23,24,27,.32)] sm:max-w-3xl" showCloseButton={false}>
    <div className="quick-view-topline"><span><Eye size={14} /> QUICK VIEW</span><button type="button" onClick={() => onOpenChange(false)} aria-label="Хаах">×</button></div>
    <div className="quick-view-layout">
      <div className="quick-view-image"><img src={display.imageUrl ?? getCategoryPlaceholderImage(display.categorySlug)} alt={names.primary} /><span>{available > 0 ? `${available} ширхэг үлдсэн` : "Нөөц дууссан"}</span></div>
      <div className="quick-view-copy">
        <DialogTitle className="font-[var(--font-display)] text-4xl font-semibold tracking-[-.075em] text-[#17181b] sm:text-5xl">{names.primary}</DialogTitle>
        {names.secondary ? <p className="product-name-secondary">{names.secondary}</p> : null}
        <DialogDescription className="mt-2 text-[10px] font-extrabold tracking-[.15em] text-[var(--primary)]">{display.brand ?? display.categoryName ?? "SUGI ASAYAKE"}</DialogDescription>
        <p className="quick-view-description">{detail.isLoading ? "Дэлгэрэнгүй мэдээллийг ачаалж байна…" : description}</p>
        <div className="quick-view-price"><strong>{formatMnt(activePriceMnt)}</strong>{salePercent ? <><s>{formatMnt(activeCompareAtPriceMnt!)}</s><em className="quick-view-sale-badge">-{salePercent}%</em></> : <span>НӨАТ багтсан</span>}</div>
        {hasVariantChoice ? <VariantPicker variants={variants} selectedId={selectedVariantId} onSelect={setSelectedVariantId} className="mb-5" /> : null}
        <div className="quick-view-actions">
          <div className="quick-view-quantity" aria-label="Тоо сонгох"><button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Тоо хасах"><Minus size={15} /></button><span>{quantity}</span><button type="button" disabled={quantity >= available} onClick={() => setQuantity(value => Math.min(available, value + 1))} aria-label="Тоо нэмэх"><Plus size={15} /></button></div>
          <button type="button" disabled={available === 0 || quantity > available || addItem.isPending} onClick={addToCart} className="quick-view-add">{addItem.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ShoppingBag size={17} />} {available === 0 ? "Нөөц дууссан" : "Сагсанд нэмэх"}</button>
        </div>
        <Link href={`/product/${display.slug}`} onClick={() => onOpenChange(false)} className="quick-view-detail-link">Бүтэн мэдээлэл харах <span>↗</span></Link>
      </div>
    </div>
  </DialogContent></Dialog>;
}
