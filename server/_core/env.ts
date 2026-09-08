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

  // Optional transactional email + SMS (Brevo, formerly Sendinblue — one API
  // key covers both). If unset, staff-invitation/account emails and any SMS
  // fall back to server-log output, exactly like the previous "owner
  // notification fallback" behaviour.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? "",
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? "SUGI ASAYAKE",
  // Shown as the SMS "from" — an alphanumeric sender name (max 11 chars) on
  // most routes. Brevo may silently substitute a shared numeric sender for
  // countries that don't support alpha senders, so don't assume this string
  // reaches the recipient's phone unchanged.
  brevoSmsSender: process.env.BREVO_SMS_SENDER ?? "SUGI",

  // Admin overhaul (2026-09-08, Phase J): sendAccountSms already technically
  // works the moment brevoApiKey above is set (same Brevo account covers
  // both channels) -- but Tom has explicitly not yet confirmed SMS credits
  // are purchased or that Mongolia's route/pricing is set up (see CLAUDE.md).
  // A blanket "if the email key exists, allow SMS campaigns too" default
  // would be wrong specifically because of that non-confirmation, so mass
  // SMS campaigns need this separate, deliberately-off-by-default flag --
  // the campaign composer disables the SMS channel with an explanatory note
  // until this is set to "1", independent of whether brevoApiKey is
  // configured. Transactional SMS (order updates, phone verification via
  // verify.mn) is unaffected either way.
  smsCampaignsEnabled: process.env.SMS_CAMPAIGNS_ENABLED === "1",

  isProduction: process.env.NODE_ENV === "production",

  // Encrypts admin-entered third-party provider credentials at rest (see
  // integration_configs table / server/_core/crypto.ts) — a 64-character hex
  // string (32 bytes) for AES-256-GCM. Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  integrationsEncryptionKey: process.env.INTEGRATIONS_ENCRYPTION_KEY ?? "",

  // Error tracking (2026-09): Honeybadger's free tier (5,000 errors/mo) --
  // chosen specifically because it needs no hosting decision to start
  // (ROADMAP.md's Sentry/staging/CDN items are otherwise blocked on one).
  // Empty by default, on purpose: see server/_core/honeybadger.ts, which
  // simply never calls Honeybadger.configure() without a real key rather
  // than silently reporting to nowhere or throwing.
  honeybadgerApiKey: process.env.HONEYBADGER_API_KEY ?? "",

  // 2026-09-07 (Project "SUGI Desk", System Logs) -- a DIFFERENT credential
  // from honeybadgerApiKey above, not a typo/duplicate: Honeybadger's own
  // docs split "project API key" (send-only, used by the SDK above) from a
  // "Personal Auth Token" (read-only Data API, from the account's own
  // Settings > Authentication page, not any one project's settings) --
  // https://docs.honeybadger.io/api/getting-started/. Only this one is
  // needed to list faults back into the admin System Logs tab; the project
  // key is neither sufficient nor required for that read. Empty by default,
  // same silent-no-op convention as honeybadgerApiKey (see
  // server/_core/honeybadgerReadApi.ts).
  honeybadgerPersonalAuthToken: process.env.HONEYBADGER_PERSONAL_AUTH_TOKEN ?? "",

  // verify.mn (2026-09-05): Mongolian Mobile-Originated SMS phone
  // verification -- backs an optional "verify your phone" step at register
  // and a phone-based alternative to the emailed reset code at
  // forgot-password (added specifically because Brevo email delivery has
  // been unreliable). UNLIKE every other integration above, this is read
  // as an empty string here too, but server/verifyMn.ts's own functions
  // throw loudly the moment they're actually called with it missing,
  // instead of silently falling back to a console.log -- a deliberate,
  // explicit exception to this file's usual convention, not an oversight.
  verifyMnApiKey: process.env.VERIFY_MN_API_KEY ?? "",

  // Admin face gate (2026-09-08): requires every /admin user (all 5 panel
  // roles -- staff/finance/marketing/warehouse/admin) to pass a browser
  // camera face check on top of their phone+password login. Customer-facing
  // pages are completely unaffected. Off unless explicitly set to "1", same
  // opt-in shape as smsCampaignsEnabled above.
  //
  // THIS FLAG IS THE ESCAPE HATCH, and that is its most important job. The
  // gate stands in front of the admin panel -- including the account that
  // would have to fix it if it misbehaved -- so there must be a way out that
  // does not itself require getting into /admin. Setting this to anything but
  // "1" (or removing it) and restarting returns /admin to exactly its
  // pre-gate behaviour, with no code change and no database edit. Enrolled
  // faces are left intact, so switching it back on later resumes where it
  // left off.
  //
  // To unblock ONE person rather than everyone (new glasses, a beard, a
  // camera that died), prefer the per-user reset in the admin Users drawer,
  // which clears just that account's enrollment so they re-enroll next visit.
  adminFaceGateEnabled: process.env.ADMIN_FACE_GATE_ENABLED === "1",
};
