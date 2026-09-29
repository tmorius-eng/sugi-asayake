import { describe, expect, it } from "vitest";
import { redactedQuery } from "./_core/requestLog";

/**
 * 2026-09-27: the access log used to print `request.originalUrl` verbatim --
 * a QR handoff/face-approve token, an OAuth code/state, or a redirect
 * destination all landed in the terminal (and pm2's log file) in full.
 */
describe("redactedQuery", () => {
  it("leaves a URL with no query string untouched", () => {
    expect(redactedQuery("/face-approve")).toBe("/face-approve");
  });

  it("redacts a face-approve/handoff token", () => {
    const result = redactedQuery("/face-approve?token=abc123secret");
    expect(result).not.toContain("abc123secret");
    expect(result).toContain("token=");
  });

  it("redacts an OAuth code and state", () => {
    const result = redactedQuery("/api/auth/facebook/callback?code=xyz&state=abc");
    expect(result).not.toContain("xyz");
    expect(result).not.toContain("=abc");
    expect(result).toContain("code=");
    expect(result).toContain("state=");
  });

  it("redacts a redirect destination", () => {
    expect(redactedQuery("/api/auth/facebook?redirect=/profile")).not.toContain("/profile");
  });

  it("leaves an ordinary, non-sensitive param visible", () => {
    expect(redactedQuery("/shop?category=Арьс+арчилгаа")).toContain("category=");
    expect(redactedQuery("/shop?category=%D0%90%D1%80%D1%8C%D1%81")).toContain("category=");
  });

  it("is case-insensitive on the key", () => {
    expect(redactedQuery("/x?TOKEN=secret")).not.toContain("secret");
  });
});
