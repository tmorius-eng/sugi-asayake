# Provider integration research

## QPay payment gateway

The official QPay documentation is available at [QPay API Documentation](https://developer.qpay.mn/mn/docs). It describes QPay as an API-based payment flow for integrating a platform and lists **Merchant V2**, **Quick QR**, and **eBarimt 3.0** documentation sections. The documentation also provides support contact at `support@qpay.mn`.

The Merchant V2 documentation names a sandbox environment at `https://merchant-sandbox.qpay.mn` and production environment at `https://merchant.qpay.mn`. It documents `POST /v2/auth/token` using HTTP Basic authentication with `base64(client_id:client_secret)`, followed by Bearer authentication for protected calls. `POST /v2/invoice` requires the merchant-issued `invoice_code` and returns QR/deep-link payment options. The invoice's `sender_invoice_no` must be unique.

For a live checkout, the project needs merchant-issued QPay credentials and the selected Merchant V2 / Quick QR integration details. The expected custom-backend flow should create a server-side invoice, present the returned payment link or QR, receive the provider callback, call `POST /v2/payment/check` server-to-server to confirm payment, and only then mark the order as paid. QPay explicitly advises against cron-based polling: payment status checks should occur after the callback is received. Credentials must be stored as project secrets, never in frontend code.

## Current connector availability

No QPay connector is configured for this task. A Resend connector exists in the session catalog but is disabled; it could support real staff invitation emails once an authenticated sender domain and API credential are provided. No local delivery connector has yet been identified or configured.

## Implemented QPay readiness and activation handover

The checkout now creates the customer order from the authenticated server-side cart, so QPay is never allowed to accept an amount supplied by the browser. The backend persists each QPay invoice attempt separately, presents QPay-provided QR/deep links only after a server-created invoice, and marks an order as paid only after the callback flow verifies the payment with QPay server-to-server.

Before enabling live QPay, the merchant must provide these project secrets:

| Secret | Purpose |
| --- | --- |
| `QPAY_USERNAME` | Merchant V2 client identifier for the QPay token request. |
| `QPAY_PASSWORD` | Merchant V2 client secret used only by the server. |
| `QPAY_INVOICE_CODE` | Merchant-issued invoice code for `POST /v2/invoice`. |

QPay must also be configured to send callbacks to the deployed production URL: `https://sugi-mongo-detasex2.manus.space/api/payments/qpay/callback`. The checkout deliberately displays a **merchant setup pending** state and does not attempt an invoice when these credentials are unavailable.

## Staff access and invitations

Admin users can now create expiring seven-day staff invitations, revoke pending invitations, and change another user between `user` and `admin` roles. The database stores only a SHA-256 hash of each invitation token; the raw acceptance link is revealed once to the administrator at creation time.

Invitation acceptance requires sign-in using the exact invited email address. On acceptance, the validated token is consumed and the server grants the invited role. Until transactional email is configured, an owner notification acts as the operational fallback and the administrator can securely copy the generated link from the dashboard. Do not share invitation links in public channels.

To add email delivery later, configure an authenticated Resend sender and API credential, then replace the owner-notification fallback with a server-side Resend send. The invitation persistence, expiry, revocation, and acceptance flow can remain unchanged.

## Delivery operations

Checkout currently supports the intended local operational choices—Ulaanbaatar delivery with a fixed 5,000₮ fee and store pickup. No verified merchant delivery API or contracted dispatch provider was available during implementation, so live delivery rates, courier assignment, and dispatch confirmation are intentionally not automated. Select a contracted Mongolian delivery provider before enabling those functions.

## Sources

1. [QPay API Documentation](https://developer.qpay.mn/mn/docs)
2. [QPay Merchant V2 Documentation](https://developer.qpay.mn/mn/docs/merchant?version=2.0.0)
