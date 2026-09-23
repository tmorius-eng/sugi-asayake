import { describe, expect, it } from "vitest";
import { INTERNAL_ERR_MSG } from "../../shared/const";
import { maskErrorShape } from "./trpc";

// Аудит 2026-09-20 (P0-2): production-д клиент рүү очих алдааны мессежийн маск.
// Цэвэр функц тул сүлжээ/DB-гүй; production эсэхийг параметрээр өгнө.
describe("maskErrorShape", () => {
  const shape = (message: string) => ({ message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR" } });

  it("hides every INTERNAL_SERVER_ERROR message in production", () => {
    expect(maskErrorShape(shape("connect ETIMEDOUT 10.0.0.5:3306"), "INTERNAL_SERVER_ERROR", true).message).toBe(INTERNAL_ERR_MSG);
    expect(maskErrorShape(shape("anything at all"), "INTERNAL_SERVER_ERROR", true).message).toBe(INTERNAL_ERR_MSG);
  });

  it("hides driver/SQL-shaped messages even when a procedure wrapped them as BAD_REQUEST", () => {
    for (const leaked of [
      "ER_LOCK_WAIT_TIMEOUT: Lock wait timeout exceeded; try restarting transaction",
      "Duplicate entry '9911' for key 'users.phone'",
      "Unknown column 'foo' in 'field list'",
      "Table 'defaultdb.carts' doesn't exist",
      "connect ECONNREFUSED 127.0.0.1:3307",
      "getaddrinfo EAI_AGAIN sugi-db.internal",
      "TypeError: Cannot read properties of undefined (reading 'id')",
      "Error: boom\n    at placeOrder (/srv/app/dist/index.js:1234:56)",
    ]) {
      expect(maskErrorShape(shape(leaked), "BAD_REQUEST", true).message, leaked).toBe(INTERNAL_ERR_MSG);
    }
  });

  it("keeps the deliberate, customer-facing validation messages", () => {
    for (const message of [
      "Утасны дугаар эсвэл нууц үг буруу байна.",
      "Энэ хямдралын код яг энэ мөчид дууссан байна. Дахин оролдоно уу.",
      "Your cart is empty.",
      "Select a valid SUGI branch for store pickup.",
      "Хэт олон оролдлого хийлээ. 120 секундын дараа дахин оролдоно уу.",
    ]) {
      expect(maskErrorShape(shape(message), "BAD_REQUEST", true).message).toBe(message);
      expect(maskErrorShape(shape(message), "UNAUTHORIZED", true).message).toBe(message);
    }
  });

  it("leaves everything untouched outside production (developers need the real message)", () => {
    const leaked = shape("ER_NO_SUCH_TABLE: Table 'x' doesn't exist");
    expect(maskErrorShape(leaked, "INTERNAL_SERVER_ERROR", false)).toBe(leaked);
  });
});

/**
 * 2026-09-23. zod схем унавал tRPC нь асуудлын жагсаалтыг JSON-оор `message`-д
 * хийдэг бөгөөд клиент бүр түүнийг шууд toast болгодог тул худалдан авагч
 * `[{"origin":"string",…}]` гэсэн хана хардаг байв (Checkout-ийн имэйл/хаяг,
 * бүртгэлийн нууц үг). Одоо хүний уншихаар монгол өгүүлбэр болно.
 */
describe("validation message humanising", () => {
  const zodJson = (issues: unknown[]) => JSON.stringify(issues, null, 2);

  it("names the field in Mongolian and says what is wrong", () => {
    const shape = { message: zodJson([{ code: "invalid_format", path: ["customerEmail"], message: "Invalid email" }]) };
    const masked = maskErrorShape(shape, "BAD_REQUEST", true);
    expect(masked.message).toContain("имэйл хаяг");
    expect(masked.message).not.toContain("{");
    expect(masked.message).not.toContain("invalid_format");
  });

  it("turns a minimum-length failure into a readable rule", () => {
    const shape = { message: zodJson([{ code: "too_small", minimum: 8, path: ["password"], message: "Too small" }]) };
    expect(maskErrorShape(shape, "BAD_REQUEST", true).message).toContain("нууц үг — хамгийн багадаа 8 тэмдэгт");
  });

  it("lists several fields and counts the rest", () => {
    const shape = { message: zodJson([
      { code: "invalid_type", path: ["customerName"] },
      { code: "too_small", minimum: 8, path: ["deliveryAddress"] },
      { code: "invalid_format", path: ["customerEmail"] },
      { code: "invalid_format", path: ["customerPhone"] },
      { code: "invalid_format", path: ["pickupBranch"] },
    ]) };
    const message = maskErrorShape(shape, "BAD_REQUEST", true).message;
    expect(message).toContain("нэр — заавал бөглөнө");
    expect(message).toContain("хүргэлтийн хаяг");
    expect(message).toContain("болон өөр 1");
  });

  it("leaves an ordinary user-facing message alone", () => {
    const shape = { message: "Энэ утасны дугаараар бүртгэл үүссэн байна." };
    expect(maskErrorShape(shape, "BAD_REQUEST", true).message).toBe(shape.message);
  });

  it("does not mistake a non-JSON message that happens to start with a bracket", () => {
    const shape = { message: "[SUGI] Захиалга олдсонгүй." };
    expect(maskErrorShape(shape, "BAD_REQUEST", true).message).toBe(shape.message);
  });
});
