import { trpc } from "@/lib/trpc";
import { FACE_REQUIRED_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { Honeybadger, HoneybadgerErrorBoundary } from "@honeybadger-io/react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { captureTrafficSource } from "./lib/trafficSource";
import "./index.css";

captureTrafficSource();

// Error tracking (2026-09): same Honeybadger project as server/_core/
// honeybadger.ts, a separate VITE_-prefixed key because only VITE_-prefixed
// env vars are exposed to the client bundle -- Vite bakes it into the built
// JS either way, but that's expected here (same trust model as Sentry's
// public DSN, not a secret). No-ops entirely without a key, same as the
// server side, so local dev without one behaves exactly as before.
const honeybadgerApiKey = import.meta.env.VITE_HONEYBADGER_API_KEY as string | undefined;
if (honeybadgerApiKey) {
  Honeybadger.configure({ apiKey: honeybadgerApiKey, environment: import.meta.env.DEV ? "development" : "production" });
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

createRoot(document.getElementById("root")!).render(
  honeybadgerApiKey ? <HoneybadgerErrorBoundary honeybadger={Honeybadger}>{app}</HoneybadgerErrorBoundary> : app
);
