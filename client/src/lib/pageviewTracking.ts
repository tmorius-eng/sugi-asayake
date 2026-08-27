import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getStoredTrafficSource } from "@/lib/trafficSource";

/**
 * Tier E analytics: fires one best-effort pageview beacon per route change
 * (including the very first page load, since effects run after mount) --
 * see drizzle/schema.ts's visitorSessions and server/routers.ts's
 * telemetry.pageview. Deliberately fire-and-forget: no loading state, no
 * error toast, must never visibly affect the page even if the call fails.
 * Skips /admin -- that's the store's own staff navigating, not customer
 * traffic, and counting it would inflate/pollute Conversion Rate.
 */
export function PageviewTracker() {
  const [location] = useLocation();
  const trackPageview = trpc.telemetry.pageview.useMutation();

  useEffect(() => {
    if (location.startsWith("/admin")) return;
    trackPageview.mutate({ path: location, trafficSource: getStoredTrafficSource() ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return null;
}
