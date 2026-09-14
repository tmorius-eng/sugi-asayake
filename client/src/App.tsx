import { Toaster } from "@/components/ui/sonner";
import { useScrollToTopOnNavigate } from "./hooks/useScrollToTopOnNavigate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, useEffect } from "react";
import { lazyRetry, markChunksHealthy } from "./lib/lazyRetry";
import { Route, Switch, useLocation } from "wouter";
import AddedToCartToast from "./components/AddedToCartToast";
import BackToTop from "./components/BackToTop";
import MessengerButton from "./components/MessengerButton";
import BarcodeScanNavigator from "./components/BarcodeScanNavigator";
import BottomNavBar from "./components/BottomNavBar";
import ErrorBoundary from "./components/ErrorBoundary";
import SitePromo from "./components/SitePromo";
import { ThemeProvider } from "./contexts/ThemeContext";
import TranslateSurface from "@/components/TranslateSurface";
import Home from "./pages/Home";
import { PageviewTracker } from "./lib/pageviewTracking";
import { useConsentIconAutoHide } from "./lib/consentIconAutoHide";
import { useScrollReveal } from "./hooks/useScrollReveal";

const AdminDashboard = lazyRetry(() => import("./pages/AdminDashboard"));
// Зөвхөн dev: admin workspace `preview` горимд (нэвтрэлтгүй, царайны хаалгагүй,
// fallback өгөгдөлтэй) — панелийн render-ийг бодит admin session-гүйгээр
// Playwright-аар шалгахын тулд. Production build-аас tree-shake хийгдэнэ.
const AdminPreview = import.meta.env.DEV ? lazyRetry(() => import("./components/AdminWorkspace").then(m => ({ default: () => <m.default preview /> }))) : null;
const Checkout = lazyRetry(() => import("./pages/Checkout"));
const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const Journal = lazyRetry(() => import("./pages/Journal"));
const Brands = lazyRetry(() => import("./pages/Brands"));
const Legal = lazyRetry(() => import("./pages/Legal"));
const Help = lazyRetry(() => import("./pages/Help"));
const Login = lazyRetry(() => import("./pages/Login"));
const MyOrders = lazyRetry(() => import("./pages/MyOrders"));
const NotFound = lazyRetry(() => import("@/pages/NotFound"));
const PostDetail = lazyRetry(() => import("./pages/PostDetail"));
const ProductDetail = lazyRetry(() => import("./pages/ProductDetail"));
const Profile = lazyRetry(() => import("./pages/Profile"));
const RoutineDetail = lazyRetry(() => import("./pages/RoutineDetail"));
const Shop = lazyRetry(() => import("./pages/Shop"));
const TrackOrder = lazyRetry(() => import("./pages/TrackOrder"));

function RouteLoadingFallback() {
  return <main className="min-h-screen bg-[#f6f3ee] grid place-items-center px-6 text-center">
    <div>
      <p className="font-display text-2xl text-[#1f2525]">SUGI ASAYAKE</p>
      <p className="mt-2 text-sm text-[#6f7473]">Түр хүлээнэ үү…</p>
    </div>
  </main>;
}

function Router() {
  // 2026-09-09 гүнзгий аудит: reveal hook өмнө нь хуудас бүрт (зөвхөн Home, Shop,
  // Profile) дуудагддаг байсан тул өөр хуудасны [data-reveal] хэсэг — барааны
  // хуудас бүрийн холбоотой барааны тавиур — .is-revealed классаа хэзээ ч аваагүй,
  // доорх хэсгийн дээгүүр 18px шилжсэн хэвээр байв.
  // Энд нэг observer (DOM-д шинэ node ажиглана) бүх route-ыг хамарна.
  useScrollReveal();
  // Сонголт хийснээс 10с-ийн дараа байнга зогсдог күкийн товчийг хураана
  // (буцах зам нь footer-ийн "Күкийн тохиргоо"). Hook-ийг үзнэ.
  useConsentIconAutoHide();
  // 2026-09-12: урагшлах navigation шинэ хуудасны дээрээс эхэлнэ; үүнгүйгээр
  // хуучин scroll байрлал дамжиж байв (hook-ийг үзнэ).
  useScrollToTopOnNavigate();
  const [location] = useLocation();
  // 2026-09-12 (Tom: "./admin page ees busad buh page iig ene cosme kitchen
  // shig design conceptoi bolgo"): restyle `.sugi-site`-д хязгаарлагдсан тул
  // /admin-аас бусад route бүрийг түүгээр ороох нь цагаан хуудас, шрифтийн хэмжээ,
  // hairline гадаргууг storefront даяар хүргэнэ. Admin панель өөрийн палитр,
  // токенуудаа хөндөгдөөгүй хэвээр хадгална.
  const storefront = !location.startsWith("/admin");
  return <div className={storefront ? "sugi-site" : undefined}>
    {storefront && <a href="#main-content" className="skip-link">Агуулга руу очих</a>}
    <div id="main-content" tabIndex={-1}><Suspense fallback={<RouteLoadingFallback />}><Switch>
    <Route path={"/"} component={Home} />
    <Route path={"/product/:slug"} component={ProductDetail} />
    <Route path={"/routine/:slug"} component={RoutineDetail} />
    <Route path={"/shop"} component={Shop} />
    <Route path={"/orders"} component={MyOrders} />
    <Route path={"/profile"} component={Profile} />
    <Route path={"/checkout"} component={Checkout} />
    <Route path={"/admin"} component={AdminDashboard} />
    {AdminPreview && <Route path={"/__admin-preview"} component={AdminPreview} />}
    <Route path={"/login"} component={Login} />
    <Route path={"/forgot-password"} component={ForgotPassword} />
    <Route path={"/track-order"} component={TrackOrder} />
    <Route path={"/privacy"} component={Legal} />
    <Route path={"/terms"} component={Legal} />
    <Route path={"/returns"} component={Legal} />
    <Route path={"/help"} component={Help} />
    <Route path={"/404"} component={NotFound} />
    {/* Must come before the /:slug catch-all below, or "/journal" would be
        read as a post-slug lookup (and 404, since no post has that slug)
        instead of reaching this page. */}
    <Route path={"/journal"} component={Journal} />
    <Route path={"/brands"} component={Brands} />
    <Route path={"/:slug"} component={PostDetail} />
    <Route component={NotFound} />
  </Switch></Suspense></div></div>;
}

function App() {
  // Render хийгдсэн хуудас нь энэ tab ажилладаг build-тэйн баталгаа тул дараагийн
  // deploy (хэдэн цагийн дараа ч бай) өөрийн нэг удаагийн reload-ыг авна.
  useEffect(() => { markChunksHealthy(); }, []);
  useEffect(() => {
    const warm = () => {
      void import("./pages/Shop");
      void import("./pages/ProductDetail");
      void import("./pages/Checkout");
    };
    // Safari-д requestIdleCallback байхгүй; богино timer нь fallback.
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback; cancelIdleCallback?: typeof cancelIdleCallback };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = setTimeout(warm, 2500);
    return () => clearTimeout(id);
  }, []);
  return <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <PageviewTracker />
        {/* Translates whatever the storefront renders; see the component. */}
        <TranslateSurface />
        <BarcodeScanNavigator />
        <SitePromo />
        <BottomNavBar />
        <BackToTop />
        <MessengerButton />
        <AddedToCartToast />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;