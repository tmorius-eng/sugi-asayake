import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
