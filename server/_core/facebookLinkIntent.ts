/**
 * "Facebook холбох" зорилгын (intent) токен (2026-10-01, аюулгүй байдлын scan #33).
 *
 * Өмнө нь нэвтэрсэн хэрэглэгч /api/auth/facebook руу орвол callback ямар ч
 * нэмэлт баталгаагүйгээр Facebook id-г тэр дансанд холбодог байв: хулгайлсан сешн
 * cookie-той халдагч (эсвэл login-CSRF) өөрийн Facebook-ийг холбож, дараа нь
 * "Facebook-ээр нэвтрэх"-ээр хэзээ ч орох боломжтой болдог.
 *
 * Одоо холбох нь ЗӨВХӨН нууц үгээр баталгаажуулсан intent-ээр: auth.startFacebookLink
 * ({ password }) нь (lockout-той) нууц үгийг шалгаад энэ богино настай (10 мин),
 * httpOnly cookie-г тавина; callback тэр cookie-г ЗАРЦУУЛЖ (нэг удаа) зөвхөн тухайн
 * хэрэглэгчийн, одоогийн sessionVersion-той таарвал холбоно.
 *
 * Токены `typ` нь өөр (сешн, царай, step-up-аас ялгаатай) тул сешн cookie болгож
 * тавьж болохгүй (server/_core/context.ts typ шалгана).
 */

import { SignJWT, jwtVerify } from "jose";
import { secretKey } from "./context";

export const FACEBOOK_LINK_COOKIE = "sugi_fb_link";
export const FACEBOOK_LINK_TTL_MS = 10 * 60 * 1000;
const FACEBOOK_LINK_TYP = "fb-link";

export async function signFacebookLinkIntent(userId: number, sessionVersion: number): Promise<string> {
  return new SignJWT({ typ: FACEBOOK_LINK_TYP, sub: String(userId), sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + FACEBOOK_LINK_TTL_MS))
    .sign(secretKey());
}

export async function readFacebookLinkIntent(token: string | undefined): Promise<{ userId: number; sessionVersion: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== FACEBOOK_LINK_TYP) return null;
    const userId = Number(payload.sub);
    const sessionVersion = Number(payload.sv);
    if (!Number.isFinite(userId) || !Number.isFinite(sessionVersion)) return null;
    return { userId, sessionVersion };
  } catch {
    return null;
  }
}
