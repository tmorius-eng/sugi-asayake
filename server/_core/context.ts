import type { Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";
import { getSessionUserById } from "../db";
import type { User } from "../../drizzle/schema";

// Audit finding BUG-001: called once at process startup (see
// server/_core/index.ts), before the server ever binds to a port. Every
// other security-sensitive secret in this codebase already fails loudly when
// missing in a real deployment (crypto.ts's getKey() for
// INTEGRATIONS_ENCRYPTION_KEY, verifyMn.ts's requireApiKey()) -- JWT_SECRET
// was the one exception, and it's the most sensitive one of all (it's what a
// session cookie's authenticity rests on). Scoped to production specifically
// so local dev / CI / vitest (none of which set NODE_ENV=production) keep
// working with no secret configured, same as today.
export function assertProductionSecrets() {
  if (ENV.isProduction && !ENV.cookieSecret) {
    throw new Error("JWT_SECRET must be set in production -- refusing to start with an insecure fallback signing key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
}

export type SessionUser = Omit<User, "passwordHash">;

export type TrpcContext = {
  user: SessionUser | null;
  req: Request;
  res: Response;
};

// Audit finding BUG-001 (2026-09-06): this used to fall back to a hardcoded
// "insecure-development-secret-change-me" string whenever JWT_SECRET was
// unset -- fine for local tooling that never signs a real cookie, but a
// silent, committed-to-a-public-repo fallback for the ONE secret that lets
// anyone forge a session for any user id (including the bootstrap admin,
// user id 1) if it were ever left unset in a real deployment. No code
// anywhere asserted JWT_SECRET was actually set before the server started.
// assertProductionSecrets() below is the fix: fail loudly at startup in
// production instead of silently signing tokens nobody can trust. This
// function keeps a much narrower, in-memory-only fallback (a fresh random
// key generated once per process) purely so non-production tooling that
// never calls assertProductionSecrets (drizzle-kit, unit tests that never
// touch a cookie) doesn't crash -- a random key still means "no real secret
// configured" fails safely (nothing signed with it survives a restart, and
// nobody outside this process can predict it), instead of the previous
// fallback being a known, publicly-committed string.
let devFallbackSecret: Uint8Array | null = null;
function secretKey() {
  if (ENV.cookieSecret) return new TextEncoder().encode(ENV.cookieSecret);
  if (!devFallbackSecret) devFallbackSecret = randomBytes(32);
  return devFallbackSecret;
}

export async function signSessionToken(userId: number, sessionVersion: number): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({ sub: String(userId), sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secretKey());
}

async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return resolveUserFromToken(token);
}

async function resolveUserFromToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) return null;
    // The row comes from a per-user cache (server/db.ts getSessionUserById)
    // that every security-relevant writer invalidates, so a suspension, a
    // role change or a sessionVersion bump is seen on the very next request
    // while an ordinary request no longer pays a database round trip.
    const user = await getSessionUserById(userId);
    if (!user) return null;
    // A token signed before the user's last "sign out everywhere" or
    // password reset carries the old sessionVersion — reject it just like an
    // expired token, rather than trusting a session that should be dead.
    if (Number(payload.sv) !== user.sessionVersion) return null;
    // An admin-suspended account loses access immediately, even for a
    // session token that was issued (and is otherwise still valid) before
    // the suspension — no re-login or sessionVersion bump required.
    if (user.suspendedAt) return null;
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  } catch {
    // Expired, tampered, or malformed token — treat the request as anonymous
    // rather than throwing, so public routes keep working.
    return null;
  }
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<TrpcContext> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const user = await userFromToken(cookies[COOKIE_NAME]);
  return { user, req, res };
}
