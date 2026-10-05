import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Request, Response } from "express";
import { getActiveThemeBundle, getSiteName, getSiteTextValue } from "../db";
import { ubDateKey } from "../../shared/notification-events";
import { getOrSetCached } from "./ttlCache";

/**
 * PWA manifest серверээс (эзэн солих, 2026-10-05). Өмнө нь client/public/manifest.webmanifest
 * статик — "SUGI ASAYAKE" нэр, улаан өнгө хатуу байсан тул шинэ эзэн сайтаа апп болгон суулгахад
 * хуучин нэр гарах байв. Одоо статик файлыг загвар болгож нэр (`seo-text-site-name`,
 * `brand-text-short-name`) ба өнгийг (Брэнд студийн суурь загвар) тохиргооноос дарна. DB унтарвал статик.
 */
let template: Record<string, unknown> | null = null;
function readTemplate(): Record<string, unknown> {
  if (template) return template;
  for (const dir of [join(process.cwd(), "dist", "public"), join(process.cwd(), "client", "public")]) {
    const file = join(dir, "manifest.webmanifest");
    if (existsSync(file)) { template = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>; return template; }
  }
  template = {};
  return template;
}

export async function buildManifest(): Promise<Record<string, unknown>> {
  return getOrSetCached("pwa:manifest", 60_000, async () => {
    const base = readTemplate();
    const [name, shortName, theme] = await Promise.all([getSiteName(), getSiteTextValue("brand-text-short-name"), getActiveThemeBundle(ubDateKey())]);
    const screenshots = Array.isArray(base.screenshots)
      ? (base.screenshots as Array<Record<string, unknown>>).map(shot => ({ ...shot, label: typeof shot.label === "string" ? shot.label.replace(/^[^—]+—/, `${shortName} —`) : shot.label }))
      : base.screenshots;
    // Дүрс: /brand-icon/* (логоноос, тохиргоо асаагаагүй бол статик руу 302) — brandIcons.ts.
    const rewriteIcon = (src: unknown) => (typeof src === "string" ? src.replace(/^\/icons\/(favicon-64|apple-touch-icon|icon-192|icon-512|maskable-192|maskable-512)\.png$/, "/brand-icon/$1.png") : src);
    const icons = Array.isArray(base.icons) ? (base.icons as Array<Record<string, unknown>>).map(icon => ({ ...icon, src: rewriteIcon(icon.src) })) : base.icons;
    return { ...base, name, short_name: shortName.slice(0, 30), theme_color: theme.look.light["primary-text"], background_color: theme.look.light.background, icons, screenshots };
  });
}

export async function serveManifest(_req: Request, res: Response) {
  res.type("application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  try {
    res.send(JSON.stringify(await buildManifest()));
  } catch {
    res.send(JSON.stringify(readTemplate()));
  }
}
