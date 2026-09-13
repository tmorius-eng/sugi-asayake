import { trpc } from "@/lib/trpc";
import { FACE_REQUIRED_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { captureTrafficSource } from "./lib/trafficSource";
import { reloadOnceForStaleChunk } from "./lib/lazyRetry";
import "./index.css";

captureTrafficSource();

// Stale build after a deploy (2026-09-13): Vite fires this when a code-split
// chunk or its CSS cannot be fetched -- the file was renamed by a deploy that
// happened while this tab was open. Reload once so the tab picks up the new
// build instead of showing an error screen; lazyRetry() covers the
// React.lazy path the same way. See shared/chunk-error.ts.
window.addEventListener("vite:preloadError", event => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

// Error tracking (2026-09): same Honeybadger project as server/_core/
// honeybadger.ts, a separate VITE_-prefixed key because only VITE_-prefixed
// env vars are exposed to the client bundle -- Vite bakes it into the built
// JS either way, but that's expected here (same trust model as Sentry's
// public DSN, not a secret). No-ops entirely without a key, same as the
// server side, so local dev without one behaves exactly as before.
const honeybadgerApiKey = import.meta.env.VITE_HONEYBADGER_API_KEY as string | undefined;
// Bundle audit (2026-09-13): @honeybadger-io/react was 55KB of the main
// chunk on every storefront visit, with no key configured on this
// deployment. It is now a dynamic import that runs only when a key exists,
// and even then after first paint -- error reporting that starts a second
// late loses nothing; JS on the critical path costs LCP on a 4G phone.
if (honeybadgerApiKey) {
  void import("@honeybadger-io/react").then(({ Honeybadger }) => {
    Honeybadger.configure({ apiKey: honeybadgerApiKey, environment: import.meta.env.DEV ? "development" : "production" });
  });
}

// Frontend performance audit (2026-09-02): with no defaultOptions, React
// Query's own default staleTime is 0 -- every remount/window-refocus
// re-fetches even data that just resolved moments earlier, a visible
// loading flicker on repeat navigation. 30s matches current (2026) React
// Query guidance for a client this shape.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // 2026-09-12: the server now refuses admin-panel calls without a live
  // face proof (idle lock lapsed, or a proof from before the lock existed).
  // Re-asking faceAuth.status is what puts the camera back on screen; the
  // AdminFaceGate renders from that query alone.
  if (error.message === FACE_REQUIRED_ERR_MSG) {
    void queryClient.invalidateQueries({ predicate: query => Array.isArray(query.queryKey[0]) && (query.queryKey[0] as unknown[])[0] === "faceAuth" });
    return;
  }

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

const app = (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// The React error boundary that reports to Honeybadger lives in the same
// package; without a key the plain ErrorBoundary inside App is the boundary.
createRoot(document.getElementById("root")!).render(app);
if (honeybadgerApiKey) {
  void import("@honeybadger-io/react").then(({ Honeybadger }) => {
    window.addEventListener("error", event => Honeybadger.notify(event.error ?? event.message));
    window.addEventListener("unhandledrejection", event => Honeybadger.notify(event.reason));
  });
}
