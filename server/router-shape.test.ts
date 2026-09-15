import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

/**
 * Router-ыг зүгээр АЧААЛЖ чаддаг эсэх (2026-09-15).
 *
 * Яагаад: `careers.apply` гэж procedure нэрлэсэн нь tRPC v11-д хориотой
 * (`Function.prototype.apply`) бөгөөд алдаа нь **зөвхөн ажиллах үед** гардаг —
 * `pnpm check`, `pnpm lint`, `pnpm build` гурвуулаа цэвэр өнгөрсөн боловч
 * production дээр сервер асахаа больж, сайт 2 минут унасан.
 *
 * Энэ файлын импорт өөрөө л `createRouterInner`-ийг ажиллуулдаг тул ижил
 * төрлийн алдаа (хориотой нэр, давхардсан procedure, буруу бүтэц) цаашид
 * deploy хүрэлгүй, тестийн үед л баригдана. DB, орчны хувьсагч шаардахгүй тул
 * CI-д ямар ч gate-гүйгээр ажиллана.
 */
const RESERVED = ["apply", "call", "bind", "constructor", "toString", "prototype", "name", "length", "caller", "arguments"];

/** Router модны бүх түвшний түлхүүрийг цуглуулна. */
function collectKeys(record: Record<string, unknown>, path: string[] = []): { path: string; key: string }[] {
  const found: { path: string; key: string }[] = [];
  for (const [key, value] of Object.entries(record)) {
    found.push({ path: path.join("."), key });
    const nested = (value as { _def?: { record?: Record<string, unknown> } })?._def?.record;
    if (nested && typeof nested === "object") found.push(...collectKeys(nested, [...path, key]));
  }
  return found;
}

describe("appRouter", () => {
  it("loads without throwing (catches tRPC reserved-word names at test time, not on the server)", () => {
    expect(appRouter).toBeDefined();
    expect(Object.keys(appRouter._def.record).length).toBeGreaterThan(5);
  });

  it("uses no reserved procedure or router name anywhere in the tree", () => {
    const offenders = collectKeys(appRouter._def.record).filter(entry => RESERVED.includes(entry.key));
    expect(offenders.map(entry => `${entry.path}.${entry.key}`)).toEqual([]);
  });
});
