import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Verifies the TIER 0 "login/register-specific rate limit" end to end through
// the router (as opposed to server/_core/security.rate-limit.test.ts, which
// tests the bucket logic in isolation). No database is required: every
// attempt here uses credentials that can't possibly match a real account, so
// the assertions hold whether or not DATABASE_URL is configured.
let nextTestIpOctet = 1;
function uniqueTestIp() {
  nextTestIpOctet += 1;
  return `203.0.113.${nextTestIpOctet}`;
}

function makeCaller(ip: string) {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

// 2026-09-05 ("remove email!!! only phone number!!!" -- Tom, explicit):
// auth.login is phone+password now -- these still use credentials that
// can't possibly match a real account, just a phone number instead of an
// email address.
describe("auth.login rate limiting", () => {
  it("allows a handful of failed attempts, then blocks further attempts from the same IP", async () => {
    const ip = uniqueTestIp();
    const phone = `9${String(Date.now()).slice(-7)}`;

    for (let attempt = 0; attempt < 8; attempt++) {
      await expect(makeCaller(ip).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    await expect(makeCaller(ip).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not penalize a different IP for another client's failed attempts", async () => {
    const busyIp = uniqueTestIp();
    const quietIp = uniqueTestIp();
    const phone = `9${String(Date.now()).slice(-7)}`;

    for (let attempt = 0; attempt < 9; attempt++) {
      await makeCaller(busyIp).auth.login({ phone, password: "wrong-password" }).catch(() => undefined);
    }
    await expect(makeCaller(busyIp).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(makeCaller(quietIp).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
