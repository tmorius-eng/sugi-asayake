import { useEffect } from "react";
import { setHomeLayoutPreview } from "@/lib/homeLayout";
import { FONT_KEYS, fontFaceCss, fontStack } from "@shared/fonts";

/**
 * Брэнд студийн амьд preview-ийн storefront тал (2026-10-05). Зөвхөн `?brandPreview=1` бөгөөд
 * өөр origin биш эцэг цонхон дотор (admin-ий iframe) идэвхжинэ — энгийн зочинд юу ч хийхгүй.
 *
 * Хүлээж авдаг: `{ type: "brand-preview", mode, vars, greeting?, posterUrl? }`.
 *   - vars → <html>-ийн inline style (серверийн `<style id="brand-tokens">`-ийг дарна),
 *   - mode → `data-storefront-theme` (localStorage-д БИЧИХГҮЙ — admin-ий сонголт зочны
 *     тохиргоо болохгүй),
 *   - greeting / posterUrl → hero-ийн мэндчилгээ ба эхний зураг (баярын урьдчилан харалт).
 * Утга бүрийг шалгана: зөвхөн `--нэр`, hex / rem / "1 / 1" хэлбэр, постер нь дотоод зам эсвэл https.
 */
const VAR_NAME = /^--[a-z0-9-]{1,40}$/;
const VAR_VALUE = /^(#[0-9a-f]{6}|\d+(\.\d+)?rem|\d \/ \d)$/;
const SAFE_URL = /^(\/(?![/\\])[\w./-]+|https:\/\/[^\s"'<>]+)$/i;

export default function BrandPreviewBridge() {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    if (!new URLSearchParams(window.location.search).has("brandPreview")) return;
    const root = document.documentElement;
    root.setAttribute("data-brand-preview", "");

    const applyGreeting = (greeting: unknown) => {
      if (greeting === undefined) return;
      const copy = document.querySelector(".hero-copy");
      if (!copy) return;
      let line = copy.querySelector<HTMLParagraphElement>(".hero-greeting");
      if (typeof greeting !== "string" || !greeting.trim()) { line?.remove(); return; }
      if (!line) {
        line = document.createElement("p");
        line.className = "hero-greeting";
        copy.prepend(line);
      }
      line.textContent = greeting.slice(0, 200);
    };

    const applyPoster = (posterUrl: unknown) => {
      if (posterUrl === undefined) return;
      document.querySelectorAll<HTMLElement>('[data-slot="home-hero"]').forEach(tile => {
        const img = tile.querySelector("img");
        if (!img) return;
        if (!img.dataset.originalSrc) img.dataset.originalSrc = img.currentSrc || img.src;
        const next = typeof posterUrl === "string" && SAFE_URL.test(posterUrl) ? posterUrl : img.dataset.originalSrc;
        tile.querySelectorAll("source").forEach(source => source.remove());
        img.removeAttribute("srcset");
        if (img.src !== next) img.src = next;
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as { type?: string; mode?: string; vars?: Record<string, unknown>; fontBody?: unknown; fontDisplay?: unknown; greeting?: unknown; posterUrl?: unknown; layout?: unknown } | null;
      if (!data || data.type !== "brand-preview") return;
      const mode = data.mode === "dark" ? "dark" : "light";
      root.setAttribute("data-storefront-theme", mode);
      root.style.colorScheme = mode;
      for (const [name, value] of Object.entries(data.vars ?? {})) {
        if (VAR_NAME.test(name) && typeof value === "string" && VAR_VALUE.test(value)) root.style.setProperty(name, value);
      }
      // Фонт (A2): зөвхөн бүртгэлтэй түлхүүр — stack ба @font-face-ийг shared/fonts.ts-ээс өөрөө бүтээнэ.
      const fontKeys = [data.fontBody, data.fontDisplay].filter((key): key is string => typeof key === "string" && (FONT_KEYS as readonly string[]).includes(key));
      if (fontKeys.length === 2) {
        let faces = document.getElementById("brand-preview-fonts");
        if (!faces) { faces = document.createElement("style"); faces.id = "brand-preview-fonts"; document.head.appendChild(faces); }
        faces.textContent = [...new Set(fontKeys)].map(fontFaceCss).join("");
        root.style.setProperty("--font-body", fontStack(fontKeys[0]));
        root.style.setProperty("--font-display", fontStack(fontKeys[1]));
      }
      applyGreeting(data.greeting);
      applyPoster(data.posterUrl);
      // Нүүрний бүтэц (A3): sanitizeHomeLayout-ээр цэвэрлэгдэнэ — үл мэдэх түлхүүр орохгүй.
      if (data.layout !== undefined) setHomeLayoutPreview(data.layout);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "brand-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return null;
}
