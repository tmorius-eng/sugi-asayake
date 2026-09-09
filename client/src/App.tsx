import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import AddedToCartToast from "./components/AddedToCartToast";
import BottomNavBar from "./components/BottomNavBar";
import ErrorBoundary from "./components/ErrorBoundary";
import SitePromo from "./components/SitePromo";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { PageviewTracker } from "./lib/pageviewTracking";
import { useScrollReveal } from "./hooks/useScrollReveal";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Journal = lazy(() => import("./pages/Journal"));
const Legal = lazy(() => import("./pages/Legal"));
const Login = lazy(() => import("./pages/Login"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const RoutineDetail = lazy(() => import("./pages/RoutineDetail"));
const Shop = lazy(() => import("./pages/Shop"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));

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
  return <Suspense fallback={<RouteLoadingFallback />}><Switch>
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
    <Route path={"/:slug"} component={PostDetail} />
    <Route component={NotFound} />
  </Switch></Suspense>;
}

function App() {
  return <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <PageviewTracker />
        <SitePromo />
        <BottomNavBar />
        <AddedToCartToast />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;