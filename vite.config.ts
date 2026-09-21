import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// 2026-09-13: Vite answers any request whose Host header it does not recognise
// with "Blocked request. This host is not allowed." (its DNS-rebinding guard).
// A Cloudflare Tunnel sends exactly such a Host, so `pnpm dev` behind one is
// unusable until the tunnel hostname is listed here -- verified by sending
// `Host: <name>.trycloudflare.com` to the dev server and getting 403, while
// the same header against `pnpm start` (production build, which has no Vite
// in the request path) returned 200. Comma-separated; a leading dot covers a
// domain and its subdomains (".trycloudflare.com"). Unset, nothing changes.
const devAllowedHosts = (process.env.DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

/**
 * Аппын JS-ийг `fetchpriority="low"`-той болгоно (2026-09-21, production build).
 *
 * Утасны сүлжээнд index.html-ийн дараа CSS, hero зураг, шрифт, 190 KB JS бүгд
 * НЭГ зурвасын өргөнийг хуваадаг. Нүүрний дээд хэсэг одоо серверээс HTML-ээр
 * ирдэг (server/_core/heroShell.ts) тул зурагдахад JS хэрэггүй — зөвхөн CSS ба
 * зураг. JS-ийг "low" болгосноор хөтөч CSS/зургийг түрүүлж татаж, hero
 * throttled Lighthouse дээр 3.0 → 2.2 с болов (JS хэдэн зуун мс хожуу ирнэ,
 * гэхдээ тэр үед харагдах зүйл аль хэдийн дэлгэцэн дээр). Vite-ийн үүсгэдэг
 * <script type="module"> ба modulepreload хоёуланд; dev HTML-д тохирох tag
 * байхгүй тул нөлөөгүй.
 */
const lowPriorityAppScripts = (): Plugin => ({
  name: "sugi-low-priority-app-scripts",
  transformIndexHtml: {
    order: "post",
    handler: html => html
      .replace(/<script type="module" crossorigin src="\/assets\//g, '<script type="module" crossorigin fetchpriority="low" src="/assets/')
      .replace(/<link rel="modulepreload" crossorigin href="\/assets\//g, '<link rel="modulepreload" crossorigin fetchpriority="low" href="/assets/'),
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), lowPriorityAppScripts()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Frontend performance audit (2026-09-02): without this, React/
        // ReactDOM/react-query/trpc-client end up fused into the same chunk
        // as app code (client/src/main.tsx:9's eager Home import pulls them
        // all in together), so every app-code change invalidates the whole
        // framework layer's browser cache on every deploy. Splitting them
        // into their own chunk means a returning visitor keeps this chunk
        // cached across deploys that only touch app code -- real savings on
        // Mongolia's median 17 Mbps mobile connection.
        manualChunks: {
          vendor: ["react", "react-dom", "@tanstack/react-query", "@trpc/client", "@trpc/react-query"],
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: devAllowedHosts.length > 0 ? devAllowedHosts : undefined,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
