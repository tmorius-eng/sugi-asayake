import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { setSecurityHeaders } from "./security";

/**
 * Admin face gate (2026-09-08) — regression cover for a real bug caught in
 * browser QA, not in review.
 *
 * `Permissions-Policy: camera=()` is an EMPTY allowlist: it forbids the
 * camera to every origin including this site's own pages. With it set, the
 * /admin face check died at `getUserMedia` with "Permissions policy
 * violation: camera is not allowed in this document" — and critically, the
 * browser never prompted, so it looked exactly like the user had denied
 * permission. It cost a round of debugging on the wrong machine before the
 * console error identified it.
 *
 * `camera=(self)` is the fix: this site's pages may use the camera, every
 * other origin (including anything embedded in an iframe) still may not.
 *
 * These tests exist so that tightening this header back to `camera=()` —
 * which looks like an obvious security improvement in isolation — fails
 * loudly instead of silently breaking admin login.
 */

function runMiddleware(): Map<string, string> {
  const headers = new Map<string, string>();
  const request = { path: "/admin", method: "GET" } as unknown as Request;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  } as unknown as Response;
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  setSecurityHeaders(request, response, next);
  if (!nextCalled) throw new Error("setSecurityHeaders did not call next()");
  return headers;
}

describe("Permissions-Policy", () => {
  it("allows this site's own pages to use the camera", () => {
    // Without this the admin face gate cannot open the camera at all.
    const policy = runMiddleware().get("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=(self)");
    expect(policy).not.toContain("camera=()");
  });

  it("still denies the camera to every other origin", () => {
    // "(self)" is the whole point: permissive enough for /admin, and no more.
    const policy = runMiddleware().get("Permissions-Policy") ?? "";
    expect(policy).not.toContain("camera=*");
  });

  it("keeps microphone, geolocation and payment fully denied", () => {
    // The face gate captures no audio and needs no location. Nothing in this
    // app uses any of these, so their allowlists stay empty.
    const policy = runMiddleware().get("Permissions-Policy") ?? "";
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
  });

  it("still sets the other baseline security headers", () => {
    // Guards against a careless edit to the Permissions-Policy line taking
    // its neighbours with it.
    const headers = runMiddleware();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
