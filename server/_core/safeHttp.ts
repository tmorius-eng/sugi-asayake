import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPrivateAddress } from "../../shared/ip-address";

/**
 * Outbound HTTP for URLs an admin (or a customer's browser) can influence
 * (2026-10-01, security audit group D). `fetch` follows redirects and happily
 * dials 127.0.0.1 / the cloud metadata address / the LAN, and reads a body of
 * any size. This module does not:
 *
 *  - every resolved address is checked with `isPrivateAddress` INSIDE the
 *    socket's `lookup` hook, so the address that was checked is the address
 *    that is connected to (no resolve-then-connect DNS rebinding gap). An IP
 *    literal never reaches `lookup`, so it is checked up front;
 *  - redirects are never followed (any 3xx is an error) -- a vendor URL that
 *    answers 302 -> http://169.254.169.254/ must not be chased;
 *  - the response body is capped (`maxBytes`) and the whole request has a hard
 *    wall-clock deadline (node's own `timeout` is idle-only);
 *  - TLS still verifies the certificate against the ORIGINAL hostname.
 *
 * It also sends a body on a GET (Smart Software's documented token call),
 * which fetch cannot.
 */

export class SafeHttpError extends Error {
  constructor(message: string, readonly code: "private_address" | "redirect" | "too_large" | "timeout" | "network" | "bad_url" = "network") {
    super(message);
    this.name = "SafeHttpError";
  }
}

export { isPrivateAddress };

type LookupAddress = { address: string; family: number };
type LookupCallback = (error: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: { all?: boolean; family?: number; hints?: number }, callback: LookupCallback) => void;

export type SafeHttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Idle timeout (resets whenever a byte arrives). */
  timeoutMs?: number;
  /** Hard wall-clock cap on the whole request. */
  deadlineMs?: number;
  /** Response body cap in bytes. */
  maxBytes?: number;
  /** Test seam: replaces dns.lookup. */
  dnsLookup?: LookupFn;
  /** Test seam ONLY: skip the private-address refusal (loopback test servers). */
  allowPrivateAddresses?: boolean;
};

export type SafeHttpResponse = { status: number; headers: IncomingHttpHeaders; body: string };

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_DEADLINE_MS = 60_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function safeRequest(urlInput: string | URL, options: SafeHttpOptions = {}): Promise<SafeHttpResponse> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try { url = new URL(urlInput); } catch { reject(new SafeHttpError("хаяг буруу байна.", "bad_url")); return; }
    if (url.protocol !== "https:" && url.protocol !== "http:") { reject(new SafeHttpError("зөвхөн http(s) хаяг зөвшөөрнө.", "bad_url")); return; }
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const refusePrivate = !options.allowPrivateAddresses;

    // An IP literal bypasses `lookup` entirely, so check it here.
    if (refusePrivate && isIP(hostname) && isPrivateAddress(hostname)) {
      reject(new SafeHttpError("дотоод сүлжээний хаяг руу хүсэлт илгээхийг хориглоно.", "private_address"));
      return;
    }

    const resolver: LookupFn = options.dnsLookup ?? ((host, opts, cb) => dnsLookup(host, opts as never, cb as never));
    const guardedLookup = (host: string, lookupOptions: { all?: boolean; family?: number; hints?: number }, callback: LookupCallback) => {
      resolver(host, { ...lookupOptions, all: true }, (error, addresses) => {
        if (error) { callback(error); return; }
        const list = (Array.isArray(addresses) ? addresses : []) as LookupAddress[];
        if (list.length === 0) { callback(Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" })); return; }
        if (refusePrivate && list.some(entry => isPrivateAddress(entry.address))) {
          callback(Object.assign(new SafeHttpError("хост дотоод сүлжээний хаяг руу шийдэгдэж байна.", "private_address"), { code: "EPRIVATE" }));
          return;
        }
        if (lookupOptions.all) callback(null, list);
        else callback(null, list[0].address, list[0].family);
      });
    };

    const headers = { ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(options.body));
    const send = url.protocol === "http:" ? httpRequest : httpsRequest;

    let settled = false;
    const settle = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(deadline); fn(); };
    const req = send(url, { method: options.method ?? "GET", headers, timeout: timeoutMs, lookup: guardedLookup as never, agent: false }, response => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        settle(() => reject(new SafeHttpError(`хариу ${status} (redirect) байна — дагахгүй.`, "redirect")));
        req.destroy();
        return;
      }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) {
        settle(() => reject(new SafeHttpError(`хариу ${maxBytes} байтаас хэтэрсэн тул зогсоов.`, "too_large")));
        req.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          settle(() => reject(new SafeHttpError(`хариу ${maxBytes} байтаас хэтэрсэн тул зогсоов.`, "too_large")));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => settle(() => resolve({ status, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") })));
      response.on("error", error => settle(() => reject(error)));
    });
    const deadline = setTimeout(() => {
      settle(() => reject(new SafeHttpError(`${deadlineMs}мс дотор дуусаагүй тул зогсоов.`, "timeout")));
      req.destroy();
    }, deadlineMs);
    deadline.unref?.();
    req.on("timeout", () => req.destroy(new SafeHttpError(`${timeoutMs}мс хариу ирсэнгүй.`, "timeout")));
    req.on("error", error => settle(() => reject(error)));
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/**
 * Reads a fetch Response body but stops (and cancels the stream) once it passes
 * `maxBytes`, so a hostile or broken server cannot make us buffer gigabytes.
 */
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SafeHttpError(`хариу ${maxBytes} байтаас хэтэрсэн.`, "too_large");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SafeHttpError(`хариу ${maxBytes} байтаас хэтэрсэн.`, "too_large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}
