// Баримт бичгийн бүрэн бүтэн байдал (2026-09-14).
//
// site_documents-ийн агуулга гурван эх сурвалжид тарсан байдаг: монгол
// fallback (shared/site-documents.ts), англи/япон орчуулга
// (shared/site-documents.i18n.ts), болон crawler-т өгдөг зам
// (server/_core/sitemap.ts). Шинэ баримт нэмэхэд эдгээрийн аль нэг нь
// орхигдвол хэрэглэгч ХООСОН хуудас харна — хуулийн хуудсанд бол ноцтой.
// Тиймээс "гурвуулаа тааруулсан эсэх"-ийг тестээр барина.
import { describe, expect, it } from "vitest";
import {
  documentSectionsToHtml,
  getSiteDocumentFallbackFor,
  isSiteDocumentKey,
  siteDocumentFallbacks,
  siteDocumentKeys,
} from "../shared/site-documents";
import { STATIC_ROUTES } from "./_core/sitemap";

const LOCALES = ["mn", "en", "ja"] as const;

describe("site documents", () => {
  it("has one fallback per declared key, and no extras", () => {
    expect(siteDocumentFallbacks.map(document => document.key).sort()).toEqual([...siteDocumentKeys].sort());
  });

  it("includes the two pages carried over from the previous site", () => {
    expect(siteDocumentKeys).toContain("about");
    expect(siteDocumentKeys).toContain("careers");
  });

  for (const key of siteDocumentKeys) {
    describe(key, () => {
      for (const locale of LOCALES) {
        it(`renders in ${locale}`, () => {
          const fallback = getSiteDocumentFallbackFor(key, locale);
          expect(fallback.title.trim()).not.toBe("");
          expect(fallback.lead.trim()).not.toBe("");
          expect(fallback.sections.length).toBeGreaterThan(0);
          for (const [heading, body] of fallback.sections) {
            expect(heading.trim()).not.toBe("");
            expect(body.trim()).not.toBe("");
          }
        });
      }

      it("translates every Mongolian section (no half-translated page)", () => {
        const mn = getSiteDocumentFallbackFor(key, "mn");
        for (const locale of ["en", "ja"] as const) {
          expect(getSiteDocumentFallbackFor(key, locale).sections.length).toBe(mn.sections.length);
        }
      });

      it("is crawlable: its path is in the sitemap", () => {
        const fallback = siteDocumentFallbacks.find(document => document.key === key)!;
        expect(STATIC_ROUTES.map(route => route.path)).toContain(fallback.path);
      });
    });
  }

  it("recognises only real document keys", () => {
    expect(isSiteDocumentKey("about")).toBe(true);
    expect(isSiteDocumentKey("careers")).toBe(true);
    expect(isSiteDocumentKey("not-a-document")).toBe(false);
  });

  it("escapes HTML in the fallback so a stray < can never inject markup", () => {
    const html = documentSectionsToHtml([["A <b>heading</b>", "Body & <script>alert(1)</script>"]]);
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
  });
});
