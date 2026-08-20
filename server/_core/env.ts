// Self-hosted environment configuration.
// This file replaces the Manus-managed "_core/env.ts" that shipped only as a
// compiled bundle. Every value below is something SUGI ASAYAKE owns and
// configures itself — nothing here points at Manus infrastructure.

function required(name: string, value: string | undefined): string {
  if (!value) {
    // We intentionally do not throw at import time: local tooling (drizzle-kit,
    // vitest unit tests that never touch the DB, etc.) should still be able to
    // load this module. Callers that truly need the value should check for an
    // empty string themselves (see getDb / getConfig-style guards elsewhere).
    return "";
  }
  return value;
}

export const ENV = {
  // Session / auth
  cookieSecret: required("JWT_SECRET", process.env.JWT_SECRET),
  // If set, this email is granted the "admin" role automatically the moment it
  // registers (in addition to: the very first account created is always made
  // admin, so a fresh deployment always has at least one admin without any
  // manual DB edit).
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Object storage (own AWS S3 bucket, or any S3-compatible provider such as
  // Cloudflare R2 / Backblaze B2 — just point S3_ENDPOINT at it).
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT || undefined, // leave undefined for real AWS S3
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  // Public base URL to read uploaded files back from (your bucket's public
  // endpoint, or a CDN/CloudFront/R2 custom domain in front of it).
  s3PublicBaseUrl: (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),

  // Optional transactional email (Resend). If unset, staff-invitation and
  // order notifications fall back to server-log output, exactly like the
  // previous "owner notification fallback" behaviour.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "SUGI ASAYAKE <onboarding@resend.dev>",

  isProduction: process.env.NODE_ENV === "production",
};
