import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer } = await import("vite");

  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplatePath = path.resolve(import.meta.dirname, "..", "..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplatePath, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}. Run "pnpm build" first.`);
  }

  app.use(express.static(distPath));

  // SPA fallback: any route that isn't a static asset or an already-handled
  // /api/* route falls back to index.html so client-side routing works.
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
