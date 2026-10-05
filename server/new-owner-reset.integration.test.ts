import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { decodedSchemaOf } from "../shared/dbUrl";
import { planMysqlConnection } from "./_core/dbConnection";
import { applyReset, planReset } from "../scripts/new-owner-reset";

// Эзэн солих B2 (2026-10-05): бодит устгалыг ЗӨВХӨН migration гинжээс шинээр үүсгэсэн `sugi_migtest`
// дээр (scripts/ci-local.ts server/new-owner-reset.integration.test.ts). staging/production дээр
// хэзээ ч ажиллахгүй — схемийн нэрээр алгасна.
const url = process.env.DATABASE_URL ?? "";
const schema = (() => { try { return url ? decodedSchemaOf(url) : ""; } catch { return ""; } })();
const describeOnMigtest = schema === "sugi_migtest" ? describe : describe.skip;

describeOnMigtest("new-owner-reset — бодит устгал (sugi_migtest)", () => {
  let conn: mysql.Connection;
  let adminId = 0;
  let customerId = 0;
  // Ажиллалт бүрт давтагдашгүй 8 оронтой дугаар (тасарсан run-ий үлдэгдэлтэй давхцахгүй).
  const base = 80000000 + (Date.now() % 9_000_000);
  const adminPhone = String(base);
  const customerPhone = String(base + 1);

  beforeAll(async () => {
    conn = await mysql.createConnection(planMysqlConnection(url).options);
    const insertUser = async (phone: string, role: string) => Number(((await conn.query(
      "INSERT INTO users (email, phone, name, role, passwordHash, emailVerifiedAt) VALUES (?, ?, ?, ?, 'x', NOW())",
      [`${phone}@example.invalid`, phone, `reset-${phone}`, role],
    ))[0] as { insertId: number }).insertId);
    adminId = await insertUser(adminPhone, "admin");
    customerId = await insertUser(customerPhone, "user");
    await conn.query("INSERT INTO user_addresses (userId, label, recipientName, phone, district, addressLine) VALUES (?, 'Гэр', 'Тест', ?, 'sukhbaatar', 'Тестийн хаяг')", [customerId, customerPhone]);
    await conn.query("INSERT INTO orders (orderNumber, userId, customerName, customerPhone, deliveryMethod, paymentMethod, deliveryDistrict, deliveryAddress, subtotalMnt, deliveryFeeMnt, totalMnt, status, paymentStatus) VALUES (?, ?, 'Тест', ?, 'ub_delivery', 'cash_on_delivery', 'sukhbaatar', 'Тестийн хаяг', 1000, 0, 1000, 'pending', 'unpaid')", [`RESET${base}`, customerId, customerPhone]);
    await conn.query("INSERT INTO site_media (slotKey, imageUrl, updatedByUserId) VALUES ('home-hero', '/x.webp', ?) ON DUPLICATE KEY UPDATE updatedByUserId = VALUES(updatedByUserId)", [customerId]);
  });

  afterAll(async () => { await conn?.end(); });

  it("dry-run юу ч өөрчлөхгүй, төлөвлөгөө зөв", async () => {
    const plan = await planReset(conn, { keepAdminPhones: [`+976 ${adminPhone.slice(0, 4)}-${adminPhone.slice(4)}`], keepCatalog: true, keepBranches: true, keepBrand: true });
    expect(plan.unknownTables).toEqual([]);
    expect(plan.keptUsers.map(u => u.id)).toEqual([adminId]);
    expect(plan.wipe.find(row => row.table === "orders")!.rows).toBeGreaterThan(0);
    expect(plan.keep.map(row => row.table)).toContain("site_media");
  });

  it("admin биш дугаараар татгалзана", async () => {
    await expect(applyReset(conn, { keepAdminPhones: [customerPhone] })).rejects.toThrow(/admin биш/);
  });

  it("харилцагч/захиалга устаж, admin үлдэж, үлдэх мөрийн FK admin руу шилжинэ, өнчин мөргүй", async () => {
    const [[before]] = await conn.query("SELECT sessionVersion FROM users WHERE id = ?", [adminId]) as unknown as [Array<{ sessionVersion: number }>];
    const report = await applyReset(conn, { keepAdminPhones: [adminPhone], keepCatalog: true, keepBranches: true, keepBrand: true });
    expect(report.orphans).toEqual([]);
    expect(report.keptUserIds).toEqual([adminId]);
    const one = async (sql: string, params: unknown[] = []) => ((await conn.query(sql, params))[0] as Array<Record<string, unknown>>)[0];
    expect(Number((await one("SELECT COUNT(*) AS n FROM orders")).n)).toBe(0);
    expect(Number((await one("SELECT COUNT(*) AS n FROM user_addresses")).n)).toBe(0);
    expect(Number((await one("SELECT COUNT(*) AS n FROM users")).n)).toBe(1);
    expect(Number((await one("SELECT updatedByUserId AS u FROM site_media WHERE slotKey = 'home-hero'")).u)).toBe(adminId);
    expect(Number((await one("SELECT sessionVersion AS v FROM users WHERE id = ?", [adminId])).v)).toBe(before.sessionVersion + 1);
    // Каталог үлдсэн (ci-seed-ийн ангилал).
    expect(Number((await one("SELECT COUNT(*) AS n FROM product_categories")).n)).toBeGreaterThan(0);
  });
});
