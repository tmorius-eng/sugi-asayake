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
 *    CLAUDE.md warns about would come from putting a fallback THERE, not
 *    here. Setting it here also means CI needs no repository secret, and a
 *    fresh clone can run `pnpm test` green with no setup.
 *
 *    A real key in .env or the environment still wins — this only fills a
 *    gap, it never overrides.
 */
import "dotenv/config";

if (!process.env.INTEGRATIONS_ENCRYPTION_KEY) {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "0".repeat(64);
}
