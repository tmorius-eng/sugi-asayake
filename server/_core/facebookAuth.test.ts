import { describe, expect, it, vi } from "vitest";

// facebookAuth.ts imports the whole router graph (mergeGuestCartAndClearCookie);
// safeRedirect and the link-intent token are pure, so the DB-facing modules are stubbed.
vi.mock("../db", () => ({
  createUserFromFacebook: vi.fn(),
  findUserByFacebookId: vi.fn(),
  linkFacebookIdToUser: vi.fn(),
  recordLoginAttempt: vi.fn(),
  touchUserLastSignedIn: vi.fn(),
  getSessionUserById: vi.fn(),
  isSessionRevoked: vi.fn(async () => false),
}));
vi.mock("../routers", () => ({ mergeGuestCartAndClearCookie: vi.fn() }));

const { safeRedirect } = await import("./facebookAuth");
const { readFacebookLinkIntent, signFacebookLinkIntent } = await import("./facebookLinkIntent");
const { signSessionToken } = await import("./context");

describe("safeRedirect (2026-10-01 security scan #19)", () => {
  it("keeps ordinary same-site paths, including query and hash", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/shop")).toBe("/shop");
    expect(safeRedirect("/profile?tab=security")).toBe("/profile?tab=security");
    expect(safeRedirect("/product/abc#reviews")).toBe("/product/abc#reviews");
  });

  it("refuses protocol-relative, backslash and absolute destinations", () => {
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("/\\evil.example")).toBe("/"); // browsers read "\" as "/" -> "//evil.example"
    expect(safeRedirect("\\\\evil.example")).toBe("/");
    expect(safeRedirect("https://evil.example")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
    expect(safeRedirect("evil")).toBe("/");
  });

  it("refuses control characters (tab/newline are stripped by URL parsers: '/\\t/evil.example' becomes '//evil.example')", () => {
    expect(safeRedirect("/\t/evil.example")).toBe("/");
    expect(safeRedirect("/\n/evil.example")).toBe("/");
    expect(safeRedirect("/\r/evil.example")).toBe("/");
    expect(safeRedirect("/ok\u0000")).toBe("/");
    expect(safeRedirect("/ok\u007f")).toBe("/");
  });

  it("refuses non-strings, empty and over-long values", () => {
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect(["/a"])).toBe("/");
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect(`/${"a".repeat(600)}`)).toBe("/");
  });
});

describe("Facebook link intent token", () => {
  it("round-trips the user and session version", async () => {
    const token = await signFacebookLinkIntent(42, 3);
    expect(await readFacebookLinkIntent(token)).toEqual({ userId: 42, sessionVersion: 3 });
  });

  it("is not a session: a session token is not an intent and an intent is not a session", async () => {
    expect(await readFacebookLinkIntent(await signSessionToken(42, 3))).toBeNull();
    expect(await readFacebookLinkIntent(undefined)).toBeNull();
    expect(await readFacebookLinkIntent("not.a.jwt")).toBeNull();
  });
});
