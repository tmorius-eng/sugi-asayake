import { Check, CircleAlert, CreditCard, LoaderCircle, MapPin, ShoppingBag, Smartphone, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import OrderConfirmation from "@/components/OrderConfirmation";
import SiteFooter from "@/components/SiteFooter";
import { footerLogoUrl, footerSocials } from "@/components/site-footer-data";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/trpc";
import { getStoredTrafficSource } from "@/lib/trafficSource";
import { formatVariantAttributes } from "@shared/catalog-filter";
import { UB_DELIVERY_FEE_MNT } from "@shared/const";
import { ubDistricts, ubDistrictLabels, type UbDistrict } from "@shared/districts";
import { formatMnt } from "@shared/format";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Захиалгыг үргэлжлүүлж чадсангүй. Дахин оролдоно уу.";
const branches = ["Орос элчингийн салбар", "Их наяд плаза салбар", "Яармаг FOOD CITY салбар"] as const;

export default function Checkout() {
  const [delivery, setDelivery] = useState<"delivery" | "pickup">("delivery");
  const [payment, setPayment] = useState<"qpay" | "cash">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [district, setDistrict] = useState<UbDistrict | "">("");
  const [pickupBranch, setPickupBranch] = useState<(typeof branches)[number] | "">("");
  const [qpayInvoice, setQpayInvoice] = useState<{ orderId: number; orderNumber: string; qrText: string | null; urls: Array<{ name?: string; description?: string; link?: string }> } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  // Set the instant checkout.createOrder succeeds, for either payment
  // method. Whether it's actually shown as "confirmed" depends on payment
  // method: a cash/pickup order is confirmed immediately, but a QPay order
  // isn't until qpayStatus polling below reports it paid (see
  // isOrderConfirmed) — never for a QPay order still sitting on an unpaid
  // invoice.
  const [placedOrder, setPlacedOrder] = useState<RouterOutputs["checkout"]["createOrder"] | null>(null);
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const cartQuery = trpc.cart.current.useQuery();
  const qpayAvailability = trpc.payments.qpayAvailability.useQuery();
  const savedAddresses = trpc.profile.addresses.list.useQuery(undefined, { enabled: isAuthenticated });
  const createOrder = trpc.checkout.createOrder.useMutation();
  const createInvoice = trpc.payments.qpayCreateInvoice.useMutation();
  // Prefill from the profile page once its data arrives, without ever
  // clobbering something the shopper already typed — each effect fires at
  // most once (per field group) and only fills empty fields.
  const contactSeeded = useRef(false);
  useEffect(() => {
    if (contactSeeded.current || !user) return;
    contactSeeded.current = true;
    setCustomerName(current => current || (user.name?.trim() ?? ""));
    setCustomerPhone(current => current || (user.phone?.trim() ?? ""));
    setCustomerEmail(current => current || (user.email ?? ""));
  }, [user]);
  const addressSeeded = useRef(false);
  useEffect(() => {
    if (addressSeeded.current || !savedAddresses.data) return;
    addressSeeded.current = true;
    const defaultAddress = savedAddresses.data.find(item => item.isDefault) ?? savedAddresses.data[0];
    if (defaultAddress) {
      setDeliveryAddress(current => current || defaultAddress.addressLine);
      setDistrict(current => current || (defaultAddress.district as UbDistrict | null) || "");
    }
  }, [savedAddresses.data]);
  const statusInput = useMemo(() => ({ orderId: qpayInvoice?.orderId ?? 0 }), [qpayInvoice?.orderId]);
  const qpayStatus = trpc.payments.qpayStatus.useQuery(statusInput, { enabled: Boolean(qpayInvoice?.orderId), refetchInterval: qpayInvoice ? 5_000 : false });
  const isOrderConfirmed = Boolean(placedOrder) && (placedOrder!.paymentMethod !== "qpay" || qpayStatus.data?.paymentStatus === "paid");
  // PREMIUM-FEATURES.md TIER 4: preview-only — this is the exact same
  // getApplicableRoutineDiscount call checkout.createOrder makes for real,
  // so what's shown here is guaranteed to match what's actually charged.
  const routineDiscount = trpc.cart.applicableRoutineDiscount.useQuery();
  // Manually-entered coupon ("SALE10") — only fetched once the shopper
  // actually clicks "Хэрэглэх" (see applyCoupon below), same
  // never-trust-a-client-amount discipline as the routine/loyalty previews:
  // this is the exact same validateDiscountCode call checkout.createOrder
  // makes for real.
  const couponQuery = trpc.cart.applicableCouponDiscount.useQuery({ code: appliedCoupon }, { enabled: Boolean(appliedCoupon), retry: false });
  // PREMIUM-FEATURES.md TIER 5: loyalty tier discount preview. A real
  // server round-trip (cart.applicableLoyaltyDiscount) — this used to be
  // reimplemented client-side from loyalty.myStatus's raw discountPercent,
  // a second, independent copy of the exact formula
  // getApplicableLoyaltyDiscount already runs server-side, with no
  // guarantee the two would stay in sync if either changed. Guests don't
  // have a membership card, so this is skipped entirely when logged out —
  // the query would 401 anyway (protectedProcedure).
  const loyaltyDiscountQuery = trpc.cart.applicableLoyaltyDiscount.useQuery({ couponCode: appliedCoupon || null }, { enabled: isAuthenticated });
  const cartItems = cartQuery.data?.items ?? [];
  const subtotal = cartItems.reduce((sum, item) => sum + item.priceMnt * item.quantity, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = delivery === "delivery" ? UB_DELIVERY_FEE_MNT : 0;
  const discountMnt = routineDiscount.data?.discountMnt ?? 0;
  const couponDiscountMnt = couponQuery.data?.discountMnt ?? 0;
  const loyaltyDiscountMnt = loyaltyDiscountQuery.data?.discountMnt ?? 0;
  const total = subtotal + deliveryFee - discountMnt - couponDiscountMnt - loyaltyDiscountMnt;

  useEffect(() => {
    if (couponQuery.isError) toast.error(messageFrom(couponQuery.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponQuery.isError, couponQuery.error]);

  const applyCoupon = () => {
    const trimmed = couponInput.trim();
    if (!trimmed) { toast.error("Хямдралын код оруулна уу."); return; }
    setAppliedCoupon(trimmed);
  };
  const removeCoupon = () => { setAppliedCoupon(""); setCouponInput(""); };
  const qpayReady = qpayAvailability.data?.configured === true;
  const isSubmitting = createOrder.isPending || createInvoice.isPending;

  const confirmOrder = async () => {
    if (!cartItems.length) { toast.error("Сагс хоосон байна. Бүтээгдэхүүн сонгоод дахин оролдоно уу."); return; }
    if (!customerName.trim() || !customerPhone.trim() || (delivery === "delivery" && !deliveryAddress.trim()) || (delivery === "pickup" && !pickupBranch)) { toast.error("Нэр, утас, хүргэлт эсвэл авах салбарын мэдээллээ бүрэн оруулна уу."); return; }
    if (payment === "qpay" && !qpayReady) { toast.message("QPay merchant setup pending", { description: "QPay merchant credentials ороогүй тул бодит төлбөр одоогоор идэвхгүй." }); return; }
    try {
      const order = await createOrder.mutateAsync({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), customerEmail: customerEmail.trim() || null, deliveryMethod: delivery === "delivery" ? "ub_delivery" : "store_pickup", deliveryAddress: delivery === "delivery" ? deliveryAddress.trim() : null, district: delivery === "delivery" && district ? district : null, pickupBranch: delivery === "pickup" ? pickupBranch : null, paymentMethod: payment === "qpay" ? "qpay" : "cash_on_delivery", couponCode: appliedCoupon || null, trafficSource: getStoredTrafficSource() ?? null });
      await utils.cart.current.invalidate();
      await utils.cart.applicableRoutineDiscount.invalidate();
      await utils.loyalty.myStatus.invalidate();
      removeCoupon();
      setPlacedOrder(order);
      // Cash/pickup orders are confirmed the instant they're placed — see
      // isOrderConfirmed above, which renders OrderConfirmation once this
      // is set (no toast needed anymore, the takeover screen IS the
      // confirmation). A QPay order stays on the invoice UI below until
      // qpayStatus polling reports it paid.
      if (payment === "qpay") { const invoice = await createInvoice.mutateAsync({ orderId: order.id }); setQpayInvoice(invoice); toast.success("QPay нэхэмжлэл бэлэн боллоо."); }
    } catch (error) { toast.error(messageFrom(error)); }
  };

  if (isOrderConfirmed && placedOrder) {
    return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE захиалга" /><OrderConfirmation order={placedOrder} isAuthenticated={isAuthenticated} /><SiteFooter logoUrl={footerLogoUrl} socials={footerSocials} /></div>;
  }

  return <div className="min-h-screen bg-[#f8f5ef] text-[#17181b]"><CommerceHeader cartCount={cartCount} backLabel="SUGI ASAYAKE захиалга" /><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"><div className="mb-10 max-w-2xl border-l-4 border-[#df1f3d] pl-5"><p className="text-[10px] font-extrabold tracking-[.18em] text-[#c81b34]">02 / ASAYAKE ORDER DESK</p><h1 className="mt-3 font-[var(--font-display)] text-5xl font-semibold tracking-[-.08em] sm:text-6xl">Захиалгаа <span className="text-[#df1f3d]">баталгаажуулах.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-[#6c6d72]">Захиалгын мэдээллээ баталгаажуулаад, хүргэлт эсвэл салбарынхаа сонголтыг хий. QPay зөвхөн merchant тохиргоо дууссаны дараа идэвхжинэ.</p></div><div className="grid gap-8 lg:grid-cols-[1fr_360px]"><div className="space-y-5"><section className="rounded-3xl bg-white p-6 shadow-[var(--shadow-sm)] sm:p-8"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#df1f3d] text-xs font-bold text-white">01</span><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">Хүлээн авах мэдээлэл</h2></div>{isAuthenticated && <Link href="/profile" className="shrink-0 text-xs font-bold text-[#3970a7] hover:underline">Профайлаас засах</Link>}</div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-bold">Нэр<input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Таны нэр" className="h-11 rounded-xl border border-black/12 bg-[#fffdf9] px-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]" /></label><label className="grid gap-2 text-xs font-bold">Утас<input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="9911 2233" inputMode="tel" className="h-11 rounded-xl border border-black/12 bg-[#fffdf9] px-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]" /></label><label className="grid gap-2 text-xs font-bold sm:col-span-2">Имэйл (сонголтоор)<input value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="name@email.com" inputMode="email" className="h-11 rounded-xl border border-black/12 bg-[#fffdf9] px-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]" /></label></div></section><section className="rounded-3xl bg-white p-6 shadow-[var(--shadow-sm)] sm:p-8"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#df1f3d] text-xs font-bold text-white">02</span><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">Хүргэлт</h2></div><div className="mt-6 grid gap-3"><button type="button" onClick={() => setDelivery("delivery")} className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${delivery === "delivery" ? "border-[#df1f3d] bg-[#fff2f4]" : "border-black/10 hover:border-black/25"}`}><span className={`mt-0.5 grid size-5 place-items-center rounded-full border ${delivery === "delivery" ? "border-[#df1f3d] bg-[#df1f3d] text-white" : "border-black/20"}`}>{delivery === "delivery" && <Check size={13} />}</span><Truck className="mt-0.5 text-[#df1f3d]" size={19} /><span><strong className="block text-sm">Улаанбаатар хүргэлт</strong><small className="mt-1 block text-xs text-[#6f7076]">24–48 цаг · {formatMnt(UB_DELIVERY_FEE_MNT)}-с эхэлнэ</small></span></button><button type="button" onClick={() => setDelivery("pickup")} className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${delivery === "pickup" ? "border-[#df1f3d] bg-[#fff2f4]" : "border-black/10 hover:border-black/25"}`}><span className={`mt-0.5 grid size-5 place-items-center rounded-full border ${delivery === "pickup" ? "border-[#df1f3d] bg-[#df1f3d] text-white" : "border-black/20"}`}>{delivery === "pickup" && <Check size={13} />}</span><MapPin className="mt-0.5 text-[#df1f3d]" size={19} /><span><strong className="block text-sm">Салбараас авах</strong><small className="mt-1 block text-xs text-[#6f7076]">Тохирох салбарыг дараагийн алхамд сонгоно</small></span></button></div>{delivery === "delivery" ? <><label className="mt-5 grid gap-2 text-xs font-bold">Дүүрэг (сонголтоор)<select value={district} onChange={event => setDistrict(event.target.value as UbDistrict | "")} className="h-11 rounded-xl border border-black/12 bg-[#fffdf9] px-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]"><option value="">Сонгох</option>{ubDistricts.map(key => <option key={key} value={key}>{ubDistrictLabels[key]}</option>)}</select></label><label className="mt-3 grid gap-2 text-xs font-bold">Хүргэлтийн хаяг<textarea value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} placeholder="Дүүрэг, хороо, байр, орц, тоот, нэмэлт тайлбар" className="min-h-24 rounded-xl border border-black/12 bg-[#fffdf9] p-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]" /></label></> : <label className="mt-5 grid gap-2 text-xs font-bold">Авах салбар<select value={pickupBranch} onChange={event => setPickupBranch(event.target.value as (typeof branches)[number] | "")} className="h-11 rounded-xl border border-black/12 bg-[#fffdf9] px-3 text-sm font-normal outline-none transition focus:border-[#df1f3d]"><option value="">Салбар сонгох</option>{branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}</select></label>}</section><section className="rounded-3xl bg-white p-6 shadow-[var(--shadow-sm)] sm:p-8"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#df1f3d] text-xs font-bold text-white">03</span><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">Төлбөр</h2></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setPayment("cash")} className={`rounded-2xl border p-4 text-left transition ${payment === "cash" ? "border-[#df1f3d] bg-[#fff2f4]" : "border-black/10 hover:border-black/25"}`}><span className="flex items-center justify-between"><strong className="text-sm">Бэлэн мөнгө</strong><span className={`grid size-5 place-items-center rounded-full border ${payment === "cash" ? "border-[#df1f3d] bg-[#df1f3d] text-white" : "border-black/20"}`}>{payment === "cash" && <Check size={13} />}</span></span><small className="mt-2 block text-xs text-[#6f7076]">Хүргэлт эсвэл салбарт хүлээн авах үед</small></button><button type="button" disabled={!qpayReady} onClick={() => setPayment("qpay")} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${payment === "qpay" ? "border-[#df1f3d] bg-[#fff2f4]" : "border-black/10 hover:border-black/25"}`}><span className="flex items-center justify-between"><strong className="text-sm">QPay</strong><span className={`grid size-5 place-items-center rounded-full border ${payment === "qpay" ? "border-[#df1f3d] bg-[#df1f3d] text-white" : "border-black/20"}`}>{payment === "qpay" && <Check size={13} />}</span></span><small className="mt-2 block text-xs text-[#6f7076]">{qpayReady ? "QR болон банкны апп" : "Merchant тохиргоо хүлээгдэж байна"}</small></button></div>{!qpayReady && <div className="mt-4 flex gap-3 rounded-2xl bg-[#fff5dd] p-4 text-xs leading-5 text-[#6c531f]"><CircleAlert className="mt-0.5 shrink-0" size={17} /><p><strong>QPay одоогоор идэвхгүй.</strong> Merchant credentials орох хүртэл зөвхөн бэлэн мөнгөний захиалга ажиллана. Bank transfer болон картын төлбөр нь тохиргоогүй тул зориуд харагдахгүй байна.</p></div>}</section></div><div className="space-y-4"><aside className="h-fit rounded-3xl bg-[#17181b] p-6 text-white shadow-[var(--shadow-lg)] sm:p-7"><div className="flex items-center gap-2 text-[#f0b52d]"><ShoppingBag size={17} /><span className="text-[10px] font-extrabold tracking-[.16em]">ORDER SUMMARY</span></div>{!isAuthenticated && <p className="mt-4 text-xs text-white/60">Зочноор захиалж болно — <button type="button" onClick={startLogin} className="font-bold text-[#f0b52d] underline underline-offset-2">бүртгэлтэй бол нэвтрэх</button></p>}{cartQuery.isLoading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-[#f0b52d]" /></div> : cartItems.length ? <div className="mt-6 max-h-72 space-y-4 overflow-y-auto pr-1">{cartItems.map(item => <div key={item.id} className="flex gap-3 border-b border-white/12 pb-4"><img src={item.imageUrl ?? "/product-placeholder.svg"} alt={item.name} className="size-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong>{formatVariantAttributes(item.attributesJson) ? <span className="mt-0.5 block text-xs text-white/50">{formatVariantAttributes(item.attributesJson)}</span> : null}<span className="mt-1 block text-xs text-white/60">x{item.quantity}</span><span className="mt-1 block text-sm font-bold">{formatMnt(item.priceMnt * item.quantity)}</span></div></div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-white/25 p-5 text-center text-sm text-white/65">Сагс хоосон байна.</div>}<div className="mt-6"><div className="flex gap-2"><input value={couponInput} onChange={event => setCouponInput(event.target.value.toUpperCase())} placeholder="Хямдралын код" disabled={Boolean(appliedCoupon)} className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-mono uppercase text-white outline-none placeholder:text-white/40 placeholder:normal-case focus:border-[#f0b52d] disabled:opacity-60" />{appliedCoupon ? <button type="button" onClick={removeCoupon} className="shrink-0 rounded-xl border border-white/20 px-4 text-xs font-bold text-white/80 transition hover:bg-white/10">Хасах</button> : <button type="button" onClick={applyCoupon} disabled={couponQuery.isFetching} className="shrink-0 rounded-xl bg-[#f0b52d] px-4 text-xs font-bold text-[#17181b] transition hover:bg-[#ffd062] disabled:opacity-60">{couponQuery.isFetching ? <LoaderCircle className="animate-spin" size={14} /> : "Хэрэглэх"}</button>}</div>{appliedCoupon && couponDiscountMnt > 0 ? <p className="mt-2 text-xs font-bold text-[#8fd6a8]">&ldquo;{appliedCoupon}&rdquo; код хэрэгжлээ!</p> : null}</div><div className="space-y-3 py-6 text-sm"><div className="flex justify-between text-white/65"><span>Барааны дүн</span><span>{formatMnt(subtotal)}</span></div>{discountMnt > 0 && <div className="flex justify-between font-bold text-[#f0b52d]"><span>Routine хямдрал{routineDiscount.data?.routineName ? ` (${routineDiscount.data.routineName})` : ""}</span><span>-{formatMnt(discountMnt)}</span></div>}{couponDiscountMnt > 0 && <div className="flex justify-between font-bold text-[#f0b52d]"><span>Хямдралын код ({appliedCoupon})</span><span>-{formatMnt(couponDiscountMnt)}</span></div>}{loyaltyDiscountMnt > 0 && <div className="flex justify-between font-bold text-[#f0b52d]"><span>Гишүүнчлэлийн хямдрал ({loyaltyDiscountQuery.data?.tierName})</span><span>-{formatMnt(loyaltyDiscountMnt)}</span></div>}<div className="flex justify-between text-white/65"><span>Хүргэлт</span><span>{deliveryFee === 0 ? "Үнэгүй" : formatMnt(deliveryFee)}</span></div><div className="flex justify-between border-t border-white/12 pt-4 font-[var(--font-display)] text-2xl font-semibold tracking-[-.07em]"><span>Нийт</span><span>{formatMnt(total)}</span></div></div><button type="button" disabled={isSubmitting || (payment === "qpay" && !qpayReady) || !cartItems.length} onClick={confirmOrder} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f0b52d] px-5 text-sm font-bold text-[#17181b] transition hover:-translate-y-0.5 hover:bg-[#ffd062] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55">{isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <CreditCard size={16} />}{payment === "qpay" && !qpayReady ? "QPay setup pending" : "Захиалга батлах"}</button>{qpayInvoice && <div className="mt-5 rounded-2xl bg-white/10 p-4"><div className="flex items-center gap-2 text-[#f0b52d]"><Smartphone size={16} /><strong className="text-xs">QPay нэхэмжлэл #{qpayInvoice.orderNumber}</strong></div><p className="mt-2 text-xs leading-5 text-white/65">Банкны апп сонгон төлнө үү. Callback баталгаажмагц төлөв автоматаар шинэчлэгдэнэ.</p>{qpayStatus.data?.paymentStatus === "paid" && <p className="mt-3 rounded-xl bg-[#286b4c] px-3 py-2 text-xs font-bold">Төлбөр баталгаажлаа.</p>}{qpayInvoice.urls.length > 0 ? <div className="mt-3 grid gap-2">{qpayInvoice.urls.filter(item => item.link).map(item => <a key={item.link} href={item.link} className="rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-[#17181b] transition hover:bg-[#f0b52d]">{item.description ?? item.name ?? "Банкны апп"}</a>)}</div> : qpayInvoice.qrText ? <code className="mt-3 block break-all rounded-xl bg-black/20 p-3 text-[10px] text-white/65">{qpayInvoice.qrText}</code> : null}</div>}<Link href="/orders" className="mt-4 block text-center text-xs font-bold text-white/75 transition hover:text-white">Миний захиалга</Link></aside><div className="flex gap-3 rounded-2xl bg-[#fff5dd] p-4 text-xs leading-5 text-[#6c531f]"><CircleAlert className="mt-0.5 shrink-0" size={17} /><p><strong>Буцаалт, солилцооны нөхцөл:</strong> Нээгдсэн, ашигласан бүтээгдэхүүнийг зөвхөн бодит гэмтэлтэй эсвэл зарласан чанар/шинж чанараа хангаагүй үед л буцаана — таалагдаагүй, санаа өөрчлөгдсөн шалтгаанаар буцаах боломжгүй. Ариун цэврийн лац, савлагаа нээгдсэн эрүүл ахуйн бүтээгдэхүүнийг халдваргүйжлийн шалтгаанаар буцаах, солих боломж хязгаарлагдана. Дэлгэрэнгүйг <Link href="/returns" className="font-bold underline underline-offset-2 hover:text-[#4a3d10]">Буцаалт, солилцоо</Link> хуудаснаас үзнэ үү.</p></div></div></div></main><SiteFooter logoUrl={footerLogoUrl} socials={footerSocials} /></div>;
}
