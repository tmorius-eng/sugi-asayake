import { Eye, LoaderCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export type QuickViewProduct = {
  id: number;
  slug: string;
  name: string;
  brand?: string | null;
  categoryName?: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
  priceMnt: number;
  stockQuantity: number;
};

type QuickViewDialogProps = {
  open: boolean;
  product: QuickViewProduct | null;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
};

const fallbackImage = "/manus-storage/sugi-professional-assortment_74fa4e31.jpg";
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Сагсанд нэмж чадсангүй.";

export default function QuickViewDialog({ open, product, onOpenChange, onAdded }: QuickViewDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const { isAuthenticated } = useAuth();
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

  useEffect(() => { setQuantity(1); }, [product?.id, open]);

  const addToCart = () => {
    if (!display) return;
    if (!isAuthenticated) {
      toast.message("Нэвтрэх шаардлагатай", { description: "Сагсаа хадгалахын тулд нэвтэрнэ үү." });
      startLogin();
      return;
    }
    addItem.mutate({ productId: display.id, quantity });
  };

  if (!display) return null;
  const available = Math.max(0, display.stockQuantity);
  const description = detail.data?.description ?? display.shortDescription ?? "Японоос албан ёсоор нийлүүлсэн өдөр тутмын арчилгааны сонголт.";

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="quick-view-dialog max-h-[calc(100vh-1.5rem)] overflow-y-auto border-0 bg-[#fffdf9] p-0 shadow-[0_28px_100px_rgba(23,24,27,.32)] sm:max-w-3xl" showCloseButton={false}>
    <div className="quick-view-topline"><span><Eye size={14} /> QUICK VIEW</span><button type="button" onClick={() => onOpenChange(false)} aria-label="Хаах">×</button></div>
    <div className="quick-view-layout">
      <div className="quick-view-image"><img src={display.imageUrl ?? fallbackImage} alt={display.name} /><span>{available > 0 ? `${available} ширхэг үлдсэн` : "Нөөц дууссан"}</span></div>
      <div className="quick-view-copy">
        <DialogTitle className="font-[var(--font-display)] text-4xl font-semibold tracking-[-.075em] text-[#17181b] sm:text-5xl">{display.name}</DialogTitle>
        <DialogDescription className="mt-2 text-[10px] font-extrabold tracking-[.15em] text-[#df1f3d]">{display.brand ?? display.categoryName ?? "SUGI ASAYAKE"}</DialogDescription>
        <p className="quick-view-description">{detail.isLoading ? "Дэлгэрэнгүй мэдээллийг ачаалж байна…" : description}</p>
        <div className="quick-view-price"><strong>{formatMnt(display.priceMnt)}</strong><span>НӨАТ багтсан</span></div>
        <div className="quick-view-actions">
          <div className="quick-view-quantity" aria-label="Тоо сонгох"><button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Тоо хасах"><Minus size={15} /></button><span>{quantity}</span><button type="button" disabled={quantity >= available} onClick={() => setQuantity(value => Math.min(available, value + 1))} aria-label="Тоо нэмэх"><Plus size={15} /></button></div>
          <button type="button" disabled={available === 0 || addItem.isPending} onClick={addToCart} className="quick-view-add">{addItem.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ShoppingBag size={17} />} {available === 0 ? "Нөөц дууссан" : "Сагсанд нэмэх"}</button>
        </div>
        <Link href={`/product/${display.slug}`} onClick={() => onOpenChange(false)} className="quick-view-detail-link">Бүтэн мэдээлэл харах <span>↗</span></Link>
      </div>
    </div>
  </DialogContent></Dialog>;
}
