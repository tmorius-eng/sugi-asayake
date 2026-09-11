import { useState } from "react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link } from "wouter";
import { LoaderCircle, Package, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import { trpc } from "@/lib/trpc";
import { useSiteText } from "@/hooks/useSiteText";
import { formatMnt } from "@shared/format";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хайлт амжилтгүй боллоо. Дахин оролдоно уу.";

// Same wording as Profile.tsx's own order-history tab (ORDER_STATUS_LABEL) --
// not extracted to a shared file since both are small, page-local copies of
// the same 7 status/3 payment values, matching this codebase's existing
// tolerance for a duplicated label map over a shared one for something this
// small (see AdminOperationsPanel.tsx's own statusLabels for another).
const STATUS_LABEL: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэж байна", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцлагдсан", returned: "Буцаагдсан" };
const PAYMENT_LABEL: Record<string, string> = { paid: "Төлөгдсөн", unpaid: "Төлбөр хүлээж буй", refunded: "Буцаан олгосон" };

// Admin overhaul (2026-09-08, Phase F): the first way a guest checkout
// customer can check their order status after leaving the confirmation
// page -- orders.lookup (server/routers.ts) is public + rate-limited +
// anti-enumeration (wrong order number and wrong phone read identically).
export default function TrackOrder() {
  const textFor = useSiteText();
  useDocumentMeta(textFor("seo-text-track-title", "Захиалга хянах — SUGI ASAYAKE"), null);
  const [trackLine1, trackLine2] = textFor("track-text-heading", "Захиалгаа\nхянах.").split("\n");
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const lookup = trpc.orders.lookup.useMutation();

  const submit = async () => {
    if (!orderNumber.trim() || !phone.trim()) {
      toast.error("Захиалгын дугаар болон утасны дугаараа оруулна уу.");
      return;
    }
    try {
      await lookup.mutateAsync({ orderNumber: orderNumber.trim(), phone: phone.trim() });
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const order = lookup.data;

  return (
    <div className="auth-shell">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="auth-main">
        <div className="auth-head">
          <p className="auth-kicker">TRACK ORDER</p>
          <h1>{trackLine1} <em>{trackLine2}</em></h1>
          <p className="auth-lede">{textFor("track-text-lede", "Захиалгын дугаар болон захиалахад ашигласан утасны дугаараа оруулна уу.")}</p>
        </div>

        <form onSubmit={event => { event.preventDefault(); submit(); }} className="auth-card">
          <label className="auth-field">
            Захиалгын дугаар
            <div className="auth-field-shell">
              <Package size={16} aria-hidden="true" />
              <input value={orderNumber} onChange={event => setOrderNumber(event.target.value)} placeholder="SAMT..." autoComplete="off" />
            </div>
          </label>
          <label className="auth-field">
            Утасны дугаар
            <div className="auth-field-shell">
              <Phone size={16} aria-hidden="true" />
              <input type="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="9911 2233" autoComplete="tel" />
            </div>
          </label>
          <button type="submit" disabled={lookup.isPending} className="auth-submit">
            {lookup.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Search size={16} />}
            Хайх
          </button>
        </form>

        {order && (
          <div className="auth-card">
            <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".14em", color: "#df1f3d" }}>{order.orderNumber}</p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "8px" }}>
              <span style={{ fontWeight: 700 }}>{STATUS_LABEL[order.status] ?? order.status}</span>
              <span style={{ fontWeight: 700, color: "#57585e" }}>{PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}</span>
            </div>
            <p style={{ marginTop: "10px", fontSize: "13px", color: "#626368" }}>
              {order.deliveryMethod === "store_pickup" ? `Салбараас авах: ${order.pickupBranch ?? "—"}` : order.deliveryAddress ?? "УБ хүргэлт"}
            </p>
            {order.deliveryTrackingRef && <p style={{ marginTop: "4px", fontSize: "13px", color: "#626368" }}>Хүргэлтийн дугаар: {order.deliveryTrackingRef}</p>}
            <div style={{ marginTop: "14px", display: "grid", gap: "6px" }}>
              {order.items.map((item, index) => (
                <div key={index} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span>{item.productName} × {item.quantity}</span>
                  <span>{formatMnt(item.unitPriceMnt * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,.08)", paddingTop: "10px", fontWeight: 700 }}>
              <span>Нийт дүн</span>
              <span>{formatMnt(order.totalMnt)}</span>
            </div>
          </div>
        )}

        <Link href="/shop" className="auth-switch">Дэлгүүр рүү буцах</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
