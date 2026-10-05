import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASSIFIED_TABLES, normalizePhone, TABLE_GROUPS, tablesToWipe } from "../scripts/new-owner-reset";

// Эзэн солих (2026-10-05): drizzle-ийн хүснэгт БҮР цэвэрлэгээний скриптэд ангилагдсан байх ёстой —
// шинэ хүснэгт (жишээ нь харилцагчийн өгөгдөл) нэмээд ангилахаа мартвал скрипт production дээр
// татгалзана; энэ тест түүнийг commit-оос өмнө барина.
const schemaTables = [...readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf8").matchAll(/mysqlTable\("([a-z0-9_]+)"/g)].map(m => m[1]);

describe("new-owner-reset ангилал", () => {
  it("drizzle-ийн хүснэгт бүр ангилагдсан", () => {
    expect(schemaTables.filter(table => !CLASSIFIED_TABLES.has(table))).toEqual([]);
  });
  it("нэг хүснэгт нэг л бүлэгт, бүлгийн нэр бүр бодит хүснэгт", () => {
    const all = Object.values(TABLE_GROUPS).flat() as string[];
    expect(all.length).toBe(new Set(all).size);
    expect(all.filter(table => table !== "schema_migrations" && !schemaTables.includes(table))).toEqual([]);
  });
  it("харилцагчийн өгөгдөл, нууц түлхүүр ҮРГЭЛЖ устна; users/schema_migrations хэзээ ч", () => {
    const keepEverything = tablesToWipe({ keepAdminPhones: ["1"], keepCatalog: true, keepContent: true, keepBranches: true, keepBrand: true });
    for (const table of ["orders", "integration_configs", "push_subscriptions", "face_enrollments", "user_addresses", "admin_audit_logs"]) {
      expect(keepEverything).toContain(table);
    }
    expect(tablesToWipe({ keepAdminPhones: ["1"] })).not.toContain("users");
    expect(tablesToWipe({ keepAdminPhones: ["1"] })).not.toContain("schema_migrations");
  });
  it("салбарын нөөц каталог БА салбар хоёулаа үлдвэл л үлдэнэ", () => {
    expect(tablesToWipe({ keepAdminPhones: [], keepCatalog: true, keepBranches: true })).not.toContain("branch_stock");
    expect(tablesToWipe({ keepAdminPhones: [], keepCatalog: true })).toContain("branch_stock");
  });
  it("утас нормчлол", () => {
    expect(normalizePhone("+976 9911-2233")).toBe("99112233");
    expect(normalizePhone("99112233")).toBe("99112233");
  });
});
