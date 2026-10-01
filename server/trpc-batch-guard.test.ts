import { describe, expect, it } from "vitest";
import { isMixedPrivilegedBatch } from "./_core/trpcBatchGuard";

describe("isMixedPrivilegedBatch", () => {
  it("allows single and all-public batches", () => {
    expect(isMixedPrivilegedBatch("/catalog.list")).toBe(false);
    expect(isMixedPrivilegedBatch("/catalog.list,content.siteMedia")).toBe(false);
    expect(isMixedPrivilegedBatch("")).toBe(false);
  });

  it("allows all-admin / all-inventory batches", () => {
    expect(isMixedPrivilegedBatch("/admin.users,admin.orders")).toBe(false);
    expect(isMixedPrivilegedBatch("/inventory.context,inventory.receipts")).toBe(false);
    expect(isMixedPrivilegedBatch("/admin.users,inventory.context")).toBe(false);
  });

  it("rejects public procedure mixed with admin or inventory", () => {
    expect(isMixedPrivilegedBatch("/catalog.list,admin.users")).toBe(true);
    expect(isMixedPrivilegedBatch("/admin.users,catalog.list")).toBe(true);
    expect(isMixedPrivilegedBatch("/auth.me,inventory.skuIndex")).toBe(true);
  });

  it("handles URL-encoded commas and malformed encoding", () => {
    expect(isMixedPrivilegedBatch("/catalog.list%2Cadmin.users")).toBe(true);
    expect(isMixedPrivilegedBatch("/catalog.list,%E0%A4%A,admin.users")).toBe(true);
  });
});
