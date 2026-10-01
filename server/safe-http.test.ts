import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateAddress, readBodyWithLimit, SafeHttpError, safeRequest } from "./_core/safeHttp";

describe("isPrivateAddress", () => {
  const privateOnes = [
    "127.0.0.1", "127.9.9.9", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "198.18.0.1", "198.19.255.255", "192.0.0.5", "192.0.2.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.1.2.3",
    "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "[::1]", "fe80::1%eth0", "not-an-ip",
  ];
  const publicOnes = ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "198.17.0.1", "198.20.0.1", "223.255.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001::200e"];
  it.each(privateOnes)("treats %s as private", ip => expect(isPrivateAddress(ip)).toBe(true));
  it.each(publicOnes)("treats %s as public", ip => expect(isPrivateAddress(ip)).toBe(false));
});

describe("safeRequest", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect") { res.writeHead(302, { Location: "http://169.254.169.254/" }); res.end(); return; }
      if (req.url === "/big") { res.writeHead(200); res.end("x".repeat(5000)); return; }
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ method: req.method, body })); });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it("refuses a private IP literal without connecting", async () => {
    await expect(safeRequest(`${base}/ok`)).rejects.toMatchObject({ code: "private_address" });
  });

  it("refuses a hostname that resolves to a private address (checked in the lookup hook)", async () => {
    const dnsLookup = (_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    await expect(safeRequest("http://rebind.example.test/", { dnsLookup: dnsLookup as never })).rejects.toBeInstanceOf(SafeHttpError);
  });

  it("sends a body on GET and returns the status and body", async () => {
    const response = await safeRequest(`${base}/ok`, { method: "GET", body: "a=b", allowPrivateAddresses: true });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ method: "GET", body: "a=b" });
  });

  it("does not follow a redirect", async () => {
    await expect(safeRequest(`${base}/redirect`, { allowPrivateAddresses: true })).rejects.toMatchObject({ code: "redirect" });
  });

  it("stops at the byte cap", async () => {
    await expect(safeRequest(`${base}/big`, { allowPrivateAddresses: true, maxBytes: 1000 })).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("readBodyWithLimit", () => {
  it("returns a body within the limit", async () => {
    const body = await readBodyWithLimit(new Response("hello"), 100);
    expect(body.toString()).toBe("hello");
  });
  it("aborts a streamed body that exceeds the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(400)); } });
    await expect(readBodyWithLimit(new Response(stream), 1000)).rejects.toMatchObject({ code: "too_large" });
  });
  it("rejects early on a declared content-length", async () => {
    await expect(readBodyWithLimit(new Response("x", { headers: { "content-length": "999999" } }), 10)).rejects.toMatchObject({ code: "too_large" });
  });
});
