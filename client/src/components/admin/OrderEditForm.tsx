import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ubDistrictLabels, ubDistricts, type UbDistrict } from "@shared/districts";
import OrderLineComposer, { type ComposerLine } from "./OrderLineComposer";

/**
 * Edits an open order (2026-09-14, Tom: "харилцагч утасдаж нэгийг нь хас,
 * хаягаа солино гэвэл цуцлаад дахин захиалуулах л арга байна"). Contact and
 * delivery any time before the order closes; line items only while unpaid
 * (server rule -- money already taken is refunded, never re-priced).
 */
type Order = {
  id: number; orderNumber: string; customerName: string; customerPhone: string; customerEmail: string | null;
  deliveryMethod: "ub_delivery" | "store_pickup"; deliveryAddress: string | null; deliveryDistrict: string | null; pickupBranch: string | null;
  paymentStatus: string; fulfillingBranchId: number | null;
  items: { variantId: number | null; productName: string; sku: string; quantity: number; unitPriceMnt: number }[];
};
const field = "h-10 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Захиалгыг засаж чадсангүй.";

export default function OrderEditForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const utils = trpc.useUtils();
  const branchesQuery = trpc.content.branches.useQuery();
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone);
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState(order.deliveryMethod);
  const [district, setDistrict] = useState<UbDistrict | "">((order.deliveryDistrict as UbDistrict | null) ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress ?? "");
  const [pickupBranch, setPickupBranch] = useState(order.pickupBranch ?? "");
  const itemsEditable = order.paymentStatus === "unpaid";
  const initialLines = useMemo<ComposerLine[]>(() => order.items.filter(item => item.variantId !== null).map(item => ({ variantId: item.variantId!, productName: item.productName, sku: item.sku, priceMnt: item.unitPriceMnt, quantity: item.quantity })), [order.items]);
  const [lines, setLines] = useState<ComposerLine[]>(initialLines);
  const linesChanged = JSON.stringify(lines.map(line => [line.variantId, line.quantity])) !== JSON.stringify(initialLines.map(line => [line.variantId, line.quantity]));
  const edit = trpc.admin.editOrder.useMutation({
    onSuccess: () => { toast.success("Захиалга шинэчлэгдлээ."); utils.admin.orders.invalidate(); onDone(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (itemsEditable && !lines.length) { toast.error("Захиалгад дор хаяж нэг бараа үлдэх ёстой."); return; }
    edit.mutate({
      id: order.id, customerName: customerName.trim(), customerPhone: customerPhone.trim(), customerEmail: customerEmail.trim(),
      deliveryMethod, deliveryAddress: deliveryMethod === "ub_delivery" ? deliveryAddress.trim() : null, district: deliveryMethod === "ub_delivery" && district ? district : null,
      pickupBranch: deliveryMethod === "store_pickup" ? pickupBranch : null,
      ...(itemsEditable && linesChanged ? { items: lines.map(line => ({ variantId: line.variantId, quantity: line.quantity })) } : {}),
    });
  };
  return (
    <form onSubmit={submit} className="mt-3 grid gap-4 rounded-2xl bg-[var(--a-soft)] p-4">
      <p className="text-xs font-bold">Захиалга {order.orderNumber} засах</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-bold">Нэр<input value={customerName} onChange={event => setCustomerName(event.target.value)} required className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Утас<input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} required inputMode="tel" className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Имэйл<input value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} inputMode="email" className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Хүргэлт<select value={deliveryMethod} onChange={event => setDeliveryMethod(event.target.value as typeof deliveryMethod)} className={field}><option value="ub_delivery">Улаанбаатар хүргэлт</option><option value="store_pickup">Салбараас авах</option></select></label>
        {deliveryMethod === "ub_delivery" ? <>
          <label className="grid gap-1.5 text-xs font-bold">Дүүрэг<select value={district} onChange={event => setDistrict(event.target.value as UbDistrict | "")} className={field}><option value="">Сонгох</option>{ubDistricts.map(key => <option key={key} value={key}>{ubDistrictLabels[key]}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-bold">Хаяг<input value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} className={field} /></label>
        </> : <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Авах салбар<select value={pickupBranch} onChange={event => setPickupBranch(event.target.value)} className={field}><option value="">Салбар сонгох</option>{branches.map(branch => <option key={branch.id} value={branch.name}>{branch.name}</option>)}</select></label>}
      </div>
      {itemsEditable
        ? <OrderLineComposer branchId={order.fulfillingBranchId ?? (branches.find(branch => branch.isFulfillmentDefault) ?? branches[0])?.id ?? null} lines={lines} onChange={setLines} disabled={edit.isPending} />
        : <p className="rounded-xl bg-[#fff5dd] p-3 text-xs text-[#6c531f]">Төлбөр төлөгдсөн тул барааны мөрийг өөрчлөх боломжгүй — буцаан олголт хийгээд шинэ захиалга үүсгэнэ. Холбоо барих/хүргэлтийн мэдээллийг засаж болно.</p>}
      <p className="text-[11px] text-[var(--a-muted)]">Өмнө нь олгосон хямдрал, купон хэвээр үлдэнэ; хүргэлтийн төлбөр шинэ сагс/аргаар дахин тооцогдоно; нөөц тухайн захиалгын салбараас хасагдаж/буцна.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={edit.isPending} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60">{edit.isPending && <LoaderCircle className="animate-spin" size={14} />}Хадгалах</button>
        <button type="button" onClick={onDone} className="h-10 rounded-full border border-[var(--a-border)] px-4 text-xs font-bold text-[var(--a-text-soft)]">Болих</button>
      </div>
    </form>
  );
}
