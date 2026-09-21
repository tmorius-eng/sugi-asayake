// server/db/integrations.ts — Интеграцийн тохиргоо (шифрлэгдсэн).
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { eq } from "drizzle-orm";
import { integrationConfigs } from "../../drizzle/schema";
import { decryptJson, encryptJson } from "../_core/crypto";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { INTEGRATION_META, INTEGRATION_PROVIDERS, mergeIntegrationSettings, validateIntegrationSettings, type IntegrationProvider } from "../../shared/integrations";
import { getDb } from "./connection";

/**
 * Admin-manageable third-party provider config (see integrationConfigs in
 * drizzle/schema.ts, and shared/integrations.ts for the provider list and
 * each provider's fields). QPay is deliberately not part of this: it already
 * works end-to-end from process.env (server/qpay.ts) and isn't retrofitted
 * here.
 */
export type { IntegrationProvider };

type DecodedIntegration = { settings: Record<string, string>; decryptFailed: boolean };

function decodeIntegrationRow(encryptedConfig: string | null | undefined): DecodedIntegration {
  if (!encryptedConfig) return { settings: {}, decryptFailed: false };
  try { return { settings: decryptJson(encryptedConfig), decryptFailed: false }; } catch { return { settings: {}, decryptFailed: true }; }
}

/** Never returns a secret to the caller -- only which keys are set, plus the
 *  values of plain `url`/`text` fields (a server address is not a secret,
 *  and the form is useless if it cannot show the current one). Secrets and
 *  ntfy topics are write-only, the same principle as a password field. */
export async function getAdminIntegrations() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(integrationConfigs);
  const byProvider = new Map(rows.map(row => [row.provider, row]));
  return INTEGRATION_PROVIDERS.map(provider => {
    const row = byProvider.get(provider);
    const { settings, decryptFailed } = decodeIntegrationRow(row?.encryptedConfig);
    const meta = INTEGRATION_META[provider];
    const knownKeys = new Set(meta.fields.map(field => field.key));
    const fields = [
      ...meta.fields.map(field => ({
        key: field.key,
        isSet: Boolean(settings[field.key]),
        value: field.kind === "url" || field.kind === "text" ? (settings[field.key] ?? null) : null,
      })),
      // Free-form providers: keys typed in by hand, never their values.
      ...Object.keys(settings).filter(key => !knownKeys.has(key)).map(key => ({ key, isSet: true, value: null })),
    ];
    return {
      provider,
      isActive: row?.isActive ?? false,
      hasCredentials: Boolean(row?.encryptedConfig),
      configuredKeys: decryptFailed ? ["(тайлж чадсангүй)"] : Object.keys(settings),
      decryptFailed,
      fields,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

const integrationCacheKey = (provider: IntegrationProvider) => `integration-settings:${provider}`;

/** Decrypted settings for runtime use, whether or not the provider is
 *  switched on (the "send a test" button must work before activation).
 *  Cached 30s per process; saving through updateAdminIntegration clears it. */
export async function getIntegrationSettings(provider: IntegrationProvider): Promise<{ isActive: boolean; settings: Record<string, string> } | null> {
  return getOrSetCached(integrationCacheKey(provider), 30_000, async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, provider)).limit(1);
    if (!rows[0]) return null;
    const { settings, decryptFailed } = decodeIntegrationRow(rows[0].encryptedConfig);
    if (decryptFailed) {
      console.error(`[integrations] ${provider}: stored settings could not be decrypted (INTEGRATIONS_ENCRYPTION_KEY changed?)`);
      return null;
    }
    return { isActive: rows[0].isActive, settings };
  });
}

/** The first runtime reader of this table (2026-09-11): the decrypted
 *  settings of a provider that is switched ON, else null. */
export async function getActiveIntegrationConfig(provider: IntegrationProvider): Promise<Record<string, string> | null> {
  const current = await getIntegrationSettings(provider);
  return current?.isActive ? current.settings : null;
}

export type IntegrationUpdateInput = {
  provider: IntegrationProvider;
  isActive?: boolean;
  /** Adds/overwrites these keys; an empty value clears that key. */
  set?: Record<string, string>;
  clearKeys?: string[];
  /** Start from an empty config instead of the stored one. Required when the
   *  stored settings can no longer be decrypted, so they are never discarded
   *  by accident. */
  replaceAll?: boolean;
};

/**
 * 2026-09-11: merges instead of replacing. The previous version encrypted
 * exactly the keys typed into the form and wrote that over the stored
 * config -- adding a single key silently deleted every other one. See
 * mergeIntegrationSettings in shared/integrations.ts.
 */
export async function updateAdminIntegration(input: IntegrationUpdateInput, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, input.provider)).limit(1);
  const touchesSettings = Boolean(input.replaceAll || (input.set && Object.keys(input.set).length) || input.clearKeys?.length);
  let encryptedConfig: string | null | undefined;
  if (touchesSettings) {
    const validationError = validateIntegrationSettings(input.provider, input.set ?? {});
    if (validationError) throw new Error(validationError);
    const decoded = decodeIntegrationRow(existing[0]?.encryptedConfig);
    if (decoded.decryptFailed && !input.replaceAll) {
      throw new Error("Хадгалсан тохиргоог тайлж чадсангүй (шифрлэлтийн түлхүүр өөрчлөгдсөн байж магадгүй). Бүх утгыг шинээр оруулж \"Бүгдийг солих\" горимоор хадгална уу.");
    }
    const merged = mergeIntegrationSettings(input.replaceAll ? {} : decoded.settings, input.set, input.clearKeys);
    encryptedConfig = Object.keys(merged).length ? encryptJson(merged) : null;
  }
  if (existing[0]) {
    const patch: { isActive?: boolean; encryptedConfig?: string | null; updatedByUserId: number; updatedAt: Date } = { updatedByUserId, updatedAt: new Date() };
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (encryptedConfig !== undefined) patch.encryptedConfig = encryptedConfig;
    await db.update(integrationConfigs).set(patch).where(eq(integrationConfigs.id, existing[0].id));
  } else {
    await db.insert(integrationConfigs).values({ provider: input.provider, isActive: input.isActive ?? false, encryptedConfig: encryptedConfig ?? null, updatedByUserId });
  }
  invalidateCached(integrationCacheKey(input.provider));
  const [result] = await getAdminIntegrations().then(rows => rows.filter(row => row.provider === input.provider));
  return result;
}
