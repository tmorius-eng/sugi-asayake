/**
 * Vitest setup — runs in every worker before any test file is imported.
 *
 * 1. Loads .env the same way the app and scripts/ do. Without this, vitest
 *    never saw DATABASE_URL / S3_* at all: the integration gates
 *    (RUN_AUTH_INTEGRATION_TESTS, COMMERCE_INTEGRATION_TESTS,
 *    RUN_MEDIA_INTEGRATION_TESTS) would switch the tests ON, and they would
 *    then fail with "Database unavailable" / "Storage config missing" unless
 *    the shell happened to export those values by hand. That made a full
 *    local run look broken (22 failed files) for a reason that had nothing
 *    to do with the code under test.
 *
 *    On CI there is no .env file and dotenv is a silent no-op, so the gates
 *    stay off and the affected tests skip exactly as before.
 *
 * 2. Supplies a throwaway INTEGRATIONS_ENCRYPTION_KEY when the environment
 *    has none. server/integrations.integration.test.ts's "integration config
 *    encryption (unit)" tests run UNGATED (they touch no database), and
 *    server/_core/crypto.ts's getKey() throws unless the key is a 64-char
 *    hex string — so on a fresh checkout, and on GitHub Actions, those two
 *    tests failed for want of configuration rather than for any defect.
 *
 *    Those tests assert that encryptJson/decryptJson round-trip and that a
 *    tampered blob is rejected. Both properties hold for ANY valid key, so
 *    the value below is arbitrary and protects nothing: it encrypts only
 *    data the test itself just made up, inside the test process.
 *
 *    This deliberately does NOT relax the application: server/_core/env.ts
 *    and crypto.ts are untouched, so a real server still refuses to encrypt
 *    anything unless a real key is configured. The weak-default risk that
 *    docs/PROJECT-GUIDE.md warns about would come from putting a fallback THERE, not
 *    here. Setting it here also means CI needs no repository secret, and a
 *    fresh clone can run `pnpm test` green with no setup.
 *
 *    A real key in .env or the environment still wins — this only fills a
 *    gap, it never overrides.
 */
import "dotenv/config";

// Guest checkout phone verification (2026-09-14) is a real SMS round trip
// with verify.mn; no test can answer one. Off here, and the one suite that
// exercises the guard (checkout-otp.integration.test.ts) switches it on for
// its own calls only.
process.env.GUEST_CHECKOUT_OTP = "0";

if (!process.env.INTEGRATIONS_ENCRYPTION_KEY) {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "0".repeat(64);
}

// 3. Phone push notifications (2026-09-11). The integration suites place
//    real orders on the shared Aiven database; without this, the "new order"
//    pushes they cause would be queued as real and delivered to the shop
//    staff's phones by whichever machine is running the dispatcher. With it,
//    they are written as `suppressed`: still assertable, never sent. This one
//    DOES override the environment, on purpose -- no test run should ever
//    page a real person.
process.env.NOTIFICATIONS_SUPPRESS = "1";

// 4. Admin face gate (2026-09-12). Every admin-panel procedure now refuses a
//    call without a live face-proof cookie, and the integration suites build
//    callers with no cookies at all. Off by default here; the face suites
//    switch it on for themselves (ENV.adminFaceGateEnabled is a getter).
process.env.ADMIN_FACE_GATE_ENABLED = "0";
