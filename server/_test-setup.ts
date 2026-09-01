/**
 * Vitest setup — runs in every worker before any test file.
 *
 * Loads .env the same way the app and scripts/ do. Without this, vitest
 * never saw DATABASE_URL / S3_* at all: the integration gates
 * (RUN_AUTH_INTEGRATION_TESTS, COMMERCE_INTEGRATION_TESTS,
 * RUN_MEDIA_INTEGRATION_TESTS) would switch the tests ON, and they would
 * then fail with "Database unavailable" / "Storage config missing" unless
 * the shell happened to export those values by hand. That made a full local
 * run look broken (22 failed files) for a reason that had nothing to do
 * with the code under test.
 *
 * On CI there is no .env file and dotenv is a silent no-op, so the gates
 * stay off and the affected tests skip exactly as before.
 */
import "dotenv/config";
