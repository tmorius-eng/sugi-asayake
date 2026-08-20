import { ClipboardList, LoaderCircle, LogIn, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import CommerceHeader from "@/components/CommerceHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const statusLabel: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэж байна", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцлагдсан" };

export default function MyOrders() {
  const { isAuthenticated } = useAuth();
  const orders = trpc.orders.mine.useQuery(undefined, { enabled: isAuthenticated });
  return (
    <div className="sugi-commerce" style={{ overflow: "visible" }}>
      <CommerceHeader backLabel="SUGI ASAYAKE захиалга" />
      <main className="orders-main">
        <p className="shop-kicker"><span /> YOUR SUGI ACCOUNT</p>
        <h1 style={{ margin: "12px 0 0", fontFamily: "var(--font-display)", fontSize: "clamp(38px, 6vw, 56px)", fontWeight: 650, letterSpacing: "-.07em" }}>Миний захиалгууд.</h1>

        {!isAuthenticated ? (
          <section className="orders-gate" style={{ marginTop: "36px" }}>
            <LogIn size={24} style={{ margin: "0 auto" }} />
            <h2>Захиалгаа харахын тулд нэвтэрнэ үү.</h2>
            <p>Зөвхөн таны бүртгэлтэй захиалгын түүх харагдана.</p>
            <button type="button" onClick={startLogin} className="button button-primary" style={{ marginTop: "24px" }}>Нэвтрэх</button>
          </section>
        ) : orders.isLoading ? (
          <div style={{ display: "grid", minHeight: "288px", placeItems: "center" }}><LoaderCircle className="animate-spin" style={{ color: "var(--primary)" }} /></div>
        ) : orders.data?.length ? (
          <div className="order-list">
            {orders.data.map(order => (
              <article key={order.id} className="order-card">
                <div className="order-card-head">
                  <div>
                    <p className="order-number">{order.orderNumber}</p>
                    <h2 className="order-date">{new Date(order.createdAt).toLocaleDateString("mn-MN")}</h2>
                  </div>
                  <span className={`order-status-pill${order.status === "cancelled" ? " cancelled" : ""}`}>{statusLabel[order.status] ?? order.status}</span>
                </div>
                <div className="order-items">
                  {order.items.map(item => (
                    <div key={`${order.id}-${item.sku}`} className="order-item">
                      <span>{item.productName} <span>× {item.quantity}</span></span>
                      <strong>{formatMnt(item.unitPriceMnt * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
                <div className="order-foot">
                  <span>{order.deliveryMethod === "store_pickup" ? `Авах салбар: ${order.pickupBranch ?? "Сонгогдоогүй"}` : "Улаанбаатар хүргэлт"}</span>
                  <strong>Нийт {formatMnt(order.totalMnt)}</strong>
                </div>
                {order.deliveryTrackingRef && <p className="order-tracking">Хүргэлтийн дугаар: {order.deliveryTrackingRef}</p>}
              </article>
            ))}
          </div>
        ) : (
          <section className="orders-empty" style={{ marginTop: "36px", border: "1px dashed rgba(23,24,27,.15)" }}>
            <ClipboardList size={24} style={{ margin: "0 auto" }} />
            <h2>Захиалга байхгүй байна.</h2>
            <p>Сонирхсон бүтээгдэхүүнээ сагсанд нэмж захиалгаа эхлүүлээрэй.</p>
            <Link href="/shop" className="button button-primary" style={{ marginTop: "24px" }}><PackageCheck size={16} /> Дэлгүүр үзэх</Link>
          </section>
        )}
      </main>
    </div>
  );
}
