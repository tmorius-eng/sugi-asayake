import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// 2026-09-20: login now has its own 20/15min/IP tier (server/_core/trpc.ts
// loginRateLimitedProcedure) instead of the strict 8 -- a shared IP (office
// NAT, carrier CGNAT) must not lock out the ninth real customer; the
// per-ACCOUNT lockout (server/auth.lockout.integration.test.ts) is what
// bounds password guessing. These tests use phones that match no account,
// so only the IP tier is exercised here.
// Verifies the TIER 0 "login/register-specific rate limit" end to end through
// the router (as opposed to server/_core/security.rate-limit.test.ts, which
// tests the bucket logic in isolation). No database is required: every
// attempt here uses credentials that can't possibly match a real account, so
// the assertions hold whether or not DATABASE_URL is configured.
// Audit 2026-09-09: the strict tiers now count in the shared database, so a
// fixed subnet would carry a blocked bucket from one test run into the next
// (within the 15-minute window). A per-run random subnet keeps runs independent.
const RUN_SUBNET = Math.floor(Math.random() * 200) + 10;
let nextTestIpOctet = 1;
function uniqueTestIp() {
  nextTestIpOctet += 1;
  return `10.${RUN_SUBNET}.113.${nextTestIpOctet}`;
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

    for (let attempt = 0; attempt < 20; attempt++) {
      await expect(makeCaller(ip).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    await expect(makeCaller(ip).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not penalize a different IP for another client's failed attempts", async () => {
    const busyIp = uniqueTestIp();
    const quietIp = uniqueTestIp();
    const phone = `9${String(Date.now()).slice(-7)}`;

    for (let attempt = 0; attempt < 21; attempt++) {
      await makeCaller(busyIp).auth.login({ phone, password: "wrong-password" }).catch(() => undefined);
    }
    await expect(makeCaller(busyIp).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(makeCaller(quietIp).auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
