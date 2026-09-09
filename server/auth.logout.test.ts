import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { ADMIN_FACE_COOKIE_NAME, COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    email: "sample@example.com",
    name: "Sample User",
    role: "user",
    emailVerifiedAt: null,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    const session = clearedCookies.find(c => c.name === COOKIE_NAME);
    expect(session).toBeDefined();
    expect(session?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("also clears the admin face-verification cookie", async () => {
    // Admin face gate (2026-09-08): a real security bug, found by Tom logging
    // out and straight back in and walking into /admin with no face check.
    // The face-proof cookie lives for 8 hours, so unless logout kills it too,
    // signing out and back in silently reuses the previous verification --
    // defeating the "check on every login" requirement the gate exists for.
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.auth.logout();

    const face = clearedCookies.find(c => c.name === ADMIN_FACE_COOKIE_NAME);
    expect(face).toBeDefined();
    expect(face?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
