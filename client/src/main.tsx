import { adminTabId } from "@/lib/adminTab";
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

// PWA service worker (2026-09-13). Хуудас ачаалагдсаны дараа бүртгэгдэнэ тул
// эхний paint-тай хэзээ ч өрсөлдөхгүй; scope "/" тул /shop, /product/*, офлайн
// хуудас бүгд хамрагдана. Dev санаатай хасагдсан.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}

// Deploy-ийн дараах хуучин build (2026-09-13): code-split chunk эсвэл түүний CSS
// татагдахгүй үед Vite үүнийг өдөөнө — энэ tab нээлттэй байхад болсон deploy
// файлын нэрийг сольсон. Алдааны дэлгэц харуулахын оронд tab шинэ build-ийг
// авахын тулд нэг удаа reload хийнэ; lazyRetry() React.lazy замыг ижил аргаар
// хамарна. shared/chunk-error.ts.
window.addEventListener("vite:preloadError", event => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

// Алдааны бүртгэл (2026-09): server/_core/honeybadger.ts-тэй ижил Honeybadger
// төсөл, тусдаа VITE_-prefix түлхүүр — зөвхөн VITE_-prefix env хувьсагч client
// bundle-д ил гардаг — Vite ямар ч тохиолдолд built JS-д шингээнэ, гэхдээ энд
// хүлээгдсэн (Sentry-ийн public DSN-тэй ижил итгэлийн загвар, нууц биш).
// Түлхүүргүй бол сервер талтай ижил бүрэн no-op тул түлхүүргүй локал dev өмнөх
// шигээ ажиллана.
const honeybadgerApiKey = import.meta.env.VITE_HONEYBADGER_API_KEY as string | undefined;
// Bundle аудит (2026-09-13): @honeybadger-io/react storefront-ийн зочилт бүрт
// үндсэн chunk-ийн 55KB байсан атлаа энэ deploy дээр түлхүүр тохируулаагүй.
// Одоо зөвхөн түлхүүр байгаа үед, тэр үед ч эхний paint-ийн дараа ажилладаг
// dynamic import — нэг секунд хоцорч эхлэх алдааны мэдээлэл юу ч алдахгүй;
// critical path дээрх JS 4G утсанд LCP-ийн үнэтэй.
if (honeybadgerApiKey) {
  void import("@honeybadger-io/react").then(({ Honeybadger }) => {
    Honeybadger.configure({ apiKey: honeybadgerApiKey, environment: import.meta.env.DEV ? "development" : "production" });
  });
}

// Frontend гүйцэтгэлийн аудит (2026-09-02): defaultOptions-гүй бол React Query-
// ийн анхдагч staleTime 0 — remount/цонх focus бүр саяхан ирсэн өгөгдлийг ч
// дахин татдаг, давтан navigation-д харагдах ачааллын анивчилт. 30с нь ийм
// хэлбэрийн client-д React Query-ийн одоогийн (2026) зөвлөмжтэй таарна.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // 2026-09-12: сервер одоо амьд царайны баталгаагүй admin панелийн дуудлагыг
  // татгалзана (idle lock дууссан, эсвэл lock-оос өмнөх баталгаа). faceAuth.status-
  // ийг дахин асуух нь камерыг дэлгэцэнд буцаана; AdminFaceGate зөвхөн тэр query-
  // ээс render хийнэ.
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
        // Admin царайны баталгаа энэ tab-д холбоотой (client/src/lib/adminTab.ts);
        // бусад дуудлагад хор нөлөөгүй тул зүгээр л үргэлж илгээнэ.
        const headers = new Headers(init?.headers ?? {});
        headers.set("x-admin-tab", adminTabId());
        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
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

// Honeybadger-т мэдээлдэг React error boundary ижил багцад байдаг; түлхүүргүй
// бол App доторх энгийн ErrorBoundary нь хил болно.
createRoot(document.getElementById("root")!).render(app);
if (honeybadgerApiKey) {
  void import("@honeybadger-io/react").then(({ Honeybadger }) => {
    window.addEventListener("error", event => Honeybadger.notify(event.error ?? event.message));
    window.addEventListener("unhandledrejection", event => Honeybadger.notify(event.reason));
  });
}
