import { HELP_FAQ } from "@shared/help-faq";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { Link, useLocation, useSearch } from "wouter";
import {
  Bell, Camera, ChevronDown, ClipboardList, CreditCard, Heart, HelpCircle, Home, LayoutDashboard,
  Gift, Loader2, LoaderCircle, LogIn, LogOut, Mail, MapPin, Pencil, Phone, Plus, FileDown, RotateCcw,
  ShieldCheck, ShieldOff, ShoppingBag, Sparkles, Star, Trash2, User as UserIcon, X,
} from "lucide-react";
import { useShopContact } from "@/hooks/useShopContact";
import { useSiteText } from "@/hooks/useSiteText";
import { paymentBadgeFor } from "@shared/orders";
import { ubDistricts, ubDistrictLabels, type UbDistrict } from "@shared/districts";
import {
  skinTypeOptions, skinConcernOptions, interiorStyleOptions,
  hairConcernOptions, wellnessInterestOptions, bodyConcernOptions, bodySkinTypeLabels,
  genderLabels, hairTypeLabels, fragrancePreferenceLabels, skinRoutineComplexityLabels,
} from "@shared/catalog-filter";
import { toast } from "sonner";
import CartDrawer from "@/components/CartDrawer";
import GiftCardCodes from "@/components/GiftCardCodes";
import CommerceHeader from "@/components/CommerceHeader";
import ProfileQuizWizard from "@/components/ProfileQuizWizard";
import SiteFooter from "@/components/SiteFooter";
import { LineSkeleton, Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { notifyAddedToCart } from "@/lib/addedToCartToast";
import { trpc } from "@/lib/trpc";
import { currentPushSubscription, pushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import type { RouterOutputs } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Гүйцэтгэж чадсангүй. Дахин оролдоно уу.";

type TabKey = "overview" | "orders" | "preferences" | "wishlist" | "addresses" | "notifications" | "security" | "support" | "loyalty";
const TAB_KEYS: TabKey[] = ["overview", "orders", "preferences", "wishlist", "addresses", "notifications", "security", "support", "loyalty"];
const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Тойм", icon: LayoutDashboard },
  { key: "orders", label: "Захиалга", icon: ClipboardList },
  { key: "preferences", label: "Хувийн профайл", icon: Sparkles },
  { key: "wishlist", label: "Хүслийн жагсаалт", icon: Heart },
  { key: "addresses", label: "Хүргэлтийн хаяг", icon: MapPin },
  { key: "notifications", label: "Мэдэгдэл", icon: Bell },
  { key: "security", label: "Аюулгүй байдал", icon: ShieldCheck },
  { key: "support", label: "Тусламж", icon: HelpCircle },
  // PREMIUM-FEATURES.md TIER 5 — placed right after Тусламж per Tom's request (2026-08-25).
  { key: "loyalty", label: "Гишүүнчлэлийн карт", icon: CreditCard },
];

const ORDER_STATUS_LABEL: Record<string, string> = { pending: "Хүлээгдэж байна", confirmed: "Баталгаажсан", packed: "Бэлтгэж байна", out_for_delivery: "Хүргэлтэд гарсан", completed: "Дууссан", cancelled: "Цуцлагдсан", returned: "Буцаагдсан" };
// Audit 2026-09-09 (R2): the money-state pill shown next to the fulfilment
// pill -- only for the two states a customer actually needs to know about
// ("your money is coming back" / "your money came back"); a plain paid
// order says nothing extra, the timeline already covers it.
function PaymentStatePill({ order }: { order: { status: string; paymentStatus: string } }) {
  const badge = paymentBadgeFor(order);
  if (badge.tone !== "refund-owed" && badge.tone !== "refunded") return null;
  return <span className={`order-status-pill ${badge.tone}`}>{badge.label}</span>;
}

const ORDER_STEPS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Хүлээгдэж байна" },
  { key: "confirmed", label: "Баталгаажсан" },
  { key: "packed", label: "Бэлтгэсэн" },
  { key: "out_for_delivery", label: "Хүргэлтэд гарсан" },
  { key: "completed", label: "Хүргэгдсэн" },
];

// Preference Profile v2 (2026-09-01): these three option lists moved to
// shared/catalog-filter.ts (skinTypeOptions/skinConcernOptions/
// interiorStyleOptions) so ProfileQuizWizard.tsx and this file render the
// exact same labels — re-exported here under their old local names so the
// rest of this file (and the small existing preference summary below)
// didn't need touching.
const SKIN_TYPES = skinTypeOptions;
const SKIN_CONCERNS = skinConcernOptions;
const INTERIOR_STYLES = interiorStyleOptions;

const FAQ_ITEMS = HELP_FAQ;

export default function Profile() {
  const textFor = useSiteText();
  useDocumentMeta(textFor("seo-text-profile-title", "Миний профайл — SUGI ASAYAKE"), null);
  const { user, loading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [cartOpen, setCartOpen] = useState(false);
  const cartQuery = trpc.cart.current.useQuery();
  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  const tab: TabKey = (() => {
    const requested = new URLSearchParams(search).get("tab");
    return (TAB_KEYS as string[]).includes(requested ?? "") ? (requested as TabKey) : "overview";
  })();
  const goToTab = (next: TabKey) => setLocation(`/profile?tab=${next}`);

  const uploadAvatar = trpc.profile.uploadAvatar.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); toast.success("Зураг шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const removeAvatar = trpc.profile.removeAvatar.useMutation({ onSuccess: () => utils.auth.me.invalidate() });

  const onAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 4 MB-аас бага зураг сонгоно уу.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => uploadAvatar.mutate({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  if (!loading && !isAuthenticated) {
    return (
      <div className="sugi-commerce" style={{ overflow: "visible" }}>
        {/* Tom, 2026-09-05 (explicit): backLabel="" suppresses the redundant
            "SUGI ASAYAKE профайл" text span -- see Shop.tsx's identical
            change and CommerceHeader.tsx's comment for why an empty string
            (not omitting the prop) is what actually removes it. */}
        <CommerceHeader backLabel="" />
        <main className="profile-main">
          <section className="orders-gate">
            <LogIn size={24} style={{ margin: "0 auto" }} />
            <h2>{textFor("profile-text-signedout-heading", "Профайлаа харахын тулд нэвтэрнэ үү.")}</h2>
            <p>{textFor("profile-text-signedout-lede", "Хувийн мэдээлэл, зураг, хүслийн жагсаалт болон хүргэлтийн хаягаа энд хадгалж болно.")}</p>
            <button type="button" onClick={startLogin} className="button button-primary" style={{ marginTop: "24px" }}>Нэвтрэх</button>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="sugi-commerce" style={{ overflow: "visible" }}>
      <CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="" />
      <main className="profile-main" style={{ paddingBottom: "0" }}>
        <div className="profile-head" data-reveal>
          <div className="profile-avatar">
            <div className="profile-avatar-circle">
              {uploadAvatar.isPending ? <LoaderCircle className="animate-spin" size={22} /> : user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
            </div>
            <label className="profile-avatar-edit" aria-label="Зураг солих">
              <Camera size={14} />
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarSelected} disabled={uploadAvatar.isPending} />
            </label>
          </div>
          <div className="profile-head-copy">
            <h1>{user?.name?.trim() || "Нэргүй хэрэглэгч"}</h1>
            <p>{user?.email}</p>
            {user?.avatarUrl && <button type="button" onClick={() => removeAvatar.mutate()} disabled={removeAvatar.isPending} className="profile-avatar-remove">Зураг хасах</button>}
          </div>
        </div>
      </main>

      <div className="account-shell">
        <nav className="account-sidebar" aria-label="Профайлын цэс">
          {NAV_ITEMS.map(item => (
            <button key={item.key} type="button" className={`account-nav-item${tab === item.key ? " active" : ""}`} onClick={() => goToTab(item.key)}>
              <item.icon size={16} aria-hidden="true" /> {item.label}
            </button>
          ))}
          <div className="account-signout">
            <button type="button" className="account-nav-item" onClick={logout}><LogOut size={16} aria-hidden="true" /> Гарах</button>
          </div>
        </nav>

        <div className="account-main">
          {tab === "overview" && <OverviewTab onNavigate={goToTab} />}
          {tab === "orders" && <OrdersTab onCartOpen={() => setCartOpen(true)} />}
          {tab === "preferences" && <PreferencesTab />}
          {tab === "wishlist" && <WishlistTab onCartOpen={() => setCartOpen(true)} />}
          {tab === "addresses" && <AddressesTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "support" && <SupportTab />}
          {tab === "loyalty" && <LoyaltyTab />}
        </div>
      </div>

      <SiteFooter />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Overview                                                                */
/* ---------------------------------------------------------------------- */

function OverviewTab({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const textFor = useSiteText();
  const { user } = useAuth();
  // Audit 2026-09-09 (R4): orders.mine is cursor-paged now -- the overview
  // only needs the newest order and the true total, so ask for exactly that.
  const orders = trpc.orders.mine.useQuery({ limit: 1 });
  const wishlist = trpc.profile.wishlist.list.useQuery();
  const addresses = trpc.profile.addresses.list.useQuery();
  const latestOrder = orders.data?.orders[0];
  const firstName = user?.name?.trim()?.split(/\s+/)[0] || "Танд";

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="overview-hero" data-reveal>
        <p>{textFor("profile-text-greeting-kicker", "SUGI ASAYAKE / ТАНЫ ӨДӨР БҮР")}</p>
        <h2>Сайн байна уу, {firstName}.</h2>
        <span>{textFor("profile-text-greeting-lede", "Өглөөний туяа шиг гэрэлтээрэй — таны бүх мэдээлэл эндээс нэг дороос харагдана.")}</span>
      </div>

      <div className="overview-stats" data-reveal>
        <button type="button" className="overview-stat" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("orders")}>
          <strong>{orders.data?.total ?? "—"}</strong>
          <span>Нийт захиалга</span>
        </button>
        <button type="button" className="overview-stat" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("wishlist")}>
          <strong>{wishlist.data?.length ?? "—"}</strong>
          <span>Хүслийн жагсаалт</span>
        </button>
        <button type="button" className="overview-stat" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("addresses")}>
          <strong>{addresses.data?.length ?? "—"}</strong>
          <span>Хадгалсан хаяг</span>
        </button>
      </div>

      <section className="profile-section" data-reveal>
        <div className="profile-section-head"><div><h2>Сүүлийн захиалга</h2></div></div>
        {orders.isLoading ? (
          <div className="overview-latest-order" aria-busy="true"><div><LineSkeleton width="120px" height="14px" /><LineSkeleton width="180px" height="12px" style={{ marginTop: "8px" }} /></div><Skeleton style={{ width: "90px", height: "26px", borderRadius: "999px" }} /></div>
        ) : latestOrder ? (
          <div className="overview-latest-order">
            <div>
              <strong>{latestOrder.orderNumber}</strong>
              <span>{new Date(latestOrder.createdAt).toLocaleDateString("mn-MN")} · Нийт {formatMnt(latestOrder.totalMnt)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={`order-status-pill${latestOrder.status === "cancelled" ? " cancelled" : ""}`}>{ORDER_STATUS_LABEL[latestOrder.status] ?? latestOrder.status}</span>
              <PaymentStatePill order={latestOrder} />
              <button type="button" onClick={() => onNavigate("orders")} className="quiet-link">Дэлгэрэнгүй</button>
            </div>
          </div>
        ) : (
          <div className="address-empty">Захиалга байхгүй байна. <Link href="/shop" className="profile-empty-link">Дэлгүүр үзэх</Link></div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Orders                                                                  */
/* ---------------------------------------------------------------------- */

function OrderTimeline({ status }: { status: string }) {
  if (status === "cancelled") return null;
  const currentIndex = ORDER_STEPS.findIndex(step => step.key === status);
  return (
    <div className="order-timeline">
      {ORDER_STEPS.map((step, index) => (
        <div key={step.key} className={`order-timeline-step${currentIndex >= 0 && index <= currentIndex ? " done" : ""}`}>
          <span className="order-timeline-dot" />
          <span className="order-timeline-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function OrdersTab({ onCartOpen }: { onCartOpen: () => void }) {
  // Audit 2026-09-09 (R4): 20 orders per page, "Илүү үзэх" loads the next
  // page by cursor -- a customer's history is no longer one unbounded query.
  const orders = trpc.orders.mine.useInfiniteQuery({ limit: 20 }, { getNextPageParam: lastPage => lastPage.nextCursor ?? undefined });
  const orderList = orders.data?.pages.flatMap(page => page.orders) ?? [];
  const utils = trpc.useUtils();
  const addItem = trpc.cart.addItem.useMutation();
  const [buyingAgainId, setBuyingAgainId] = useState<number | null>(null);
  // Буцаалтын шалтгаан (2026-09-20): өмнө нь `window.prompt` байв — утсан дээр
  // хөтчийн жижиг мөр, урт өгүүлбэр бичих боломжгүй, ямар ч загваргүй, зарим
  // хөтөч бүр хаадаг. Сайтын өөрийн харилцах цонхоор солив.
  const [returnFor, setReturnFor] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState("");
  // Admin overhaul (2026-09-08, Phase G): a customer's first way to cancel
  // their own order without contacting support -- window.confirm matches
  // the weight this codebase already gives a reversible-in-spirit
  // destructive action (see the address-delete/logout-all-devices confirms
  // just below in this same file), not the heavier password-reentry flow
  // full account deletion uses.
  const requestReturn = trpc.orders.requestReturn.useMutation({
    onSuccess: () => { toast.success("Буцаалтын хүсэлт илгээгдлээ. Ажилтан тантай холбогдоно."); setReturnFor(null); setReturnReason(""); utils.orders.mine.invalidate(); },
    onError: error => toast.error(error instanceof Error ? error.message : "Буцаалтын хүсэлт илгээж чадсангүй."),
  });
  const cancelOrder = trpc.orders.cancel.useMutation({
    onSuccess: () => { utils.orders.mine.invalidate(); toast.success("Захиалгыг цуцаллаа."); },
    onError: error => toast.error(error instanceof Error ? error.message : "Захиалгыг цуцлах боломжгүй боллоо."),
  });

  const invoice = trpc.orders.invoicePdf.useMutation({
    onSuccess: ({ fileName, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = fileName; link.rel = "noopener";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: error => toast.error(error instanceof Error ? error.message : "Баримт үүсгэх боломжгүй боллоо."),
  });

  const buyAgain = async (order: (typeof orderList)[number]) => {
    const available = order.items.filter((item): item is typeof item & { productId: number } => item.productId != null);
    if (!available.length) { toast.error("Энэ захиалгын бүтээгдэхүүн(үүд) одоо каталогт байхгүй байна."); return; }
    setBuyingAgainId(order.id);
    let added = 0;
    for (const item of available) {
      try {
        await addItem.mutateAsync({ productId: item.productId, quantity: item.quantity });
        added += 1;
      } catch {
        // Out of stock or otherwise unavailable — skip and keep going with the rest.
      }
    }
    setBuyingAgainId(null);
    await utils.cart.current.invalidate();
    if (added) { notifyAddedToCart(`${added} бараа сагсанд нэмэгдлээ.`); onCartOpen(); }
    else toast.error("Нэмэгдсэн бараа алга — нөөц дууссан байж магадгүй.");
  };

  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head"><div><h2>Захиалгын түүх</h2><p>Захиалгын явц болон дахин захиалах</p></div></div>
      {orders.isLoading ? (
        <div className="order-list" style={{ marginTop: "0" }} aria-busy="true">
          {[0, 1].map(index => (
            <article key={index} className="order-card">
              <div className="order-card-head">
                <div><LineSkeleton width="140px" height="11px" /><Skeleton style={{ width: "160px", height: "22px", marginTop: "8px" }} /></div>
                <Skeleton style={{ width: "90px", height: "26px", borderRadius: "999px" }} />
              </div>
            </article>
          ))}
        </div>
      ) : orderList.length ? (
        <div className="order-list" style={{ marginTop: "0" }}>
          {orderList.map(order => (
            <article key={order.id} className="order-card">
              <div className="order-card-head">
                <div>
                  <p className="order-number">{order.orderNumber}</p>
                  <h2 className="order-date">{new Date(order.createdAt).toLocaleDateString("mn-MN")}</h2>
                </div>
                <span style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" }}>
                  <span className={`order-status-pill${order.status === "cancelled" ? " cancelled" : ""}`}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
                  <PaymentStatePill order={order} />
                </span>
              </div>
              <OrderTimeline status={order.status} />
              <div className="order-items">
                {order.items.map(item => (
                  <div key={`${order.id}-${item.sku}`} className="order-item">
                    <span>{item.productName} <span>× {item.quantity}</span></span>
                    <strong>{formatMnt(item.unitPriceMnt * item.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="order-foot">
                <span>{order.deliveryMethod === "store_pickup" ? `Авах салбар: ${order.pickupBranch ?? (order.items.some(item => item.kind === "gift_card") ? "Цахим (бэлгийн карт)" : "Сонгогдоогүй")}` : "Улаанбаатар хүргэлт"}</span>
                <strong>Нийт {formatMnt(order.totalMnt)}</strong>
              </div>
              {order.deliveryTrackingRef && <p className="order-tracking">Хүргэлтийн дугаар: {order.deliveryTrackingRef}</p>}
              {order.returnRequestedAt && <p className="order-tracking">{`Буцаалтын хүсэлт илгээсэн: ${new Date(order.returnRequestedAt).toLocaleDateString("mn-MN")}${order.status === "returned" ? " · буцаагдсан" : " · ажилтан шийдэх хүлээгдэж байна"}`}</p>}
              <GiftCardCodes cards={order.giftCards} pendingCount={order.status === "cancelled" ? 0 : order.items.reduce((sum, item) => sum + (item.kind === "gift_card" ? item.quantity : 0), 0)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button type="button" className="order-buy-again" disabled={buyingAgainId === order.id} onClick={() => buyAgain(order)}>
                  {buyingAgainId === order.id ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Дахин захиалах
                </button>
                <button type="button" className="order-buy-again" disabled={invoice.isPending && invoice.variables?.orderId === order.id} onClick={() => invoice.mutate({ orderId: order.id })}>
                  {invoice.isPending && invoice.variables?.orderId === order.id ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />} Баримт (PDF)
                </button>
                {order.status === "completed" && !order.returnRequestedAt && (
                  <button type="button" className="order-buy-again" disabled={requestReturn.isPending} onClick={() => { setReturnFor(order.id); setReturnReason(""); }}>
                    {requestReturn.isPending ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Буцаах хүсэлт
                  </button>
                )}
                {(order.status === "pending" || order.status === "confirmed") && (
                  <button type="button" className="order-buy-again" disabled={cancelOrder.isPending} onClick={() => { if (window.confirm("Энэ захиалгыг цуцлах уу? Энэ үйлдлийг буцаах боломжгүй.")) cancelOrder.mutate({ id: order.id }); }}>
                    {cancelOrder.isPending ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />} Захиалга цуцлах
                  </button>
                )}
              </div>
            </article>
          ))}
          {orders.hasNextPage && (
            <button type="button" className="order-buy-again" style={{ justifySelf: "center" }} disabled={orders.isFetchingNextPage} onClick={() => orders.fetchNextPage()}>
              {orders.isFetchingNextPage ? <Loader2 className="animate-spin" size={14} /> : <ChevronDown size={14} />} Өмнөх захиалгуудыг үзэх
            </button>
          )}
        </div>
      ) : (
        <div className="address-empty">Захиалга байхгүй байна. <Link href="/shop" className="profile-empty-link">Дэлгүүр үзэх</Link></div>
      )}
      <Dialog open={returnFor !== null} onOpenChange={open => { if (!open) setReturnFor(null); }}>
        <DialogContent className="return-dialog">
          <DialogHeader>
            <DialogTitle>Буцаах хүсэлт</DialogTitle>
            <DialogDescription>Юу болсныг товч бичнэ үү — гэмтэлтэй ирсэн, буруу бараа, дутуу гэх мэт. Ажилтан хүсэлтийг үзээд тантай холбогдоно.</DialogDescription>
          </DialogHeader>
          <label className="return-dialog-label" htmlFor="return-reason">Буцаах шалтгаан</label>
          <textarea
            id="return-reason"
            className="return-dialog-input"
            value={returnReason}
            onChange={event => setReturnReason(event.target.value)}
            placeholder="Жишээ: савлагаа нь гэмтэж ирсэн, тагнаас нь алдагдсан байна."
            rows={4}
            maxLength={500}
            autoFocus
            aria-describedby="return-reason-hint"
          />
          <p id="return-reason-hint" className="return-dialog-hint">{returnReason.trim().length < 5 ? "Дор хаяж 5 тэмдэгт бичнэ үү." : `${returnReason.trim().length} / 500 тэмдэгт`}</p>
          <DialogFooter>
            <button type="button" className="order-buy-again" onClick={() => setReturnFor(null)}>Болих</button>
            <button
              type="button"
              className="return-dialog-submit"
              disabled={requestReturn.isPending || returnReason.trim().length < 5}
              onClick={() => { if (returnFor !== null) requestReturn.mutate({ id: returnFor, reason: returnReason.trim() }); }}
            >
              {requestReturn.isPending ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Хүсэлт илгээх
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Preferences (contact info + Beauty & Home)                             */
/* ---------------------------------------------------------------------- */

function PreferencesTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
  }, [user?.name, user?.phone]);

  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); toast.success("Хувийн мэдээлэл шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });

  // Preference Profile v2 (2026-09-01): everything that used to be a static
  // form here (skin/interior pills + birthYear/occupation inputs) moved into
  // ProfileQuizWizard, a multi-step quiz reachable from the "Профайл засах"
  // button below — per Tom's explicit choice of a wizard over an expanded
  // single-page form (matches Curology/Typology/The Ordinary's UX pattern).
  // This card is now a read-only summary of whatever the wizard collected.
  const hasAnyPreference = Boolean(
    user?.skinType || user?.skinConcerns || user?.interiorStyle || user?.hairType || user?.hairConcerns ||
    user?.fragrancePreference || user?.wellnessInterests || user?.gender || user?.primaryDistrict ||
    user?.birthYear || user?.occupation || user?.skinRoutineComplexity || user?.hasYoungChildren != null ||
    user?.bodySkinType || user?.bodyConcerns,
  );
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : null;
  const summaryGroups: Array<{ title: string; chips: string[] }> = [
    {
      title: "Хувийн мэдээлэл",
      chips: [
        user?.gender ? genderLabels[user.gender as keyof typeof genderLabels] : null,
        user?.primaryDistrict ? ubDistrictLabels[user.primaryDistrict as UbDistrict] : null,
        age ? `${age} настай` : null,
        user?.occupation ?? null,
      ].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Арьсны профайл",
      chips: [
        user?.skinType ? SKIN_TYPES.find(option => option.value === user.skinType)?.label : null,
        ...(user?.skinConcerns ? user.skinConcerns.split(",").map(value => SKIN_CONCERNS.find(option => option.value === value)?.label).filter(Boolean) as string[] : []),
        user?.skinRoutineComplexity ? skinRoutineComplexityLabels[user.skinRoutineComplexity as keyof typeof skinRoutineComplexityLabels] : null,
      ].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Үсний профайл",
      chips: [
        user?.hairType ? hairTypeLabels[user.hairType as keyof typeof hairTypeLabels] : null,
        ...(user?.hairConcerns ? user.hairConcerns.split(",").map(value => hairConcernOptions.find(option => option.value === value)?.label).filter(Boolean) as string[] : []),
      ].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Биеийн арчилгаа",
      chips: [
        user?.bodySkinType ? bodySkinTypeLabels[user.bodySkinType as keyof typeof bodySkinTypeLabels] : null,
        ...(user?.bodyConcerns ? user.bodyConcerns.split(",").map(value => bodyConcernOptions.find(option => option.value === value)?.label).filter(Boolean) as string[] : []),
      ].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Үнэр & хэрэглээ",
      chips: [user?.fragrancePreference ? fragrancePreferenceLabels[user.fragrancePreference as keyof typeof fragrancePreferenceLabels] : null].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Эрүүл мэнд & амьдрал",
      chips: [
        ...(user?.wellnessInterests ? user.wellnessInterests.split(",").map(value => wellnessInterestOptions.find(option => option.value === value)?.label).filter(Boolean) as string[] : []),
        user?.hasYoungChildren === true ? "Бага насны хүүхэдтэй" : null,
      ].filter((chip): chip is string => Boolean(chip)),
    },
    {
      title: "Интерьер",
      chips: [user?.interiorStyle ? INTERIOR_STYLES.find(option => option.value === user.interiorStyle)?.label : null].filter((chip): chip is string => Boolean(chip)),
    },
  ].filter(group => group.chips.length > 0);

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <section className="profile-section" data-reveal>
        <div className="profile-section-head"><div><h2>Хувийн мэдээлэл</h2><p>Нэр болон хүргэлтэд хэрэглэх утасны дугаар</p></div></div>
        <form onSubmit={event => { event.preventDefault(); updateProfile.mutate({ name: name.trim() || null, phone: phone.trim() || null }); }} className="profile-form-grid">
          <label className="auth-field">
            Нэр
            <div className="auth-field-shell"><UserIcon size={16} aria-hidden="true" /><input value={name} onChange={event => setName(event.target.value)} placeholder="Таны нэр" maxLength={160} /></div>
          </label>
          <label className="auth-field">
            Утас
            <div className="auth-field-shell"><Phone size={16} aria-hidden="true" /><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="9911 2233" inputMode="tel" maxLength={40} /></div>
          </label>
          <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
            Имэйл
            <div className="auth-field-shell" style={{ opacity: .6 }}><Mail size={16} aria-hidden="true" /><input value={user?.email ?? ""} disabled readOnly /></div>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" disabled={updateProfile.isPending} className="button button-primary">{updateProfile.isPending && <LoaderCircle className="animate-spin" size={15} />} Хадгалах</button>
          </div>
        </form>
      </section>

      <section className="profile-section" data-reveal>
        <div className="profile-section-head">
          <div><h2>Таны тохиргоо</h2><p>Хувийн болон гоо сайхны/гэрийн профайл — танд тохирсон бүтээгдэхүүн санал болгоход ашиглагдана</p></div>
        </div>
        {hasAnyPreference ? (
          <div style={{ display: "grid", gap: "16px" }}>
            {summaryGroups.map(group => (
              <div key={group.title}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "var(--ck-muted)" }}>{group.title}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {group.chips.map(chip => (
                    <span key={chip} style={{ padding: "9px 14px", border: "1px solid rgba(23,24,27,.14)", background: "#fff", color: "#55565b", fontSize: "11px", fontWeight: 800, borderRadius: "999px" }}>{chip}</span>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <button type="button" onClick={() => setWizardOpen(true)} className="button button-primary"><Pencil size={15} /> Профайл засах</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px", textAlign: "center", padding: "24px 12px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#55565b" }}>6 асуулт, ~2 минут — танд тохирсон бүтээгдэхүүн санал болгоход тусална. Бүх асуулт заавал биш.</p>
            <div><button type="button" onClick={() => setWizardOpen(true)} className="button button-primary"><Sparkles size={15} /> Профайл бөглөх</button></div>
          </div>
        )}
      </section>

      <ProfileQuizWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Wishlist                                                                */
/* ---------------------------------------------------------------------- */

const fallbackImage = "/product-placeholder.svg";

function WishlistTab({ onCartOpen }: { onCartOpen: () => void }) {
  const utils = trpc.useUtils();
  const wishlist = trpc.profile.wishlist.list.useQuery();
  const toggle = trpc.profile.wishlist.toggle.useMutation({ onSuccess: () => utils.profile.wishlist.list.invalidate() });
  const addItem = trpc.cart.addItem.useMutation({
    onSuccess: () => { utils.cart.current.invalidate(); onCartOpen(); },
    onError: error => toast.error(messageFrom(error)),
  });

  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head"><div><h2>Хүслийн жагсаалт</h2><p>Таны хадгалсан бүтээгдэхүүнүүд</p></div></div>
      {wishlist.isLoading ? (
        <div className="wishlist-grid" aria-busy="true">
          {[0, 1, 2].map(index => (
            <article className="wishlist-card" key={index}>
              <div className="wishlist-card-image"><Skeleton style={{ position: "absolute", inset: 0, borderRadius: 0 }} /></div>
              <div className="wishlist-card-body"><LineSkeleton width="50%" height="9px" /><LineSkeleton width="85%" height="14px" style={{ marginTop: "8px" }} /><LineSkeleton width="35%" height="16px" style={{ marginTop: "8px" }} /></div>
            </article>
          ))}
        </div>
      ) : wishlist.data?.length ? (
        <div className="wishlist-grid">
          {wishlist.data.map(item => (
            <article className="wishlist-card" key={item.id}>
              <div className="wishlist-card-image">
                {item.stockQuantity <= 0 && <span className="wishlist-oos-badge">НӨӨЦ ДУУССАН</span>}
                <button type="button" className="wishlist-remove" aria-label="Хүслийн жагсаалтаас хасах" onClick={() => toggle.mutate({ productId: item.productId, saved: false })}>
                  <Heart size={15} fill="currentColor" />
                </button>
                <Link href={`/product/${item.slug}`}><img src={item.imageUrl ?? fallbackImage} alt={item.name} /></Link>
              </div>
              <div className="wishlist-card-body">
                <p>SUGI ASAYAKE</p>
                <Link href={`/product/${item.slug}`} style={{ color: "inherit" }}><h3>{item.name}</h3></Link>
                <strong>{formatMnt(item.priceMnt)}</strong>
                {item.stockQuantity > 0 ? (
                  <button type="button" onClick={() => addItem.mutate({ productId: item.productId, quantity: 1 }, { onSuccess: () => notifyAddedToCart(`${item.name} сагсанд нэмэгдлээ.`) })} className="button button-primary" style={{ marginTop: "10px", width: "100%", minHeight: "38px", fontSize: "10px" }}>
                    <ShoppingBag size={13} /> Сагслах
                  </button>
                ) : (
                  <label className="wishlist-notify">
                    <input type="checkbox" checked={item.notifyOnRestock} onChange={event => toggle.mutate({ productId: item.productId, saved: true, notifyOnRestock: event.target.checked })} />
                    Ирэхээр мэдэгдэх
                  </label>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="wishlist-empty">
          <Heart size={26} style={{ margin: "0 auto" }} />
          <p>Хүслийн жагсаалт хоосон байна. Бүтээгдэхүүний зураг дээрх зүрхэн дүрс дээр дарж нэмээрэй.</p>
          <Link href="/shop" className="button button-primary" style={{ marginTop: "16px", display: "inline-flex" }}>Дэлгүүр үзэх</Link>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Addresses                                                               */
/* ---------------------------------------------------------------------- */

const emptyAddressForm = { label: "", recipientName: "", phone: "", addressLine: "", district: "" as UbDistrict | "", isDefault: false };

function AddressForm({ initial, onCancel, onSubmit, isSubmitting }: {
  initial: typeof emptyAddressForm;
  onCancel: () => void;
  onSubmit: (value: typeof emptyAddressForm) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState(initial);
  return (
    <form
      className="address-form"
      onSubmit={event => {
        event.preventDefault();
        if (!form.label.trim() || !form.recipientName.trim() || !form.phone.trim() || !form.addressLine.trim()) {
          toast.error("Бүх талбарыг бөглөнө үү.");
          return;
        }
        onSubmit(form);
      }}
    >
      <div className="profile-form-grid">
        <label className="auth-field">
          Хаягийн нэр (жишээ: Гэр, Ажил)
          <div className="auth-field-shell"><Home size={16} aria-hidden="true" /><input value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} placeholder="Гэр" maxLength={60} /></div>
        </label>
        <label className="auth-field">
          Хүлээн авагчийн нэр
          <div className="auth-field-shell"><UserIcon size={16} aria-hidden="true" /><input value={form.recipientName} onChange={event => setForm(current => ({ ...current, recipientName: event.target.value }))} placeholder="Таны нэр" maxLength={160} /></div>
        </label>
        <label className="auth-field">
          Утас
          <div className="auth-field-shell"><Phone size={16} aria-hidden="true" /><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} placeholder="9911 2233" inputMode="tel" maxLength={40} /></div>
        </label>
        <label className="auth-field">
          Дүүрэг (сонголтоор)
          <div className="auth-field-shell"><MapPin size={16} aria-hidden="true" /><select value={form.district} onChange={event => setForm(current => ({ ...current, district: event.target.value as UbDistrict | "" }))}><option value="">Сонгох</option>{ubDistricts.map(key => <option key={key} value={key}>{ubDistrictLabels[key]}</option>)}</select></div>
        </label>
        <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
          Дэлгэрэнгүй хаяг
          <div className="auth-field-shell"><textarea value={form.addressLine} onChange={event => setForm(current => ({ ...current, addressLine: event.target.value }))} placeholder="Дүүрэг, хороо, байр, орц, тоот" style={{ minHeight: "70px", padding: "10px 0" }} maxLength={2000} /></div>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700 }}>
        <input type="checkbox" checked={form.isDefault} onChange={event => setForm(current => ({ ...current, isDefault: event.target.checked }))} style={{ accentColor: "var(--primary)" }} />
        Үндсэн хаяг болгох
      </label>
      <div className="address-form-actions">
        <button type="submit" disabled={isSubmitting} className="button button-primary">{isSubmitting && <LoaderCircle className="animate-spin" size={14} />} Хадгалах</button>
        <button type="button" onClick={onCancel} className="auth-quiet" style={{ width: "auto" }}>Цуцлах</button>
      </div>
    </form>
  );
}

function AddressesTab() {
  const utils = trpc.useUtils();
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const addresses = trpc.profile.addresses.list.useQuery();
  const createAddress = trpc.profile.addresses.create.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); setAddingAddress(false); toast.success("Хаяг нэмэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const updateAddress = trpc.profile.addresses.update.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); setEditingAddressId(null); toast.success("Хаяг шинэчлэгдлээ."); },
    onError: error => toast.error(messageFrom(error)),
  });
  const deleteAddress = trpc.profile.addresses.delete.useMutation({
    onSuccess: () => { utils.profile.addresses.list.invalidate(); toast.success("Хаяг устгагдлаа."); },
    onError: error => toast.error(messageFrom(error)),
  });

  type AddressRow = RouterOutputs["profile"]["addresses"]["list"][number];

  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head">
        <div><h2>Хүргэлтийн хаяг</h2><p>Захиалга хийхэд үндсэн хаяг автоматаар бөглөгдөнө</p></div>
        {!addingAddress && <button type="button" onClick={() => { setEditingAddressId(null); setAddingAddress(true); }} className="address-add-button"><Plus size={14} /> Хаяг нэмэх</button>}
      </div>

      {addresses.isLoading ? (
        <div className="profile-address-list" aria-busy="true">
          {[0, 1].map(index => (
            <div key={index} className="address-card">
              <div className="address-card-head"><MapPin size={15} style={{ color: "var(--primary)", opacity: .35 }} /><LineSkeleton width="100px" height="12px" /></div>
              <LineSkeleton width="90%" style={{ marginTop: "10px" }} />
              <LineSkeleton width="60%" style={{ marginTop: "6px" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="profile-address-list">
          {addresses.data?.length ? addresses.data.map((address: AddressRow) => (
            editingAddressId === address.id ? (
              <AddressForm
                key={address.id}
                initial={{ label: address.label, recipientName: address.recipientName, phone: address.phone, addressLine: address.addressLine, district: (address.district as UbDistrict | null) ?? "", isDefault: address.isDefault }}
                isSubmitting={updateAddress.isPending}
                onCancel={() => setEditingAddressId(null)}
                onSubmit={value => updateAddress.mutate({ id: address.id, ...value, district: value.district || null })}
              />
            ) : (
              <div key={address.id} className={`address-card${address.isDefault ? " is-default" : ""}`}>
                <div className="address-card-head">
                  <MapPin size={15} style={{ color: "var(--primary)" }} />
                  <strong>{address.label}</strong>
                  {address.isDefault && <span className="address-default-badge">ҮНДСЭН</span>}
                </div>
                <p>{address.recipientName} · {address.phone}<br />{address.addressLine}</p>
                <div className="address-card-actions">
                  {!address.isDefault && <button type="button" onClick={() => updateAddress.mutate({ id: address.id, isDefault: true })}><Star size={13} /> Үндсэн болгох</button>}
                  <button type="button" onClick={() => { setAddingAddress(false); setEditingAddressId(address.id); }}><Pencil size={13} /> Засах</button>
                  <button type="button" className="danger" onClick={() => { if (window.confirm("Энэ хаягийг устгах уу?")) deleteAddress.mutate({ id: address.id }); }}><Trash2 size={13} /> Устгах</button>
                </div>
              </div>
            )
          )) : !addingAddress && <div className="address-empty">Хадгалсан хаяг алга байна. Захиалга хийхдээ дахин бичихгүйн тулд эндээс нэмээрэй.</div>}

          {addingAddress && (
            <AddressForm
              initial={emptyAddressForm}
              isSubmitting={createAddress.isPending}
              onCancel={() => setAddingAddress(false)}
              onSubmit={value => createAddress.mutate({ ...value, district: value.district || null })}
            />
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Notifications                                                          */
/* ---------------------------------------------------------------------- */

function NotificationsTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const update = trpc.profile.updateNotifications.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
    onError: error => toast.error(messageFrom(error)),
  });

  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head"><div><h2>Мэдэгдэл</h2><p>Ямар мэдээллийг имэйл/SMS-ээр авахаа удирдана</p></div></div>
      <p style={{ margin: "0 0 4px", padding: "10px 13px", background: "#f1f6fb", color: "#3970a7", fontSize: "11px", lineHeight: 1.6 }}>
        {/* 2026-09-16: энэ тайлбар хуучирсан байв ("зөвхөн back-in-stock-д
            хамаарна, захиалгын имэйл ирээдүйд нэмэгдэнэ") — тэр цагаас хойш
            захиалгын имэйл, push, кампанит ажил бүгд бодитоор ажиллаж байна. */}
        Эдгээр тохиргоо нь сурталчилгаа, сануулгын мессежийг удирдана: "Ирэхээр мэдэгдэх" (хүслийн жагсаалт), орхисон сагсны сануулга, урамшууллын кампанит ажил. Захиалгын баталгаажуулалт болон төлөв өөрчлөгдсөн мэдэгдэл эдгээрээс хамаарахгүй — үргэлж очно.
      </p>
      <div className="pref-toggle-row">
        <div><strong>Имэйл мэдэгдэл</strong><span>Ирэхээр мэдэгдэх болон бусад имэйл мэдэгдлүүд</span></div>
        <label className="switch"><input type="checkbox" checked={user?.emailOptIn ?? true} onChange={event => update.mutate({ emailOptIn: event.target.checked })} /><span className="switch-track" /></label>
      </div>
      <div className="pref-toggle-row">
        <div><strong>SMS мэдэгдэл</strong><span>Захиалга, хүргэлттэй холбоотой богино мессеж</span></div>
        <label className="switch"><input type="checkbox" checked={user?.smsOptIn ?? true} onChange={event => update.mutate({ smsOptIn: event.target.checked })} /><span className="switch-track" /></label>
      </div>
      <PushToggleRow />
      {/* 2026-09-16 (migration 0086): дээрх шилжүүлэгч нь ЗАХИАЛГЫН явцад
          зөвшөөрөл өгдөг. Зар/урамшуулал нь тусдаа сонголт байх ёстой —
          эс бөгөөс "захиалгаа хянана" гэж асаасан хүн рүү сурталчилгаа
          илгээх нь амлалт зөрчинө (`emailOptIn`/`smsOptIn`-тэй ижил үүрэг). */}
      <div className="pref-toggle-row">
        <div><strong>Урамшуулал, шинэ бараа</strong><span>Хямдрал, шинэ бараа, гишүүнчлэлийн саналыг мэдэгдлээр авах (захиалгын мэдэгдэл үүнээс хамаарахгүй)</span></div>
        <label className="switch"><input type="checkbox" checked={user?.pushOptIn ?? true} onChange={event => update.mutate({ pushOptIn: event.target.checked })} /><span className="switch-track" /></label>
      </div>
    </section>
  );
}

// Customer Web Push (2026-09-13): one browser at a time. The row explains
// itself when the browser cannot do push (http:// LAN, iOS without "Add to
// Home Screen", permission denied) instead of failing silently.
function PushToggleRow() {
  const keyQuery = trpc.push.publicKey.useQuery(undefined, { staleTime: 10 * 60_000 });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const support = pushSupport();
  const status = trpc.push.status.useQuery({ endpoint: endpoint ?? "https://none.invalid/" }, { enabled: Boolean(endpoint) });
  useEffect(() => { void currentPushSubscription().then(sub => { setEndpoint(sub?.endpoint ?? null); setChecked(false); }); }, []);
  const subscribe = trpc.push.subscribe.useMutation({ onError: error => toast.error(messageFrom(error)) });
  const unsubscribe = trpc.push.unsubscribe.useMutation({ onError: error => toast.error(messageFrom(error)) });
  const test = trpc.push.test.useMutation({
    onSuccess: ({ delivered }) => delivered ? toast.success("Туршилтын мэдэгдэл илгээлээ.") : toast.error("Илгээгдсэнгүй — энэ хөтөч бүртгэлгүй байна."),
    onError: error => toast.error(messageFrom(error)),
  });
  if (!keyQuery.data?.key) return null;
  const enabled = checked || (Boolean(endpoint) && status.data === true);
  const busy = subscribe.isPending || unsubscribe.isPending || status.isLoading;
  const toggle = async (on: boolean) => {
    if (on) {
      const sub = await subscribeToPush(keyQuery.data!.key!);
      if (!sub) { toast.error("Хөтөч мэдэгдэл илгээхийг зөвшөөрсөнгүй."); return; }
      await subscribe.mutateAsync(sub);
      setEndpoint(sub.endpoint); setChecked(true);
      toast.success("Push мэдэгдэл асаалаа.");
    } else {
      const old = await unsubscribeFromPush();
      if (old) await unsubscribe.mutateAsync({ endpoint: old });
      setEndpoint(null); setChecked(false);
      toast.success("Push мэдэгдэл унтраалаа.");
    }
  };
  return (
    <div className="pref-toggle-row">
      <div>
        <strong>Push мэдэгдэл (энэ хөтөч)</strong>
        <span>{support === "needs-install" ? "iPhone, iPad дээр эхлээд сайтыг нүүр дэлгэцэд нэмнэ (Safari таб дотроос мэдэгдэл ирдэггүй) — ☰ цэсний \"Аппаар суулгах\"." : support === "unsupported" ? "Энэ хөтөч/холболт push дэмждэггүй (HTTPS шаардлагатай)." : support === "denied" ? "Хөтчийн тохиргоонд мэдэгдэл хаагдсан байна." : "Захиалгын явц (баталгаажсан, хүргэлтэд гарсан, хүргэгдсэн)"}</span>
        {enabled && <button type="button" className="auth-quiet" style={{ display: "inline", marginTop: 6 }} disabled={test.isPending} onClick={() => test.mutate()}>Туршилтын мэдэгдэл илгээх</button>}
      </div>
      <label className="switch"><input type="checkbox" disabled={support !== "ready" || busy} checked={enabled} onChange={event => { void toggle(event.target.checked); }} /><span className="switch-track" /></label>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Security                                                                */
/* ---------------------------------------------------------------------- */

function SecurityTab() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: () => { toast.success("Нууц үг амжилттай солигдлоо."); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); },
    onError: error => toast.error(messageFrom(error)),
  });
  const logoutAllDevices = trpc.auth.logoutAllDevices.useMutation({
    onSuccess: () => { toast.success("Бусад бүх төхөөрөмжийн session хүчингүй боллоо."); window.location.assign("/"); },
    onError: error => toast.error(messageFrom(error)),
  });
  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: () => { toast.success("Акаунт устгагдлаа."); window.location.assign("/"); },
    onError: error => toast.error(messageFrom(error)),
  });

  const submitPasswordChange = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) { toast.error("Шинэ нууц үг дор хаяж 8 тэмдэгт байх ёстой."); return; }
    if (newPassword !== confirmPassword) { toast.error("Шинэ нууц үг таарахгүй байна."); return; }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <section className="profile-section" data-reveal>
        <div className="profile-section-head"><div><h2>Нууц үг солих</h2></div></div>
        <form onSubmit={submitPasswordChange} className="profile-form-grid">
          <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
            Одоогийн нууц үг
            <div className="auth-field-shell"><input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" /></div>
          </label>
          <label className="auth-field">
            Шинэ нууц үг
            <div className="auth-field-shell"><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="8-с дээш тэмдэгт" autoComplete="new-password" /></div>
          </label>
          <label className="auth-field">
            Шинэ нууц үг давтах
            <div className="auth-field-shell"><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" disabled={changePassword.isPending} className="button button-primary">{changePassword.isPending && <LoaderCircle className="animate-spin" size={15} />} Нууц үг шинэчлэх</button>
          </div>
        </form>
      </section>

      <section className="profile-section" data-reveal>
        <div className="profile-section-head"><div><h2>Session удирдлага</h2><p>Бусад төхөөрөмж/хөтчөөс гарах</p></div></div>
        <button type="button" onClick={() => { if (window.confirm("Энэ таны БҮХ төхөөрөмж дээрх session-г хүчингүй болгоно (энэ хөтчийг оруулаад). Үргэлжлүүлэх үү?")) logoutAllDevices.mutate(); }} disabled={logoutAllDevices.isPending} className="button" style={{ background: "#17181b", color: "#fff" }}>
          <ShieldOff size={15} /> Бүх төхөөрөмжөөс гарах
        </button>
      </section>

      {user?.role === "user" && (
        <section className="danger-zone" data-reveal>
          <h3>Акаунт устгах</h3>
          <p>Энэ үйлдлийг буцаах боломжгүй. Таны хувийн мэдээлэл, хаяг, хүслийн жагсаалт бүрмөсөн устана (захиалгын түүх нягтлан бодох бүртгэлийн зорилгоор хадгалагдана).</p>
          {!confirmingDelete ? (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="danger-button">Акаунтаа устгах</button>
          ) : (
            <form onSubmit={event => { event.preventDefault(); deleteAccount.mutate({ password: deletePassword }); }} style={{ marginTop: "14px", display: "grid", gap: "10px", maxWidth: "320px" }}>
              <label className="auth-field">
                Баталгаажуулахын тулд нууц үгээ оруулна уу
                <div className="auth-field-shell"><input type="password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} autoComplete="current-password" /></div>
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" disabled={deleteAccount.isPending} className="danger-button">{deleteAccount.isPending && <LoaderCircle className="animate-spin" size={14} />} Бүрмөсөн устгах</button>
                <button type="button" onClick={() => { setConfirmingDelete(false); setDeletePassword(""); }} className="auth-quiet" style={{ width: "auto" }}>Цуцлах</button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Support / FAQ                                                          */
/* ---------------------------------------------------------------------- */

function SupportTab() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const contact = useShopContact();
  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head"><div><h2>Тусламж</h2><p>Түгээмэл асуултууд болон холбоо барих</p></div></div>
      <div>
        {FAQ_ITEMS.map((item, index) => (
          <div key={item.q} className={`faq-item${openIndex === index ? " open" : ""}`}>
            <button type="button" className="faq-question" onClick={() => setOpenIndex(current => current === index ? null : index)}>
              {item.q} <ChevronDown size={16} aria-hidden="true" />
            </button>
            <div className="faq-answer"><p>{item.a}</p></div>
          </div>
        ))}
      </div>
      <div className="support-contact">
        <a href={`tel:${contact.phoneHref}`}><Phone size={14} /> {contact.phone}</a>
        <a href={`mailto:${contact.email}`}><Mail size={14} /> {contact.email}</a>
        <Link href="/#stores"><MapPin size={14} /> Салбар олох</Link>
      </div>
    </section>
  );
}

// PREMIUM-FEATURES.md TIER 5: mirrors the physical Smart POS membership
// card (same phone-number-as-card-number concept, same cumulative-spend
// tier thresholds) — see shared/loyalty.ts for the tier table this reads.
// Each tier upgrades the card's own gradient (bronze/silver/gold) — the
// card visibly getting more premium as real spend climbs is the whole
// point, not just a bigger discount number.
const TIER_CARD_CLASS: Record<string, string> = { "Хүрэл": "tier-bronze", "Мөнгөн": "tier-silver", "Алтан": "tier-gold" };

function GiftCardRedeem() {
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const redeem = trpc.giftCards.redeem.useMutation({
    onSuccess: ({ amountMnt, storeCreditMnt }) => { toast.success(`${formatMnt(amountMnt)} дэлгүүрийн зээл нэмэгдлээ. Үлдэгдэл: ${formatMnt(storeCreditMnt)}`); setCode(""); utils.auth.me.invalidate(); utils.loyalty.myStatus.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  return (
    <form onSubmit={event => { event.preventDefault(); if (code.trim().length >= 8) redeem.mutate({ code: code.trim() }); }} className="gift-redeem">
      <div><strong>Бэлгийн карт ашиглах</strong><span>Кодоо оруулахад дүн нь дэлгүүрийн зээл болж, дараагийн захиалгад ашиглагдана.</span></div>
      <div className="gift-redeem-row">
        <input value={code} onChange={event => setCode(event.target.value)} placeholder="SUGI-XXXX-XXXX-XXXX" maxLength={24} autoComplete="off" spellCheck={false} aria-label="Бэлгийн картын код" />
        <button type="submit" className="order-buy-again" disabled={redeem.isPending || code.trim().length < 8}>{redeem.isPending ? <Loader2 className="animate-spin" size={14} /> : <Gift size={14} />} Ашиглах</button>
      </div>
    </form>
  );
}

function LoyaltyTab() {
  const status = trpc.loyalty.myStatus.useQuery();
  const data = status.data;

  return (
    <section className="profile-section" data-reveal>
      <div className="profile-section-head"><div><h2>Гишүүнчлэлийн карт</h2><p>Нийт худалдан авалтын дүнгээр автоматаар шатлан нэмэгддэг хөнгөлөлт</p></div></div>
      <GiftCardRedeem />

      {status.isLoading ? (
        <div aria-busy="true">
          <Skeleton style={{ width: "100%", height: "180px", borderRadius: "20px" }} />
          <div className="loyalty-progress"><LineSkeleton width="140px" style={{ marginTop: "18px" }} /><Skeleton style={{ width: "100%", height: "8px", marginTop: "10px", borderRadius: "999px" }} /></div>
        </div>
      ) : data && <>
        <div className={`loyalty-card ${TIER_CARD_CLASS[data.currentTier.name] ?? ""}`}>
          <div className="loyalty-card-top"><span>SUGI ASAYAKE MEMBER</span><Sparkles size={18} /></div>
          <strong className="loyalty-card-tier">{data.currentTier.name}</strong>
          <div className="loyalty-card-number">{data.cardNumber ? data.cardNumber : "Утасны дугаараа \"Хувийн профайл\" хэсэгт бүртгүүлж картаа идэвхжүүлээрэй"}</div>
          {data.currentTier.discountPercent > 0 && <div className="loyalty-card-bottom">Захиалга бүрт -{data.currentTier.discountPercent}%</div>}
        </div>

        <div className="loyalty-progress">
          <div className="loyalty-progress-row"><span>Нийт худалдан авалт</span><strong>{formatMnt(data.totalSpendMnt)}</strong></div>
          {data.nextTier ? <>
            <div className="loyalty-progress-bar"><div className="loyalty-progress-fill" style={{ width: `${Math.min(100, Math.round((data.totalSpendMnt / data.nextTier.minSpendMnt) * 100))}%` }} /></div>
            <p className="loyalty-progress-note">{`"${data.nextTier.name}" шатанд (-${data.nextTier.discountPercent}%) хүрэхэд ${formatMnt(data.amountToNextTierMnt ?? 0)} дутуу байна.`}</p>
          </> : <p className="loyalty-progress-note">Та хамгийн дээд шатанд хүрсэн байна — баярлалаа!</p>}
          {data.manualAdjustmentMnt > 0 && <p className="loyalty-progress-note">{`Үүнд манай салбарт биечлэн хийсэн ${formatMnt(data.manualAdjustmentMnt)} худалдан авалтын түүх багтсан.`}</p>}
        </div>

        <div className="loyalty-tiers">
          {/* 2026-09-12: the ladder is admin-editable (loyalty_tiers), and
              it arrives on the same payload that decided this shopper's own
              tier -- so the row highlighted as "active" can never disagree
              with the card above it, which a second query could. */}
          {data.tiers.map(tier => <div key={tier.name} className={`loyalty-tier-row${tier.name === data.currentTier.name ? " active" : ""}`}>
            <span><strong>{tier.name}</strong> · {tier.minSpendMnt > 0 ? `${formatMnt(tier.minSpendMnt)}-с эхлэн` : "0₮-с эхлэн"}</span>
            <span>{tier.discountPercent > 0 ? `-${tier.discountPercent}%` : "Хямдралгүй"}</span>
          </div>)}
        </div>
      </>}
    </section>
  );
}
