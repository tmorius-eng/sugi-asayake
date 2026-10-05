import { describe, expect, it } from "vitest";
import { ADMIN_TIPS, getAdminTip } from "@shared/admin-tips";

/**
 * 2026-09-12. The help panels are only useful if every section has one and
 * every one of them is written for a staff member rather than a developer.
 * The section list lives in client/src/components/AdminWorkspace.tsx's
 * AdminSection union; this file pins the same list so adding a panel without
 * adding its help fails here instead of shipping a screen with no
 * explanation.
 */
const ADMIN_SECTIONS = [
  "dashboard", "analytics", "products", "orders", "posts", "reviews", "routines",
  "promotions", "calendar", "discountCodes", "brands", "search", "branches", "pos",
  "campaigns", "storeSettings", "measurement", "users", "media", "documents", "loyalty",
  "security", "integrations", "notifications", "receiving", "brandStudio",
] as const;

describe("admin section tips", () => {
  it("covers every admin section", () => {
    const missing = ADMIN_SECTIONS.filter(section => !getAdminTip(section));
    expect(missing).toEqual([]);
  });

  it("has no tip for a section that does not exist", () => {
    const known = new Set<string>(ADMIN_SECTIONS);
    expect(Object.keys(ADMIN_TIPS).filter(key => !known.has(key))).toEqual([]);
  });

  it("answers both questions: what the screen is, and what can be done on it", () => {
    for (const [section, tip] of Object.entries(ADMIN_TIPS)) {
      expect(tip.summary.trim().length, `${section} summary`).toBeGreaterThan(30);
      expect(tip.actions.length, `${section} actions`).toBeGreaterThanOrEqual(2);
      for (const action of tip.actions) expect(action.trim().length, `${section} action`).toBeGreaterThan(5);
    }
  });

  it("is written in Mongolian, since that is who reads it", () => {
    const notMongolian = Object.entries(ADMIN_TIPS)
      .filter(([, tip]) => !/[а-яөүёА-ЯӨҮЁ]/.test(tip.summary))
      .map(([section]) => section);
    expect(notMongolian).toEqual([]);
  });

  it("stays short enough to actually be read", () => {
    // A help panel longer than a paragraph is one people learn to scroll past.
    const tooLong = Object.entries(ADMIN_TIPS)
      .filter(([, tip]) => tip.summary.length > 220 || tip.actions.some(action => action.length > 130))
      .map(([section]) => section);
    expect(tooLong).toEqual([]);
  });

  it("reserves the warning line for the screens where a mistake really costs something", () => {
    // Money the customer pays, stock, irreversible sends, legal pages. If
    // everything warned, the warning would stop meaning anything.
    const withCaution = Object.entries(ADMIN_TIPS).filter(([, tip]) => tip.caution).map(([section]) => section);
    expect(withCaution).toContain("storeSettings");
    expect(withCaution).toContain("loyalty");
    expect(withCaution).toContain("orders");
    expect(withCaution).toContain("campaigns");
    expect(withCaution).toContain("documents");
    expect(withCaution.length).toBeLessThan(ADMIN_SECTIONS.length);
    expect(withCaution).not.toContain("dashboard");
  });
});
