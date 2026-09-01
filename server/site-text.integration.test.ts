import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;
const slotKey = "home-text-hero-eyebrow" as const;

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      email: "owner@example.com",
      name: "Site Text Integration Admin",
      role: "admin",
      emailVerifiedAt: null,
      sessionVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

maybeDescribe("managed site-text integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const publicCaller = appRouter.createCaller({ ...createAdminContext(), user: null });

  // Same snapshot-and-restore discipline as site-media.integration.test.ts
  // -- home-text-hero-eyebrow is a REAL, admin-editable production slot
  // (HeroSection.tsx's top-line eyebrow), not a throwaway fixture. Capture
  // whatever's really there before the test runs, put it back afterward no
  // matter what the test did (see CLAUDE.md's "integration test-үүд бодит
  // production slot ашиглахгүй байх" note for why this matters).
  let originalValue: string | undefined;

  beforeEach(async () => {
    const before = await adminCaller.admin.siteText();
    originalValue = before.find(row => row.slotKey === slotKey)?.textValue;
  });

  afterEach(async () => {
    if (originalValue !== undefined) {
      await adminCaller.admin.updateSiteText({ slotKey, textValue: originalValue }).catch(() => undefined);
    } else {
      await adminCaller.admin.clearSiteText({ slotKey }).catch(() => undefined);
    }
  });

  it("saves an admin override, exposes it via the public query, and removes it on reset", async () => {
    await adminCaller.admin.updateSiteText({ slotKey, textValue: "Integration text check" });
    const publicText = await publicCaller.content.siteText();
    expect(publicText.find(row => row.slotKey === slotKey)).toMatchObject({ textValue: "Integration text check" });

    await adminCaller.admin.clearSiteText({ slotKey });
    const resetText = await publicCaller.content.siteText();
    expect(resetText.find(row => row.slotKey === slotKey)).toBeUndefined();
  });

  it("rejects an unknown slot key and an empty value", async () => {
    await expect(
      // @ts-expect-error -- deliberately invalid slotKey to verify the zod enum rejects it
      adminCaller.admin.updateSiteText({ slotKey: "not-a-real-slot", textValue: "x" }),
    ).rejects.toThrow();
    await expect(adminCaller.admin.updateSiteText({ slotKey, textValue: "   " })).rejects.toThrow();
  });

  it("rejects a non-staff caller", async () => {
    const guestCaller = appRouter.createCaller({ ...createAdminContext(), user: null });
    await expect(guestCaller.admin.updateSiteText({ slotKey, textValue: "nope" })).rejects.toThrow();
  });
});
