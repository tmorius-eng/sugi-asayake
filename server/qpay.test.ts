import { afterEach, describe, expect, it, vi } from "vitest";
import { createQPayInvoice, getQPayAvailability } from "./qpay";

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
