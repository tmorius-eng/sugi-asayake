import { and, asc, eq, gt, inArray, lt, ne, or, isNull, sql } from "drizzle-orm";
import { branches, branchStock, externalRefs, integrationSyncState, stockMovements } from "../../drizzle/schema";
import { normaliseBarcode } from "../../shared/barcode";
import { getDb, getActiveIntegrationConfig, getIntegrationSettings } from "../db";
import { createSnapshotCount, resolveCodes } from "../inventory";
import { applyBranchStockDelta } from "../stockLedger";

/**
 * Syncing stock with the shop's POS vendor, Smart Software (2026-09-11,
 * Phase 6; the real adapter landed 2026-09-12 in ./smartSoftware.ts). This
 * file is vendor-neutral: it says WHAT the site needs from a POS and owns
 * the bookkeeping (cursors, claims, idempotency), while the adapter owns
 * the HTTP.
 *
 * Streams, each resumable from a row in integration_sync_state:
 *  - push:  our stock movements -> the vendor (receipts, transfers, online
 *           sales). Only movements older than a 2-minute lag window, because
 *           auto-increment ids can commit out of order. Movements that CAME
 *           from the vendor (refType 'external') are never sent back.
 *           Smart POS has no endpoint for this; kept for the next vendor.
 *  - sales: the vendor's in-store sales -> our ledger, as
 *           'sale_pos_external', each recorded once (external_refs 'sale').
 *           Also unimplemented by Smart POS (only their separate Accounting
 *           API lists sales), so it stays dormant there.
 *  - snapshot: the vendor's stock per location -> a stocktake waiting for
 *           warehouse/admin approval. It NEVER writes stock by itself: an
 *           approval posts it through the normal count path, on the ledger.
 *
 * Every function takes an optional `namespace` (default "smartsoftware")
 * which is the provider key used in external_refs / integration_sync_state,
 * so the contract tests can run the real runners against throwaway state
 * instead of the shop's own.
 */

export type ExternalMovement = { movementId: number; branchExternalId: string; sku: string; delta: number; type: string; occurredAt: Date };
export type ExternalSale = { externalId: string; branchExternalId: string; occurredAt: Date; lines: { sku: string; quantity: number }[] };
/** One product line per barcode, with its count at each vendor location. */
export type StockSnapshot = { products: { sku: string; name: string; stock: Record<string, number> }[]; locationIds: string[]; fetchedAt: Date };

export interface InventorySyncProvider {
  readonly name: string;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  /** Accepted ids, and the ones it refused (retryable or not). */
  pushMovements?(batch: ExternalMovement[]): Promise<{ accepted: number[]; rejected: { movementId: number; reason: string; retryable: boolean }[] }>;
  pullSales?(cursor: string | null): Promise<{ sales: ExternalSale[]; nextCursor: string | null }>;
  /** The vendor's own stock figures, per location code. */
  pullStockSnapshot?(): Promise<StockSnapshot>;
  /** The vendor's location codes, for the branch mapping form. */
  listLocations?(): Promise<{ id: string; name: string }[]>;
}

const PROVIDER = "smartsoftware";
const PUSH_LAG_SECONDS = 120;
const PUSH_BATCH = 200;

export type SyncOptions = { namespace?: string; lagSeconds?: number };
const namespaceOf = (options?: SyncOptions) => options?.namespace ?? PROVIDER;

let registered: ((config: Record<string, string>) => InventorySyncProvider | null) | null = null;

/** Called once, on import, by the adapter module (./smartSoftware.ts). */
export function registerInventorySyncProvider(factory: ((config: Record<string, string>) => InventorySyncProvider | null) | null) {
  registered = factory;
}

/** The live provider, or null: no adapter, no credentials, or switched off.
 *  `requireActive: false` is for the admin's own "test"/"sync now" buttons,
 *  which must work while the integration is still being set up. */
export async function getInventorySyncProvider(options: { requireActive?: boolean } = {}): Promise<InventorySyncProvider | null> {
  if (!registered) return null;
  if (options.requireActive === false) {
    const stored = await getIntegrationSettings(PROVIDER);
    return stored ? registered(stored.settings) : null;
  }
  const config = await getActiveIntegrationConfig(PROVIDER);
  return config ? registered(config) : null;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

async function readState(stream: string, namespace: string) {
  const db = await requireDb();
  const [row] = await db.select().from(integrationSyncState).where(and(eq(integrationSyncState.provider, namespace), eq(integrationSyncState.stream, stream))).limit(1);
  return row ?? null;
}

async function writeState(stream: string, patch: { cursor?: string | null; ok?: boolean; error?: string | null }, namespace: string) {
  const db = await requireDb();
  const now = new Date();
  const values = {
    provider: namespace, stream, lastRunAt: now,
    ...(patch.cursor !== undefined ? { cursor: patch.cursor } : {}),
    ...(patch.ok ? { lastOkAt: now, lastError: null } : {}),
    ...(patch.error ? { lastError: patch.error.slice(0, 500) } : {}),
  };
  await db.insert(integrationSyncState).values(values).onDuplicateKeyUpdate({ set: values });
}

/** Starts a stream at a known point (the tests, so a fresh namespace does
 *  not begin by walking the shop's entire movement history). */
export async function seedSyncCursor(stream: string, cursor: string, options: SyncOptions = {}) {
  await writeState(stream, { cursor }, namespaceOf(options));
}

async function branchExternalIds(namespace: string) {
  const db = await requireDb();
  const rows = await db.select({ entityId: externalRefs.entityId, externalId: externalRefs.externalId }).from(externalRefs).where(and(eq(externalRefs.provider, namespace), eq(externalRefs.entityType, "branch")));
  return { byOurs: new Map(rows.map(row => [row.entityId, row.externalId])), byTheirs: new Map(rows.map(row => [row.externalId, row.entityId])) };
}

/**
 * Sends our movements the vendor has not seen. The cursor only moves past a
 * CONTIGUOUS run of accepted ids -- a refused movement stops it there, so
 * nothing after it is skipped; a non-retryable refusal is recorded as the
 * stream's error for an admin to look at.
 */
export async function runPushMovements(provider: InventorySyncProvider, options: SyncOptions = {}) {
  if (!provider.pushMovements) return { pushed: 0, skipped: "provider cannot receive movements" };
  const namespace = namespaceOf(options);
  const lagSeconds = Math.max(0, Math.floor(options.lagSeconds ?? PUSH_LAG_SECONDS));
  const db = await requireDb();
  const state = await readState("push", namespace);
  const after = Number(state?.cursor ?? 0);
  const refs = await branchExternalIds(namespace);
  const rows = await db.select({ id: stockMovements.id, branchId: stockMovements.branchId, sku: stockMovements.sku, delta: stockMovements.delta, type: stockMovements.type, createdAt: stockMovements.createdAt })
    .from(stockMovements)
    .where(and(gt(stockMovements.id, after), lt(stockMovements.createdAt, sql`NOW() - INTERVAL ${sql.raw(String(lagSeconds))} SECOND`), or(isNull(stockMovements.refType), ne(stockMovements.refType, "external"))))
    .orderBy(asc(stockMovements.id)).limit(PUSH_BATCH);
  const batch: ExternalMovement[] = [];
  let cursor = after;
  for (const row of rows) {
    const branchExternalId = refs.byOurs.get(row.branchId);
    // A location the vendor does not know (the warehouse, if it is not in
    // Smart POS) has nothing to push; step over it.
    if (!branchExternalId) { if (!batch.length) cursor = row.id; continue; }
    batch.push({ movementId: row.id, branchExternalId, sku: row.sku, delta: row.delta, type: row.type, occurredAt: row.createdAt });
  }
  if (!batch.length) { await writeState("push", { cursor: String(cursor), ok: true }, namespace); return { pushed: 0 }; }
  const result = await provider.pushMovements(batch);
  const accepted = new Set(result.accepted);
  for (const movement of batch) { if (!accepted.has(movement.movementId)) break; cursor = movement.movementId; }
  const fatal = result.rejected.find(item => !item.retryable);
  await writeState("push", { cursor: String(cursor), ok: !result.rejected.length, error: fatal ? `movement ${fatal.movementId}: ${fatal.reason}` : result.rejected[0]?.reason ?? null }, namespace);
  return { pushed: accepted.size, cursor };
}

/** Records the vendor's in-store sales on our ledger, each exactly once. */
export async function runPullSales(provider: InventorySyncProvider, options: SyncOptions = {}) {
  if (!provider.pullSales) return { recorded: 0, skipped: "provider cannot list sales" };
  const namespace = namespaceOf(options);
  const db = await requireDb();
  const state = await readState("sales", namespace);
  const { sales, nextCursor } = await provider.pullSales(state?.cursor ?? null);
  const refs = await branchExternalIds(namespace);
  let recorded = 0;
  const problems: string[] = [];
  for (const sale of sales) {
    const branchId = refs.byTheirs.get(sale.branchExternalId);
    if (!branchId) { problems.push(`sale ${sale.externalId}: unknown store ${sale.branchExternalId}`); continue; }
    const resolved = await resolveCodes(sale.lines.map(line => line.sku));
    await db.transaction(async tx => {
      // Claim the sale first: a second pull of the same sale hits the unique
      // key and records nothing.
      const claimed = await tx.insert(externalRefs).ignore().values({ provider: namespace, entityType: "sale", entityId: 0, externalId: sale.externalId });
      if (Number(claimed[0].affectedRows ?? 0) !== 1) return;
      // A sale has no row of ours to point at; give the claim its own id as
      // entityId so the (provider, type, entityId) key stays unique -- left
      // at 0, the SECOND sale ever pulled would look like a duplicate.
      await tx.update(externalRefs).set({ entityId: sql`${externalRefs.id}` }).where(and(eq(externalRefs.provider, namespace), eq(externalRefs.entityType, "sale"), eq(externalRefs.externalId, sale.externalId)));
      for (const line of sale.lines) {
        const variantId = resolved.get(line.sku);
        if (!variantId) { problems.push(`sale ${sale.externalId}: unknown barcode ${line.sku}`); continue; }
        await applyBranchStockDelta(tx, branchId, variantId, -Math.abs(line.quantity), { type: "sale_pos_external", refType: "external", note: `Smart POS ${sale.externalId}` }, { allowNegative: true });
      }
      recorded++;
    });
  }
  await writeState("sales", { cursor: nextCursor, ok: !problems.length, error: problems.length ? problems.slice(0, 5).join("; ") : null }, namespace);
  return { recorded, problems };
}

/**
 * Turns the vendor's stock figures into a stocktake per mapped branch,
 * waiting for warehouse/admin approval (server/inventory.ts's
 * createSnapshotCount). Nothing here writes stock.
 *
 * Only barcodes we know become lines, and only where the vendor's number
 * differs from our shelf -- a proposal an approver can actually read. The
 * unmatched barcodes and any unmapped location come back in the result so
 * the admin card can say what was skipped and why.
 */
export async function runPullSnapshot(provider: InventorySyncProvider, options: SyncOptions = {}) {
  if (!provider.pullStockSnapshot) return { ran: false as const, skipped: "provider cannot report stock" };
  const namespace = namespaceOf(options);
  const db = await requireDb();
  const snapshot = await provider.pullStockSnapshot();
  const refs = await branchExternalIds(namespace);
  const resolved = await resolveCodes(snapshot.products.map(product => product.sku));
  const skuByVariant = new Map<number, string>();
  const unknownSkus: string[] = [];
  // barcode -> our variant, once for the whole snapshot. The key must be
  // normalised exactly as resolveCodes normalised it (shared/barcode.ts
  // strips the spaces and hyphens a code picks up in a spreadsheet) -- a
  // plain trim here would report "8000 040 002 509" as an unknown product.
  const matched = new Map<string, number>();
  for (const product of snapshot.products) {
    const variantId = resolved.get(normaliseBarcode(product.sku));
    if (variantId === undefined) { unknownSkus.push(product.sku); continue; }
    matched.set(product.sku, variantId);
    if (!skuByVariant.has(variantId)) skuByVariant.set(variantId, normaliseBarcode(product.sku));
  }

  const stamp = snapshot.fetchedAt.toISOString().slice(0, 16).replace("T", " ");
  const results: { branchId: number; branchName: string; locationId: string; countId: number | null; code: string | null; lines: number }[] = [];
  const problems: string[] = [];
  for (const [branchId, locationId] of Array.from(refs.byOurs)) {
    // What the vendor says this location holds, by our variant id.
    const theirs = new Map<number, number>();
    for (const product of snapshot.products) {
      const variantId = matched.get(product.sku);
      if (variantId === undefined) continue;
      const quantity = product.stock[locationId];
      if (quantity === undefined) continue;
      theirs.set(variantId, (theirs.get(variantId) ?? 0) + Math.max(0, Math.floor(quantity)));
    }
    if (!theirs.size) continue;
    const variantIds = Array.from(theirs.keys());
    const shelfRows = await db.select({ variantId: branchStock.variantId, quantity: branchStock.stockQuantity }).from(branchStock)
      .where(and(eq(branchStock.branchId, branchId), inArray(branchStock.variantId, variantIds)));
    const ours = new Map(shelfRows.map(row => [row.variantId, row.quantity]));
    const lines = variantIds
      .filter(variantId => (ours.get(variantId) ?? 0) !== theirs.get(variantId))
      .map(variantId => ({ variantId, sku: skuByVariant.get(variantId)!, countedQty: theirs.get(variantId)!, systemQty: ours.get(variantId) ?? 0 }));
    const [branchRow] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!lines.length) { results.push({ branchId, branchName: branchRow?.name ?? String(branchId), locationId, countId: null, code: null, lines: 0 }); continue; }
    try {
      const count = await createSnapshotCount({ branchId, sourceLabel: `${locationId} · ${stamp}`, lines });
      results.push({ branchId, branchName: count.branchName, locationId, countId: count.id, code: count.code, lines: lines.length });
    } catch (error) {
      problems.push(`${branchRow?.name ?? branchId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const unmappedLocations = snapshot.locationIds.filter(locationId => !refs.byTheirs.has(locationId));
  await writeState("snapshot", { cursor: snapshot.fetchedAt.toISOString(), ok: !problems.length, error: problems.length ? problems.slice(0, 3).join("; ") : null }, namespace);
  return {
    ran: true as const,
    products: snapshot.products.length,
    matchedProducts: matched.size,
    unknownSkus: unknownSkus.slice(0, 20),
    unknownSkuCount: unknownSkus.length,
    branches: results,
    unmappedLocations,
    problems,
  };
}

/** One scheduled pass. A no-op unless the integration is switched on with
 *  credentials set. */
export async function runInventorySync(options: SyncOptions = {}) {
  const namespace = namespaceOf(options);
  const provider = await getInventorySyncProvider();
  if (!provider) return { ran: false };
  const fail = (stream: string) => async (error: unknown) => { await writeState(stream, { error: String(error) }, namespace); return { error: String(error) }; };
  const push = await runPushMovements(provider, options).catch(fail("push"));
  const sales = await runPullSales(provider, options).catch(fail("sales"));
  const snapshot = await runPullSnapshot(provider, options).catch(fail("snapshot"));
  return { ran: true, push, sales, snapshot };
}

/** For the admin card: every stream's state, plus the branch code mapping. */
export async function getInventorySyncStatus(options: SyncOptions = {}) {
  const namespace = namespaceOf(options);
  const db = await requireDb();
  const [states, branchRows, refs, stored] = await Promise.all([
    db.select().from(integrationSyncState).where(eq(integrationSyncState.provider, namespace)),
    db.select({ id: branches.id, name: branches.name, kind: branches.kind, isActive: branches.isActive }).from(branches).orderBy(asc(branches.sortOrder), asc(branches.id)),
    branchExternalIds(namespace),
    getIntegrationSettings(PROVIDER).catch(() => null),
  ]);
  return {
    adapterAvailable: registered !== null,
    credentialsSet: Boolean(stored?.settings.username && stored?.settings.password),
    isActive: Boolean(stored?.isActive),
    streams: states.map(state => ({ stream: state.stream, cursor: state.cursor, lastRunAt: state.lastRunAt, lastOkAt: state.lastOkAt, lastError: state.lastError })),
    branches: branchRows.map(branch => ({ ...branch, externalId: refs.byOurs.get(branch.id) ?? null })),
  };
}

/** Sets (or clears, with an empty code) a branch's location code at the vendor. */
export async function setBranchExternalId(branchId: number, externalId: string | null, options: SyncOptions = {}) {
  const namespace = namespaceOf(options);
  const db = await requireDb();
  const code = externalId?.trim() || null;
  await db.transaction(async tx => {
    await tx.delete(externalRefs).where(and(eq(externalRefs.provider, namespace), eq(externalRefs.entityType, "branch"), eq(externalRefs.entityId, branchId)));
    if (code) {
      const [taken] = await tx.select({ entityId: externalRefs.entityId }).from(externalRefs).where(and(eq(externalRefs.provider, namespace), eq(externalRefs.entityType, "branch"), eq(externalRefs.externalId, code))).limit(1);
      if (taken) throw new Error(`"${code}" кодыг өөр салбарт аль хэдийн оноосон байна.`);
      await tx.insert(externalRefs).values({ provider: namespace, entityType: "branch", entityId: branchId, externalId: code });
    }
  });
  return getInventorySyncStatus(options);
}

/**
 * A stand-in provider for tests and for exercising the admin card before
 * the real API exists. Records what it is sent; serves sales it is given.
 */
export class FakeInventorySyncProvider implements InventorySyncProvider {
  readonly name = "fake";
  received: ExternalMovement[] = [];
  refuse = new Map<number, { reason: string; retryable: boolean }>();
  snapshot: StockSnapshot | null = null;
  constructor(private salesToServe: ExternalSale[] = []) {}
  async testConnection() { return { ok: true, detail: "fake provider" }; }
  async listLocations() { return (this.snapshot?.locationIds ?? []).map(id => ({ id, name: `Fake ${id}` })); }
  async pullStockSnapshot() {
    if (!this.snapshot) throw new Error("no snapshot configured");
    return this.snapshot;
  }
  async pushMovements(batch: ExternalMovement[]) {
    const accepted: number[] = [];
    const rejected: { movementId: number; reason: string; retryable: boolean }[] = [];
    for (const movement of batch) {
      const refusal = this.refuse.get(movement.movementId);
      if (refusal) rejected.push({ movementId: movement.movementId, ...refusal });
      else { accepted.push(movement.movementId); this.received.push(movement); }
    }
    return { accepted, rejected };
  }
  async pullSales(cursor: string | null) {
    const start = Number(cursor ?? 0);
    const page = this.salesToServe.slice(start, start + 50);
    return { sales: page, nextCursor: String(start + page.length) };
  }
}
