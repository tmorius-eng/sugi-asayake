import { describe, expect, it, vi } from "vitest";

// 2026-09-05: this machine's real .env now carries a real VERIFY_MN_API_KEY
// (Tom went and got one, see CLAUDE.md) -- so "no key is set in this test
// environment" is no longer actually true here, and this test would
// otherwise fire a REAL request at verify.mn's live API every time the
// suite runs (it did, once, before this fix: a real session for
// "90144773"). This mock forces requireApiKey() to see an empty key
// regardless of what's really in .env, same pattern
// verifyMn.mocked-fetch.test.ts already uses to go the other way (fake a
// *present* key) -- restored automatically since vi.mock is file-scoped.
vi.mock("./_core/env", () => ({ ENV: { verifyMnApiKey: "" } }));

import { createVerificationSession, getSessionStatus, normalizePhoneForVerifyMn } from "./verifyMn";

describe("verify.mn provider configuration", () => {
  it("fails loudly (not this codebase's usual silent no-op) when VERIFY_MN_API_KEY is missing", async () => {
    await expect(createVerificationSession({ phone: "90144773", purpose: "register", userId: 1 })).rejects.toThrow("VERIFY_MN_API_KEY");
    await expect(getSessionStatus("some-session-id")).rejects.toThrow("VERIFY_MN_API_KEY");
  });
});

describe("normalizePhoneForVerifyMn", () => {
  it("accepts a bare 8-digit local mobile number unchanged", () => {
    expect(normalizePhoneForVerifyMn("90144773")).toBe("90144773");
  });

  it("strips a 976 country code down to the local 8 digits", () => {
    expect(normalizePhoneForVerifyMn("+976 9014 4773")).toBe("90144773");
    expect(normalizePhoneForVerifyMn("976-9014-4773")).toBe("90144773");
  });

  it("rejects anything that isn't exactly 8 local digits", () => {
    expect(normalizePhoneForVerifyMn("123")).toBeNull();
    expect(normalizePhoneForVerifyMn("9014477312")).toBeNull();
    expect(normalizePhoneForVerifyMn("")).toBeNull();
  });
});
