import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@shared/push-endpoint";
import { mapLimit } from "./_core/mapLimit";

describe("isAllowedPushEndpoint", () => {
  it("accepts the real browser push services", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://autopush.push.services.mozilla.com/x",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://fcm.googleapis.com./fcm/send/abc",
    ]) expect(isAllowedPushEndpoint(ok), ok).toBe(true);
  });
  it("rejects everything else", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com.example/x",
      "https://push.apple.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://notify.windows.com/x",
      "not a url",
    ]) expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });
});

describe("mapLimit", () => {
  it("never exceeds the concurrency limit and keeps order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async n => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it("handles an empty list", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
