import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getStoredTrafficSource } from "@/lib/trafficSource";
import { hasAnalyticsConsent } from "@/lib/cookieConsent";

/**
 * Tier E analytics: fires one best-effort pageview beacon per route change
 * (including the very first page load, since effects run after mount) --
 * see drizzle/schema.ts's visitorSessions and server/routers.ts's
 * telemetry.pageview. Deliberately fire-and-forget: no loading state, no
 * error toast, must never visibly affect the page even if the call fails.
 * Skips /admin -- that's the store's own staff navigating, not customer
 * traffic, and counting it would inflate/pollute Conversion Rate.
 *
 * 2026-09-06: this is the ONE call site for telemetry.pageview in the whole
 * client (the mutation is what sets the real sugi_visitor_session cookie
 * server-side, server/routers.ts's `if (isNewToken) ctx.res.cookie(...)`) --
 * so gating it here is the single choke point that stops 100% of the
 * analytics-cookie traffic when the visitor hasn't opted in via the Silktide
 * consent banner (client/index.html). Re-evaluated on every route change
 * (the effect's own dependency array), so a mid-visit consent change takes
 * effect starting with the *next* navigation, not retroactively -- consistent
 * with this beacon's existing one-fire-per-route-change design, not a bug.
 */
export function PageviewTracker() {
  const [location] = useLocation();
  const trackPageview = trpc.telemetry.pageview.useMutation();

  useEffect(() => {
    if (location.startsWith("/admin")) return;
    if (!hasAnalyticsConsent()) return;
    trackPageview.mutate({ path: location, trafficSource: getStoredTrafficSource() ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return null;
}
