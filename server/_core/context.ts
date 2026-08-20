import type { Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";
import { getUserById } from "../db";
import type { User } from "../../drizzle/schema";

export type SessionUser = Omit<User, "passwordHash">;

export type TrpcContext = {
  user: SessionUser | null;
  req: Request;
  res: Response;
};

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret || "insecure-development-secret-change-me");
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
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) return null;
    const user = await getUserById(userId);
    if (!user) return null;
    // A token signed before the user's last "sign out everywhere" or
    // password reset carries the old sessionVersion — reject it just like an
    // expired token, rather than trusting a session that should be dead.
    if (Number(payload.sv) !== user.sessionVersion) return null;
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
