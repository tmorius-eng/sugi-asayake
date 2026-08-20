import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Legal = lazy(() => import("./pages/Legal"));
const Login = lazy(() => import("./pages/Login"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Shop = lazy(() => import("./pages/Shop"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));

function RouteLoadingFallback() {
  return <main className="min-h-screen bg-[#f6f3ee] grid place-items-center px-6 text-center">
    <div>
      <p className="font-display text-2xl text-[#1f2525]">SUGI ASAYAKE</p>
      <p className="mt-2 text-sm text-[#6f7473]">Түр хүлээнэ үү…</p>
    </div>
  </main>;
}

function Router() {
  return <Suspense fallback={<RouteLoadingFallback />}><Switch>
    <Route path={"/"} component={Home} />
    <Route path={"/product/:slug"} component={ProductDetail} />
    <Route path={"/shop"} component={Shop} />
    <Route path={"/orders"} component={MyOrders} />
    <Route path={"/checkout"} component={Checkout} />
    <Route path={"/admin"} component={AdminDashboard} />
    <Route path={"/login"} component={Login} />
    <Route path={"/forgot-password"} component={ForgotPassword} />
    <Route path={"/reset-password/:token"} component={ResetPassword} />
    <Route path={"/verify-email/:token"} component={VerifyEmail} />
    <Route path={"/invite/:token"} component={AcceptInvitation} />
    <Route path={"/privacy"} component={Legal} />
    <Route path={"/terms"} component={Legal} />
    <Route path={"/returns"} component={Legal} />
    <Route path={"/404"} component={NotFound} />
    <Route path={"/:slug"} component={PostDetail} />
    <Route component={NotFound} />
  </Switch></Suspense>;
}

function ResumeStaffInvitation() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || typeof window === "undefined") return;
    const token = sessionStorage.getItem("sugi-pending-invite");
    if (!token || window.location.pathname.startsWith("/invite/")) return;
    sessionStorage.removeItem("sugi-pending-invite");
    window.location.assign(`/invite/${token}`);
  }, [loading, user]);

  return null;
}

function App() {
  return <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <ResumeStaffInvitation />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;