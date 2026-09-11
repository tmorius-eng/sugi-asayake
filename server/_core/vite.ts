import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { renderIndexHtml } from "./indexHtml";

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
      // Same substitution as production (see serveStatic) so an SEO edit can
      // actually be checked locally instead of only after a deploy.
      template = await renderIndexHtml(template);
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

  // Frontend performance audit (2026-09-02): this used to pass no options
  // at all, so content-hashed, cache-forever-safe build output (every file
  // under assets/, e.g. index-y8Ypxe4P.js) shipped with no Cache-Control
  // header whatsoever -- a real cost on Mongolia's median 17 Mbps mobile
  // connection, where a returning visitor re-downloads the same JS/CSS on
  // every visit for no reason. assets/ gets a year-long immutable cache
  // (safe -- a new build produces new hashed filenames, never reuses one);
  // everything else (index.html, and public/ files copied verbatim without
  // a hash, e.g. category-placeholder-*.svg) keeps no-cache, so a deploy
  // never leaves a returning visitor's browser holding a stale index.html
  // that references asset filenames which no longer exist.
  app.use(express.static(distPath, {
    // `index: false` so express.static does NOT answer "/" with the raw
    // index.html off disk -- that file still contains the %SEO_*%
    // placeholders, and serving it verbatim would put literal "%SEO_TITLE%"
    // in the browser tab. Every HTML response has to go through the
    // fallback below, which fills them in.
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  const templatePath = path.resolve(distPath, "index.html");

  // SPA fallback: any route that isn't a static asset or an already-handled
  // /api/* route falls back to index.html so client-side routing works.
  app.use("*", async (_req, res, next) => {
    try {
      const template = await fs.promises.readFile(templatePath, "utf-8");
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(await renderIndexHtml(template));
    } catch (error) {
      next(error);
    }
  });
}
