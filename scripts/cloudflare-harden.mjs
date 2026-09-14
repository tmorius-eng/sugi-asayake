// Cloudflare edge hardening for https://sugi.karkaron.com (2026-09-13).
//
// Applies, idempotently, everything that lives on Cloudflare's side rather
// than in this repo: zone TLS/HTTPS settings, one rate-limit rule, three WAF
// custom rules, and -- only with --access -- a Zero Trust Access gate on
// /admin for the owner's email. Tom removed that gate the same day so the
// director and testers can reach /admin and exercise the app's own gate
// (phone OTP + role + face); pass --access to put it back.
//
// Needs an API token (never commit it) created at
// https://dash.cloudflare.com/profile/api-tokens with:
//   Account · Access: Apps and Policies · Edit
//   Account · Access: Organizations, Identity Providers, and Groups · Edit
//   Zone · Zone Settings · Edit      Zone · Zone WAF · Edit
//   Zone · Firewall Services · Edit  (Zone Resources: karkaron.com)
// Bot Fight Mode is NOT here -- it needs "Bot Management: Edit", which we
// left off the token; toggle it in the dashboard (Security > Bots).
//
//   node scripts/cloudflare-harden.mjs <path-to-token-file> [--access]
//
// Run from your own PowerShell with a scoped API token (see the header).
import { readFileSync } from "node:fs";

const T = readFileSync(process.argv[2], "utf8").trim();
const withAccess = process.argv.includes("--access");
const A = "https://api.cloudflare.com/client/v4";
const ACCT = "2deded39a0bd5b415ae8a2d79e9ccdb7"; // T.morius@gmail.com's account
const ZONE = "a9d1a84c784531a8ba875c46faac12ca"; // karkaron.com
const HOST = "sugi.karkaron.com";
const OWNER = "t.morius@gmail.com";

async function cf(method, path, body) {
  const r = await fetch(A + path, {
    method,
    headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${method} ${path} -> ${JSON.stringify(j.errors)}`);
  return j.result;
}
const ok = (m) => console.log("OK  ", m);

// Zone settings ------------------------------------------------------------
for (const [k, value] of [
  ["always_use_https", "on"],
  ["min_tls_version", "1.2"],
  ["tls_1_3", "on"],
  ["ssl", "strict"],
  ["security_level", "medium"],
  ["browser_check", "on"],
  ["automatic_https_rewrites", "on"],
  ["opportunistic_encryption", "on"],
]) {
  const r = await cf("PATCH", `/zones/${ZONE}/settings/${k}`, { value });
  ok(`setting ${k} = ${r.value}`);
}

// Rate limiting (Free plan: one rule, 10 s window, must count by cf.colo.id)
// 150 req / 10 s per IP is well above a real browser (the home page is ~11
// batched tRPC calls) but still caps a single-IP flood before it reaches the
// app's own limiters. An office NAT shares one IP -- raise this if it bites.
const rl = await cf("PUT", `/zones/${ZONE}/rulesets/phases/http_ratelimit/entrypoint`, {
  rules: [
    {
      description: "API: max 150 req / 10s per IP, block 10s",
      expression: '(http.request.uri.path contains "/api/")',
      action: "block",
      ratelimit: { characteristics: ["ip.src", "cf.colo.id"], period: 10, requests_per_period: 150, mitigation_timeout: 10 },
    },
  ],
});
ok(`rate limit rules = ${rl.rules.length}`);

// WAF custom rules (Free plan: up to 5) ------------------------------------
const waf = await cf("PUT", `/zones/${ZONE}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
  rules: [
    {
      description: "Block scanner probes (no PHP/WordPress/dotfiles here)",
      expression:
        '(http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "wp-login") or (http.request.uri.path contains "wp-admin") or (http.request.uri.path contains "xmlrpc.php") or (http.request.uri.path contains "phpmyadmin") or (ends_with(http.request.uri.path, ".php")) or (http.request.uri.path contains "/.aws") or (http.request.uri.path contains "/.ssh")',
      action: "block",
    },
    {
      description: "Block unexpected HTTP methods",
      expression: 'not (http.request.method in {"GET" "POST" "HEAD" "OPTIONS" "PUT" "PATCH" "DELETE"})',
      action: "block",
    },
    {
      description: "Managed challenge for /admin from outside Mongolia/Japan",
      expression: '(starts_with(http.request.uri.path, "/admin")) and not (ip.geoip.country in {"MN" "JP"})',
      action: "managed_challenge",
    },
  ],
});
ok(`WAF custom rules = ${waf.rules.length}`);

// Optional Access gate on /admin -------------------------------------------
// Access matches paths by segment, so "/api/trpc/admin" alone did not cover
// tRPC's "/api/trpc/admin.users" (verified 2026-09-13) -- hence the wildcard.
if (withAccess) {
  const idps = await cf("GET", `/accounts/${ACCT}/access/identity_providers`);
  const otp = idps.find((i) => i.type === "onetimepin");
  if (!otp) throw new Error("No One-time PIN identity provider in Zero Trust; add it in the dashboard first");
  const name = "SUGI ASAYAKE /admin";
  const existing = (await cf("GET", `/accounts/${ACCT}/access/apps`)).find((a) => a.name === name);
  const app =
    existing ??
    (await cf("POST", `/accounts/${ACCT}/access/apps`, {
      name,
      type: "self_hosted",
      domain: `${HOST}/admin`,
      self_hosted_domains: [`${HOST}/admin`, `${HOST}/api/trpc/admin*`],
      session_duration: "24h",
      allowed_idps: [otp.id],
      auto_redirect_to_identity: true,
      app_launcher_visible: false,
      http_only_cookie_attribute: true,
      policies: [{ name: "Owner", decision: "allow", include: [{ email: { email: OWNER } }] }],
    }));
  ok(`Access app "${app.name}" ${existing ? "already existed" : "created"} (${app.self_hosted_domains.join(", ")})`);
} else {
  console.log("INFO Access gate on /admin not applied (pass --access to add it)");
}

// Live check ---------------------------------------------------------------
for (const p of ["/", "/admin", "/api/trpc/catalog.bestsellers?input=%7B%7D", "/wp-login.php"]) {
  const r = await fetch(`https://${HOST}${p}`, { redirect: "manual" });
  console.log(`TEST ${p.padEnd(45)} -> ${r.status}${r.status === 302 ? " (Access)" : ""}`);
}
console.log("DONE");
