import { LoaderCircle, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { useStoreSetting } from "@/hooks/useStoreSetting";
import { useProductName } from "@/hooks/useProductName";
import { formatVariantAttributes } from "@shared/catalog-filter";
import { UB_DELIVERY_FEE_MNT } from "@shared/const";
import { formatMnt } from "@shared/format";

type CartDrawerProps = { open: boolean; onOpenChange: (open: boolean) => void };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Сагсыг шинэчилж чадсангүй.";

export default function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const utils = trpc.useUtils();
  const cart = trpc.cart.current.useQuery(undefined, { enabled: open });
  const update = trpc.cart.updateItemQuantity.useMutation({
    onSuccess: () => utils.cart.current.invalidate(),
    onError: error => toast.error(messageFrom(error)),
  });
  const items = cart.data?.items ?? [];
  const displayName = useProductName();
  const subtotal = items.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  // "Controls everything" admin overhaul (2026-09-08, Phase B): display-only
  // mention here, same admin-editable-with-fallback source as Checkout.tsx.
  const valueForSetting = useStoreSetting();
  const deliveryFeeUbMnt = Number(valueForSetting("delivery-fee-ub-mnt", String(UB_DELIVERY_FEE_MNT)));
  // `update` is one shared mutation for every row — without this, changing
  // one item's quantity would disable every +/-/remove button in the list
  // until that single request finishes, not just the row being edited.
  const pendingItemId = update.isPending ? update.variables?.itemId : undefined;

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full max-w-md border-l border-border bg-card p-0 sm:max-w-md"><SheetHeader className="border-b border-border px-6 py-6 text-left"><div className="flex items-center gap-3 text-[#df1f3d]"><ShoppingBag size={18} aria-hidden="true" /><span className="text-[10px] font-extrabold tracking-[.16em]">YOUR CART</span></div><SheetTitle className="mt-2 font-[var(--font-display)] text-3xl tracking-[-.07em]">Таны сагс</SheetTitle><SheetDescription className="text-xs">Захиалгын мэдээллээ шалгаад үргэлжлүүлнэ үү.</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{cart.isLoading ? <div className="grid min-h-64 place-items-center" role="status" aria-label="Ачаалж байна"><LoaderCircle className="animate-spin text-[#df1f3d]" aria-hidden="true" /></div> : items.length ? <div className="space-y-5">{items.map(item => <div key={item.id} className="border-b border-border pb-5"><div className="flex gap-4"><img src={item.imageUrl ?? "/product-placeholder.svg"} alt={item.name} className="size-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold tracking-[.14em] text-[#c81b34]">{item.slug.toUpperCase()}</p><h3 className="mt-1 font-[var(--font-display)] text-lg font-semibold tracking-[-.05em]">{displayName(item).primary}</h3>{displayName(item).secondary ? <p className="product-name-secondary">{displayName(item).secondary}</p> : null}{formatVariantAttributes(item.attributesJson) ? <p className="mt-0.5 text-xs text-muted-foreground">{formatVariantAttributes(item.attributesJson)}</p> : null}<p className="mt-1 text-sm font-bold">{formatMnt(item.priceMnt)}</p></div><button type="button" disabled={pendingItemId === item.id} onClick={() => update.mutate({ itemId: item.id, quantity: 0 })} className="self-start text-muted-foreground transition hover:text-[#df1f3d] disabled:opacity-40" aria-label={`${item.name} — сагснаас хасах`}><Trash2 size={17} aria-hidden="true" /></button></div><div className="mt-5 flex items-center justify-between"><div className="inline-flex items-center rounded-full border border-border bg-card"><button type="button" disabled={pendingItemId === item.id} onClick={() => update.mutate({ itemId: item.id, quantity: Math.max(1, item.quantity - 1) })} className="grid size-9 place-items-center disabled:opacity-40" aria-label={`${item.name} — тоо хасах`}><Minus size={14} aria-hidden="true" /></button><span className="grid min-w-8 place-items-center text-xs font-bold">{item.quantity}</span><button type="button" disabled={pendingItemId === item.id || item.quantity >= item.stockQuantity} onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity + 1 })} className="grid size-9 place-items-center disabled:opacity-40" aria-label={`${item.name} — тоо нэмэх`}><Plus size={14} aria-hidden="true" /></button></div><strong className="font-[var(--font-display)] text-xl tracking-[-.06em]">{formatMnt(item.priceMnt * item.quantity)}</strong></div></div>)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-muted p-8 text-center"><div><ShoppingBag className="mx-auto mb-3 text-[#df1f3d]" size={27} aria-hidden="true" /><p className="font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">Сагс хоосон байна</p><p className="mt-2 text-sm text-muted-foreground">Танд тохирох бүтээгдэхүүнээ сонгоорой.</p></div></div>}</div><SheetFooter className="border-t border-border bg-muted px-6 py-5"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Дүн</span><strong className="font-[var(--font-display)] text-2xl tracking-[-.07em]">{formatMnt(subtotal)}</strong></div>{items.length > 0 ? <Link href="/checkout" onClick={() => onOpenChange(false)} className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">Захиалга үргэлжлүүлэх</Link> : null}<p className="text-center text-[10px] leading-relaxed text-muted-foreground">Улаанбаатар хүргэлт: {formatMnt(deliveryFeeUbMnt)} (эсвэл салбараас <strong className="text-[#2c7650]">үнэгүй</strong> авах). Дээрх дүн хүргэлтийн төлбөр орохгүй.</p></SheetFooter></SheetContent></Sheet>;
}
