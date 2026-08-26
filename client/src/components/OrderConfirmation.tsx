import { Check, ClipboardList, MapPin, ShoppingBag, Smartphone } from "lucide-react";
import { Link } from "wouter";
import type { RouterOutputs } from "@/lib/trpc";
import { formatVariantAttributes } from "@shared/catalog-filter";

const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";

type ConfirmedOrder = RouterOutputs["checkout"]["createOrder"];

/**
 * The checkout page's biggest emotional moment used to be a toast the
 * shopper could easily miss, then get dumped back on the same form with
 * nothing to look at. Rendered by Checkout.tsx once an order is genuinely
 * confirmed — immediately for cash/pickup, or once qpayStatus polling
 * reports paid for QPay — never for a QPay order still awaiting payment.
 */
export default function OrderConfirmation({ order, isAuthenticated }: { order: ConfirmedOrder; isAuthenticated: boolean }) {
  const firstName = order.customerName.trim().split(/\s+/)[0] || order.customerName;
  return (
    <div className="order-confirm">
      <div className="order-confirm-card">
        <div className="order-confirm-check"><Check size={34} strokeWidth={3} /></div>
        <p className="eyebrow"><span /> ЗАХИАЛГА БАТАЛГААЖЛАА</p>
        <h1>Баярлалаа, <em>{firstName}!</em></h1>
        <p className="order-confirm-lede">Таны захиалгыг хүлээн авлаа. Явцыг доорх дугаараар “Миний захиалга” хэсгээс хэдийч хянаж болно.</p>
        <div className="order-confirm-number"><ClipboardList size={16} aria-hidden="true" /> {order.orderNumber}</div>

        <div className="order-confirm-summary">
          {order.items.map(item => (
            <div className="order-confirm-summary-row" key={`${item.name}-${item.quantity}`}>
              <span>{item.name}{formatVariantAttributes(item.attributesJson) ? <span style={{ color: "#9a9ba0" }}> ({formatVariantAttributes(item.attributesJson)})</span> : null} <span style={{ color: "#9a9ba0" }}>× {item.quantity}</span></span>
              <strong>{formatMnt(item.priceMnt * item.quantity)}</strong>
            </div>
          ))}
          {order.discountMnt > 0 && <div className="order-confirm-summary-row"><span>Routine хямдрал</span><span>-{formatMnt(order.discountMnt)}</span></div>}
          {order.couponDiscountMnt > 0 && <div className="order-confirm-summary-row"><span>Хямдралын код{order.couponCode ? ` (${order.couponCode})` : ""}</span><span>-{formatMnt(order.couponDiscountMnt)}</span></div>}
          {order.loyaltyDiscountMnt > 0 && <div className="order-confirm-summary-row"><span>Гишүүнчлэлийн хямдрал{order.appliedLoyaltyTierName ? ` (${order.appliedLoyaltyTierName})` : ""}</span><span>-{formatMnt(order.loyaltyDiscountMnt)}</span></div>}
          <div className="order-confirm-summary-row"><span>Хүргэлт</span><span>{order.deliveryFeeMnt === 0 ? "Үнэгүй" : formatMnt(order.deliveryFeeMnt)}</span></div>
          <div className="order-confirm-summary-row total"><span>Нийт төлсөн</span><span>{formatMnt(order.totalMnt)}</span></div>
          <div className="order-confirm-meta">
            <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              {order.deliveryMethod === "store_pickup" ? <MapPin size={13} /> : <ShoppingBag size={13} />}
              {order.deliveryMethod === "store_pickup" ? `Авах салбар: ${order.pickupBranch ?? "—"}` : `Хүргэх хаяг: ${order.deliveryAddress ?? "—"}`}
            </span>
            {order.paymentMethod === "qpay" && <span style={{ display: "flex", alignItems: "center", gap: "7px" }}><Smartphone size={13} /> QPay-ээр төлөгдсөн</span>}
          </div>
        </div>

        <div className="order-confirm-actions">
          {isAuthenticated ? <Link href="/profile?tab=orders" className="button button-primary">Захиалгуудаа харах</Link> : null}
          <Link href="/shop" className={isAuthenticated ? "quiet-link" : "button button-primary"}>Дэлгүүр рүү буцах</Link>
        </div>
      </div>
    </div>
  );
}
