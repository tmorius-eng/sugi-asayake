import { Eye, LoaderCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import VariantPicker from "@/components/VariantPicker";
import { trpc } from "@/lib/trpc";
import { getCategoryPlaceholderImage, getSalePercent } from "@shared/catalog-filter";
import { formatMnt } from "@shared/format";

export type QuickViewProduct = {
  id: number;
  slug: string;
  name: string;
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
  const [quantity, setQuantity] = useState(1);
  const utils = trpc.useUtils();
  const detail = trpc.catalog.bySlug.useQuery({ slug: product?.slug ?? "catalog-preview" }, { enabled: open && Boolean(product) });
  const addItem = trpc.cart.addItem.useMutation({
    onSuccess: () => {
      utils.cart.current.invalidate();
      toast.success("Сагсанд нэмэгдлээ.");
      onOpenChange(false);
      onAdded();
    },
    onError: error => toast.error(messageFrom(error)),
  });
  const display = detail.data ?? product;
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
    setSelectedVariantId((variants.find(variant => variant.isDefault) ?? variants[0]).id);
  }, [variantsQuery.data, selectedVariantId]);

  const variants = variantsQuery.data ?? [];
  const hasVariantChoice = variants.length > 1;
  const selectedVariant = variants.find(variant => variant.id === selectedVariantId) ?? null;

  const addToCart = () => {
    if (!display) return;
    if (hasVariantChoice && selectedVariant) addItem.mutate({ variantId: selectedVariant.id, quantity });
    else addItem.mutate({ productId: display.id, quantity });
  };

  if (!display) return null;
  const activePriceMnt = hasVariantChoice && selectedVariant ? selectedVariant.priceMnt : display.priceMnt;
  const activeCompareAtPriceMnt = hasVariantChoice && selectedVariant ? selectedVariant.compareAtPriceMnt ?? null : display.compareAtPriceMnt;
  const activeStockQuantity = hasVariantChoice && selectedVariant ? selectedVariant.stockQuantity : display.stockQuantity;
  const available = Math.max(0, activeStockQuantity);
  const description = detail.data?.description ?? display.shortDescription ?? "Японоос албан ёсоор нийлүүлсэн өдөр тутмын арчилгааны сонголт.";
  const salePercent = getSalePercent(activePriceMnt, activeCompareAtPriceMnt);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="quick-view-dialog max-h-[calc(100vh-1.5rem)] overflow-y-auto border-0 bg-[#fffdf9] p-0 shadow-[0_28px_100px_rgba(23,24,27,.32)] sm:max-w-3xl" showCloseButton={false}>
    <div className="quick-view-topline"><span><Eye size={14} /> QUICK VIEW</span><button type="button" onClick={() => onOpenChange(false)} aria-label="Хаах">×</button></div>
    <div className="quick-view-layout">
      <div className="quick-view-image"><img src={display.imageUrl ?? getCategoryPlaceholderImage(display.categorySlug)} alt={display.name} /><span>{available > 0 ? `${available} ширхэг үлдсэн` : "Нөөц дууссан"}</span></div>
      <div className="quick-view-copy">
        <DialogTitle className="font-[var(--font-display)] text-4xl font-semibold tracking-[-.075em] text-[#17181b] sm:text-5xl">{display.name}</DialogTitle>
        <DialogDescription className="mt-2 text-[10px] font-extrabold tracking-[.15em] text-[#df1f3d]">{display.brand ?? display.categoryName ?? "SUGI ASAYAKE"}</DialogDescription>
        <p className="quick-view-description">{detail.isLoading ? "Дэлгэрэнгүй мэдээллийг ачаалж байна…" : description}</p>
        <div className="quick-view-price"><strong>{formatMnt(activePriceMnt)}</strong>{salePercent ? <><s>{formatMnt(activeCompareAtPriceMnt!)}</s><em className="quick-view-sale-badge">-{salePercent}%</em></> : <span>НӨАТ багтсан</span>}</div>
        {hasVariantChoice ? <VariantPicker variants={variants} selectedId={selectedVariantId} onSelect={setSelectedVariantId} className="mb-5" /> : null}
        <div className="quick-view-actions">
          <div className="quick-view-quantity" aria-label="Тоо сонгох"><button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Тоо хасах"><Minus size={15} /></button><span>{quantity}</span><button type="button" disabled={quantity >= available} onClick={() => setQuantity(value => Math.min(available, value + 1))} aria-label="Тоо нэмэх"><Plus size={15} /></button></div>
          <button type="button" disabled={available === 0 || addItem.isPending} onClick={addToCart} className="quick-view-add">{addItem.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ShoppingBag size={17} />} {available === 0 ? "Нөөц дууссан" : "Сагсанд нэмэх"}</button>
        </div>
        <Link href={`/product/${display.slug}`} onClick={() => onOpenChange(false)} className="quick-view-detail-link">Бүтэн мэдээлэл харах <span>↗</span></Link>
      </div>
    </div>
  </DialogContent></Dialog>;
}
