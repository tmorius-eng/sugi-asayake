import { useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { newRequestId } from "@/lib/requestId";
import { trpc } from "@/lib/trpc";
import { ubDistrictLabels, ubDistricts, type UbDistrict } from "@shared/districts";
import OrderLineComposer, { type ComposerLine } from "./OrderLineComposer";

/**
 * Staff keys in an order a customer placed by phone or Messenger
 * (2026-09-14). Same rules as the website's own checkout (branch, delivery
 * fee, stock), no discounts, and the customer gets the usual confirmation
 * email / SMS. The idempotency key is minted once per open form, so a double
 * click or a retried request cannot create two orders.
 */
const field = "h-10 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Захиалга үүсгэж чадсангүй.";

export default function ManualOrderForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const branchesQuery = trpc.content.branches.useQuery();
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const fulfilmentBranchId = useMemo(() => (branches.find(branch => branch.isFulfillmentDefault) ?? branches[0])?.id ?? null, [branches]);
  const requestId = useRef(newRequestId());
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [salesChannel, setSalesChannel] = useState<"phone" | "messenger" | "in_store">("phone");
  const [deliveryMethod, setDeliveryMethod] = useState<"ub_delivery" | "store_pickup">("ub_delivery");
  const [district, setDistrict] = useState<UbDistrict | "">("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [pickupBranch, setPickupBranch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash_on_delivery" | "bank_transfer" | "qpay" | "storepay" | "card">("cash_on_delivery");
  const [adminNote, setAdminNote] = useState("");
  const [lines, setLines] = useState<ComposerLine[]>([]);
  const create = trpc.admin.createManualOrder.useMutation({
    onSuccess: order => { toast.success(`Захиалга ${order.orderNumber} үүслээ.`); utils.admin.orders.invalidate(); onDone(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!lines.length) { toast.error("Дор хаяж нэг бараа нэмнэ үү."); return; }
    if (deliveryMethod === "ub_delivery" && !deliveryAddress.trim()) { toast.error("Хүргэлтийн хаяг оруулна уу."); return; }
    if (deliveryMethod === "store_pickup" && !pickupBranch) { toast.error("Авах салбар сонгоно уу."); return; }
    create.mutate({
      clientRequestId: requestId.current, customerName: customerName.trim(), customerPhone: customerPhone.trim(), customerEmail: customerEmail.trim() || null,
      deliveryMethod, deliveryAddress: deliveryMethod === "ub_delivery" ? deliveryAddress.trim() : null, district: deliveryMethod === "ub_delivery" && district ? district : null,
      pickupBranch: deliveryMethod === "store_pickup" ? pickupBranch : null, paymentMethod, salesChannel, adminNote: adminNote.trim() || null,
      items: lines.map(line => ({ variantId: line.variantId, quantity: line.quantity })),
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
      <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">ГАРААР ЗАХИАЛГА</p><h3 className="mt-1 text-lg font-bold">Утас / Messenger-ээр ирсэн захиалга бүртгэх</h3><p className="mt-1 text-xs text-[var(--a-muted)]">Нөөц үндсэн салбараас хасагдана, харилцагчид баталгаажуулах имэйл/SMS (асаалттай бол) очно. Хямдрал, купон энд хэрэглэгдэхгүй.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-bold">Нэр<input value={customerName} onChange={event => setCustomerName(event.target.value)} required className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Утас<input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} required inputMode="tel" className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Имэйл (сонголтоор)<input value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} inputMode="email" className={field} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Суваг<select value={salesChannel} onChange={event => setSalesChannel(event.target.value as typeof salesChannel)} className={field}><option value="phone">Утсаар</option><option value="messenger">Messenger</option><option value="in_store">Дэлгүүрт (хүргэлттэй)</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold">Хүргэлт<select value={deliveryMethod} onChange={event => setDeliveryMethod(event.target.value as typeof deliveryMethod)} className={field}><option value="ub_delivery">Улаанбаатар хүргэлт</option><option value="store_pickup">Салбараас авах</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold">Төлбөр<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)} className={field}><option value="cash_on_delivery">Бэлэн (хүргэлтээр/салбарт)</option><option value="bank_transfer">Банкны шилжүүлэг</option><option value="qpay">QPay</option><option value="storepay">StorePay</option><option value="card">Карт</option></select></label>
        {deliveryMethod === "ub_delivery" ? <>
          <label className="grid gap-1.5 text-xs font-bold">Дүүрэг<select value={district} onChange={event => setDistrict(event.target.value as UbDistrict | "")} className={field}><option value="">Сонгох</option>{ubDistricts.map(key => <option key={key} value={key}>{ubDistrictLabels[key]}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Хаяг<input value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} placeholder="Хороо, байр, орц, тоот" className={field} /></label>
        </> : <label className="grid gap-1.5 text-xs font-bold sm:col-span-3">Авах салбар<select value={pickupBranch} onChange={event => setPickupBranch(event.target.value)} className={field}><option value="">Салбар сонгох</option>{branches.map(branch => <option key={branch.id} value={branch.name}>{branch.name}</option>)}</select></label>}
        <label className="grid gap-1.5 text-xs font-bold sm:col-span-3">Тэмдэглэл (агуулахад харагдана)<input value={adminNote} onChange={event => setAdminNote(event.target.value)} className={field} /></label>
      </div>
      <OrderLineComposer branchId={fulfilmentBranchId} lines={lines} onChange={setLines} disabled={create.isPending} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={create.isPending} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60">{create.isPending && <LoaderCircle className="animate-spin" size={14} />}Захиалга үүсгэх</button>
        <button type="button" onClick={onDone} className="h-10 rounded-full border border-[var(--a-border)] px-4 text-xs font-bold text-[var(--a-text-soft)]">Болих</button>
      </div>
    </form>
  );
}
