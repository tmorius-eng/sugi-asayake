import type { Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { randomBytes } from "node:crypto";
import { parseCookie as parseCookieHeader } from "cookie";
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
  if (!ENV.isProduction) return;
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET must be set in production -- refusing to start with an insecure fallback signing key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  // Аудит 2026-09-20 (P2-1): DATABASE_URL байхгүй бол getDb() null буцааж
  // procedure БҮР "Database is not available" гэж унадаг байв — порт нээхээс
  // өмнө шатах нь илүү ойлгомжтой. Бусад нь дутуу байвал сайт ажиллах ч тодорхой
  // хэсэг нь чимээгүй унадаг тул startup-д НЭГ тод warning (шатахгүй — staging /
  // demo орчныг хаахгүйн тулд).
  if (!ENV.databaseUrl) {
    throw new Error("DATABASE_URL must be set in production -- every request needs the database.");
  }
  const warnings: string[] = [];
  // 2026-09-27: session, царайны proof, нууц үгийн step-up гурвуулаа ЭНЭ түлхүүрээр
  // HS256 гарын үсэг зурдаг. Богино эсвэл баримтад бичигдсэн жишээ утга
  // ("local-test-secret-12345") бол cookie-г offline таах/хуурамчаар үүсгэж admin
  // болох боломжтой. Сайтыг зогсоохгүй (prod ийм утгатай бол deploy сайтыг унагана),
  // харин хамгийн эхний, тод анхааруулга.
  if (isWeakJwtSecret(ENV.cookieSecret)) warnings.unshift("a STRONG JWT_SECRET (current value is short or a documented placeholder -- anyone who knows it can forge an admin session). Rotate it: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" (everyone is signed out once)");
  if (!ENV.integrationsEncryptionKey || ENV.integrationsEncryptionKey.length !== 64) warnings.push("INTEGRATIONS_ENCRYPTION_KEY (64 hex) -- admin cannot save/read integration credentials (ntfy, StorePay, Smart Software), and no admin can enrol a face (templates are stored encrypted)");
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey || !ENV.s3PublicBaseUrl) warnings.push("S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_PUBLIC_BASE_URL -- image uploads and /cdn/* will fail");
  // 2026-09-23: анхааруулгын текст БУРУУ байсан. sitemap/robots/merchant feed
  // нь үнэхээр хүсэлтийн Host руу унадаг ч `server/_core/publicUrl.ts` нь
  // ХАТУУ БИЧСЭН домэйн руу (FALLBACK_ORIGIN) унадаг — өөрөөр хэлбэл
  // canonical, og:url, BreadcrumbList, /og/product/* бүгд сайтынхаа биш
  // домэйн рүү заана. Шинэ эзэн/staging дээр энэ нь SEO-гийн бодит алдаа.
  if (!ENV.publicBaseUrl) warnings.push("PUBLIC_BASE_URL -- canonical, og:url, BreadcrumbList болон OG зураг ХАТУУ БИЧСЭН домэйн руу заана (server/_core/publicUrl.ts); sitemap/robots/feed нь хүсэлтийн Host руу унана");
  if (!ENV.ownerEmail) warnings.push("OWNER_EMAIL -- owner alert emails (notifyOwner) and the default VAPID subject have no address (it no longer promotes anyone to admin; only the very first account does)");
  for (const warning of warnings) console.warn(`[env] production is missing ${warning}`);
}

/** 32 байтаас богино эсвэл нийтэд ил жишээ утга (2026-09-27). */
export function isWeakJwtSecret(secret: string | undefined | null): boolean {
  if (!secret) return true;
  if (/local-test-secret|change-?me|insecure|example|placeholder/i.test(secret)) return true;
  return secret.length < 32;
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

const SESSION_TYP = "session";

export async function signSessionToken(userId: number, sessionVersion: number): Promise<string> {
  const { SignJWT } = await import("jose");
  // `typ` (2026-09-22): the face proof and the password step-up are signed
  // with this same key (server/_core/faceProof.ts); each reader refuses the
  // other kinds.
  return new SignJWT({ typ: SESSION_TYP, sub: String(userId), sv: sessionVersion })
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
    // Token confusion (2026-09-22 audit): a face-proof or password-step token
    // is signed with this same key and also carries {sub, sv}, so before this
    // check pasting one into the session cookie produced a full session. A
    // session token minted before `typ` existed has none and stays valid (no
    // customer is signed out by the fix); another `typ`, or the proof-only
    // claims, are refused.
    if (payload.typ !== undefined && payload.typ !== SESSION_TYP) return null;
    if (payload.abs !== undefined || payload.tabs !== undefined) return null;
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
