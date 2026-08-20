import { afterEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const runIntegration = process.env.RUN_MEDIA_INTEGRATION_TESTS === "1";
const maybeDescribe = runIntegration ? describe : describe.skip;
const slotKey = "home-hero" as const;
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JQpUAAAAASUVORK5CYII=";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      email: "owner@example.com",
      name: "Site Media Integration Admin",
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

maybeDescribe("managed site-media integration", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const publicCaller = appRouter.createCaller({ ...createAdminContext(), user: null });

  afterEach(async () => {
    await adminCaller.admin.clearSiteMedia({ slotKey }).catch(() => undefined);
  });

  it("uploads a managed image, exposes its persisted public override, and removes it on reset", async () => {
    const upload = await adminCaller.admin.uploadSiteMediaImage({
      fileName: "media-integration.png",
      contentType: "image/png",
      dataBase64: onePixelPng,
    });
    expect(upload.url).toContain("site-media");

    await adminCaller.admin.updateSiteMedia({ slotKey, imageUrl: upload.url, altText: "Integration media check" });
    const publicMedia = await publicCaller.content.siteMedia();
    expect(publicMedia.find(media => media.slotKey === slotKey)).toMatchObject({ imageUrl: upload.url, altText: "Integration media check" });

    await adminCaller.admin.clearSiteMedia({ slotKey });
    const resetMedia = await publicCaller.content.siteMedia();
    expect(resetMedia.find(media => media.slotKey === slotKey)).toBeUndefined();
  });
});
