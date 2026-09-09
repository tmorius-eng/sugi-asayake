import { afterEach, describe, expect, it, vi } from "vitest";
import { createQPayInvoice, decideCallbackOutcome, getQPayAvailability, parseQPayPaymentCheck } from "./qpay";

describe("QPay provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps live invoice creation inactive when merchant secrets are absent", async () => {
    vi.stubEnv("QPAY_USERNAME", "");
    vi.stubEnv("QPAY_PASSWORD", "");
    vi.stubEnv("QPAY_INVOICE_CODE", "");

    expect(getQPayAvailability()).toMatchObject({ configured: false });
    await expect(createQPayInvoice({
      senderInvoiceNo: "SA-TEST-001",
      amountMnt: 10_000,
      description: "Test order",
      callbackUrl: "https://example.com/api/payments/qpay/callback",
    })).rejects.toThrow("QPAY_NOT_CONFIGURED");
  });
});

// Audit 2026-09-09 (R6): the payment-check parser and the underpayment rule
// are pure so they can be pinned here without a merchant account.
describe("parseQPayPaymentCheck", () => {
  it("reads the documented shape: top-level paid_amount plus PAID rows", () => {
    const parsed = parseQPayPaymentCheck({
      count: 1,
      paid_amount: 100,
      rows: [{ payment_id: "593744473409193", payment_status: "PAID", payment_amount: "100.00", payment_currency: "MNT" }],
    });
    expect(parsed).toEqual({ paid: true, paymentId: "593744473409193", paidAmountMnt: 100 });
  });

  it("sums PAID rows when there is no top-level paid_amount, ignoring non-paid rows", () => {
    const parsed = parseQPayPaymentCheck({
      rows: [
        { payment_id: "a", payment_status: "PAID", payment_amount: "30000" },
        { payment_id: "b", payment_status: "FAILED", payment_amount: "99999" },
        { payment_id: "c", payment_status: "PAID", payment_amount: 20000 },
      ],
    });
    expect(parsed).toEqual({ paid: true, paymentId: "a", paidAmountMnt: 50_000 });
  });

  it("reports an unknown amount (null) rather than guessing when the response carries none", () => {
    expect(parseQPayPaymentCheck({ rows: [{ payment_id: "x", payment_status: "PAID" }] })).toEqual({ paid: true, paymentId: "x", paidAmountMnt: null });
    expect(parseQPayPaymentCheck({})).toEqual({ paid: false, paymentId: null, paidAmountMnt: null });
    expect(parseQPayPaymentCheck({ rows: "garbage" })).toEqual({ paid: false, paymentId: null, paidAmountMnt: null });
  });
});

describe("decideCallbackOutcome", () => {
  it("confirms a full payment and one whose amount QPay did not report", () => {
    expect(decideCallbackOutcome({ paid: true, paidAmountMnt: 50_000 }, 50_000)).toBe("confirm");
    expect(decideCallbackOutcome({ paid: true, paidAmountMnt: 60_000 }, 50_000)).toBe("confirm");
    expect(decideCallbackOutcome({ paid: true, paidAmountMnt: null }, 50_000)).toBe("confirm");
  });

  it("never confirms an underpaid invoice", () => {
    expect(decideCallbackOutcome({ paid: true, paidAmountMnt: 49_999 }, 50_000)).toBe("underpaid");
    expect(decideCallbackOutcome({ paid: true, paidAmountMnt: 0 }, 50_000)).toBe("underpaid");
  });

  it("does nothing for an unpaid invoice whatever the amount says", () => {
    expect(decideCallbackOutcome({ paid: false, paidAmountMnt: 50_000 }, 50_000)).toBe("unpaid");
  });
});
