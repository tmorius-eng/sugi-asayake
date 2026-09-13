import { Toaster } from "@/components/ui/sonner";
import { useScrollToTopOnNavigate } from "./hooks/useScrollToTopOnNavigate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, useEffect } from "react";
import { lazyRetry, markChunksHealthy } from "./lib/lazyRetry";
import { Route, Switch, useLocation } from "wouter";
import AddedToCartToast from "./components/AddedToCartToast";
import BackToTop from "./components/BackToTop";
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
const Checkout = lazyRetry(() => import("./pages/Checkout"));
const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const Journal = lazyRetry(() => import("./pages/Journal"));
const Brands = lazyRetry(() => import("./pages/Brands"));
const Legal = lazyRetry(() => import("./pages/Legal"));
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
  // 2026-09-09 deep audit: the reveal hook used to be called per page (Home,
  // Shop, Profile only), so any [data-reveal] section on another page --
  // the related-products shelf on every product page -- never got its
  // .is-revealed class and stayed shifted 18px over the section below it.
  // One observer here (it watches the DOM for new nodes) covers all routes.
  useScrollReveal();
  // Retires the permanently-parked cookie button 10s after a choice is made
  // (the footer's "Күкийн тохиргоо" is the way back). See the hook.
  useConsentIconAutoHide();
  // 2026-09-12: a forward navigation starts at the top of the new page;
  // without this the old scroll offset carried over (see the hook).
  useScrollToTopOnNavigate();
  const [location] = useLocation();
  // 2026-09-12 (Tom: "./admin page ees busad buh page iig ene cosme kitchen
  // shig design conceptoi bolgo"): the restyle is scoped to `.sugi-site`, so
  // wrapping every route except /admin in it carries the white page, the
  // type scale and the hairline surfaces across the whole storefront. The
  // admin panel keeps its own palette and its own tokens, untouched.
  const storefront = !location.startsWith("/admin");
  return <div className={storefront ? "sugi-site" : undefined}><Suspense fallback={<RouteLoadingFallback />}><Switch>
    <Route path={"/"} component={Home} />
    <Route path={"/product/:slug"} component={ProductDetail} />
    <Route path={"/routine/:slug"} component={RoutineDetail} />
    <Route path={"/shop"} component={Shop} />
    <Route path={"/orders"} component={MyOrders} />
    <Route path={"/profile"} component={Profile} />
    <Route path={"/checkout"} component={Checkout} />
    <Route path={"/admin"} component={AdminDashboard} />
    <Route path={"/login"} component={Login} />
    <Route path={"/forgot-password"} component={ForgotPassword} />
    <Route path={"/track-order"} component={TrackOrder} />
    <Route path={"/privacy"} component={Legal} />
    <Route path={"/terms"} component={Legal} />
    <Route path={"/returns"} component={Legal} />
    <Route path={"/404"} component={NotFound} />
    {/* Must come before the /:slug catch-all below, or "/journal" would be
        read as a post-slug lookup (and 404, since no post has that slug)
        instead of reaching this page. */}
    <Route path={"/journal"} component={Journal} />
    <Route path={"/brands"} component={Brands} />
    <Route path={"/:slug"} component={PostDetail} />
    <Route component={NotFound} />
  </Switch></Suspense></div>;
}

function App() {
  // A page that rendered is proof this tab holds a working build, so the
  // next deploy (however many hours away) is allowed its own one-time reload.
  useEffect(() => { markChunksHealthy(); }, []);
  useEffect(() => {
    const warm = () => {
      void import("./pages/Shop");
      void import("./pages/ProductDetail");
      void import("./pages/Checkout");
    };
    // Safari has no requestIdleCallback; a short timer is the fallback.
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
        <AddedToCartToast />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;