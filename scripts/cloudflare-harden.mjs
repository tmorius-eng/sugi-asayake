// https://sugi.karkaron.com-ийн Cloudflare edge хамгаалалт (2026-09-13).
//
// Энэ репо биш Cloudflare талд байх бүхнийг idempotent хэрэгжүүлнэ: zone-ийн
// TLS/HTTPS тохиргоо, нэг rate-limit дүрэм, гурван WAF custom дүрэм, зөвхөн
// --access-тэй үед /admin-д эзний имэйлээр Zero Trust Access хаалга. Tom тэр
// өдөртөө захирал, тестлэгчид /admin-д орж аппын өөрийн хаалгыг (утас OTP + эрх +
// царай) туршихын тулд хаалгыг хассан; буцаах бол --access өгнө.
//
// https://dash.cloudflare.com/profile/api-tokens-оос үүсгэсэн API token хэрэгтэй
// (хэзээ ч commit хийхгүй), эрхүүд:
//   Account · Access: Apps and Policies · Edit
//   Account · Access: Organizations, Identity Providers, and Groups · Edit
//   Zone · Zone Settings · Edit      Zone · Zone WAF · Edit
//   Zone · Firewall Services · Edit  Zone · Cache Rules · Edit (2026-09-16-ийн кэшийн дүрэмд)
//   (Zone Resources: karkaron.com). Access-ийн 2 эрх зөвхөн --access-д хэрэгтэй.
// Bot Fight Mode энд БАЙХГҮЙ — "Bot Management: Edit" шаарддаг, token-д өгөөгүй;
// dashboard-аас (Security > Bots) асаана.
//
//   node scripts/cloudflare-harden.mjs <path-to-token-file> [--access]
//
// Хязгаарлагдсан API token-той өөрийн PowerShell-ээс ажиллуул (толгойг үзнэ).
import { readFileSync } from "node:fs";

const T = readFileSync(process.argv[2], "utf8").trim();
const withAccess = process.argv.includes("--access");
const A = "https://api.cloudflare.com/client/v4";
// Эзэн солих (2026-10-05): env-ээр дарна — шинэ эзний Cloudflare данс/домэйн/имэйл.
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || "2deded39a0bd5b415ae8a2d79e9ccdb7"; // одоогийн эзний данс
const ZONE = process.env.CLOUDFLARE_ZONE_ID || "a9d1a84c784531a8ba875c46faac12ca"; // karkaron.com
const HOST = process.env.SITE_HOST || "sugi.karkaron.com";
const OWNER = process.env.OWNER_EMAIL || "t.morius@gmail.com";

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

/**
 * 2026-09-23: phase-ийн entrypoint руу PUT хийх нь тэр phase-ийн БҮХ дүрмийг
 * солидог — dashboard-аас гараар нэмсэн дүрэм (жишээ нь uptime монитороор
 * /health-ийг чөлөөлөх) энэ скриптийг дахин ажиллуулахад чимээгүй устдаг байв.
 * Одоо байгаа дүрмүүдийг уншиж, ЭНЭ скриптийн удирддаг (description-оор
 * танигдах) дүрмүүдийг л солино; бусдыг нь ЭХЭНД нь хадгална (кэшийн "Never
 * cache" хаалт төгсгөлдөө үлдэнэ).
 */
const LEGACY_DESCRIPTIONS = ["Managed challenge for /admin from outside Mongolia/Japan (Access still required)"];
async function putPhaseRules(phase, ours) {
  const path = `/zones/${ZONE}/rulesets/phases/${phase}/entrypoint`;
  let existing;
  try { existing = (await cf("GET", path)).rules ?? []; } catch { existing = []; } // no entrypoint yet
  // Энэ скриптийн өмнөх хувилбаруудын өөр нэртэй дүрэм (2026-09-23 ажиллуулалтад
  // хуучин гео дүрэм шинэтэйгээ давхар үлдсэн) — тэднийг ч "өөрийнх" гэж солино.
  const managed = new Set([...ours.map(rule => rule.description), ...LEGACY_DESCRIPTIONS]);
  const kept = existing
    .filter(rule => !managed.has(rule.description))
    .map(({ id, description, expression, action, action_parameters, ratelimit, enabled, logging }) =>
      ({ id, description, expression, action, action_parameters, ratelimit, enabled, logging }));
  if (kept.length) console.log(`     ${phase}: keeping ${kept.length} rule(s) not managed here: ${kept.map(rule => rule.description).join(" | ")}`);
  return cf("PUT", path, { rules: [...kept, ...ours] });
}

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
const rl = await putPhaseRules("http_ratelimit", [
    {
      description: "API: max 150 req / 10s per IP, block 10s",
      expression: '(http.request.uri.path contains "/api/")',
      action: "block",
      ratelimit: { characteristics: ["ip.src", "cf.colo.id"], period: 10, requests_per_period: 150, mitigation_timeout: 10 },
    },
]);
ok(`rate limit rules = ${rl.rules.length}`);

// WAF custom rules (Free plan: up to 5) ------------------------------------
const waf = await putPhaseRules("http_request_firewall_custom", [
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
      // 2026-09-23: admin-ий API ч мөн (tRPC batch дотор `admin.*` байвал) — өмнө нь зөвхөн
      // /admin HTML хамгаалагдаж, хамгийн чухал API шууд нээлттэй байв.
      expression: '(starts_with(http.request.uri.path, "/admin") or (starts_with(http.request.uri.path, "/api/trpc/") and http.request.uri.path contains "admin.")) and not (ip.geoip.country in {"MN" "JP"})',
      action: "managed_challenge",
    },
]);
ok(`WAF custom rules = ${waf.rules.length}`);

// Cache rules (ачааллын бэлтгэл, 2026-09-16) --------------------------------
// Cloudflare анхдагчаараа зөвхөн ТӨРЛИЙН ӨРГӨТГӨЛӨӨР (.js/.css/.png/.woff2…)
// кэшилдэг. Тиймээс манай хамгийн үнэтэй, кэшлэгдэх ЁСТОЙ хариунууд нь өргөтгөлгүй
// эсвэл кэшлэгддэггүй өргөтгөлтэй тул бүгд origin руу тусдаа хүсэлт болж очдог байв:
//   • /og/product/<slug> — хуваалцах бүрт sharp-аар 1200×630 зураг зурдаг
//     (954 MB RAM-тай VM дээр хамгийн үнэтэй нь; Facebook/Messenger scraper
//     нэг бараанд олон удаа ирдэг). Origin аль хэдийн 7 хоногийн max-age өгдөг.
//   • /cdn/<key> — барааны зураг бүрийн 302 redirect. Нүүр хуудсанд хэдэн арван
//     зураг байдаг тул зочин бүр тэр бүрт нэг origin hop төлдөг. Түлхүүр нь
//     hash-тай (storageProxy.ts) тул "immutable" нь бодитоор үнэн.
//   • /sitemap.xml, /robots.txt, /feeds/google-merchant.xml — crawler-ийн
//     давтамжтай татдаг, origin дээр 10 мин / 1 цагийн TTL-тэй.
// "respect_origin" гэдэг нь TTL-ийн шийдвэр кодод (нэг эх сурвалж) үлдэнэ гэсэн үг.
const cache = await putPhaseRules("http_request_cache_settings", [
    {
      description: "Cache generated-but-cacheable origin responses (respect origin TTL)",
      expression:
        '(starts_with(http.request.uri.path, "/og/product/")) or (starts_with(http.request.uri.path, "/cdn/")) or (starts_with(http.request.uri.path, "/manus-storage/")) or (starts_with(http.request.uri.path, "/feeds/")) or (http.request.uri.path in {"/sitemap.xml" "/robots.txt" "/manifest.webmanifest"})',
      action: "set_cache_settings",
      action_parameters: { cache: true, edge_ttl: { mode: "respect_origin" }, browser_ttl: { mode: "respect_origin" } },
    },
    // Сүүлийн тохирсон дүрэм давамгайлдаг тул энэ нь жагсаалтын ТӨГСГӨЛД байна:
    // дээрх дүрэм хэзээ ч /api/ эсвэл /admin-д хүрэхгүй ч, хожим нэмэгдэх дүрэм
    // санамсаргүй хүрэхээс сэргийлсэн тогтмол хаалт.
    {
      description: "Never cache the API or the admin panel",
      expression: '(starts_with(http.request.uri.path, "/api/")) or (starts_with(http.request.uri.path, "/admin"))',
      action: "set_cache_settings",
      action_parameters: { cache: false },
    },
]);
ok(`cache rules = ${cache.rules.length}`);

// Optional Access gate on /admin -------------------------------------------
// Access matches paths by segment, so "/api/trpc/admin" alone did not cover
// tRPC's "/api/trpc/admin.users" (verified 2026-09-13) -- hence the wildcard.
if (withAccess) {
  const idps = await cf("GET", `/accounts/${ACCT}/access/identity_providers`);
  const otp = idps.find((i) => i.type === "onetimepin");
  if (!otp) throw new Error("No One-time PIN identity provider in Zero Trust; add it in the dashboard first");
  const name = "SUGI ASAYAKE /admin";
  const existing = (await cf("GET", `/accounts/${ACCT}/access/apps`)).find((a) => a.name === name);
  const wantedDomains = [`${HOST}/admin`, `${HOST}/api/trpc/admin*`, `${HOST}/api/trpc/inventory*`];
  const body = {
    name,
    type: "self_hosted",
    domain: `${HOST}/admin`,
    self_hosted_domains: wantedDomains,
    session_duration: "24h",
    allowed_idps: [otp.id],
    auto_redirect_to_identity: true,
    app_launcher_visible: false,
    http_only_cookie_attribute: true,
  };
  let app;
  if (!existing) {
    app = await cf("POST", `/accounts/${ACCT}/access/apps`, { ...body, policies: [{ name: "Owner", decision: "allow", include: [{ email: { email: OWNER } }] }] });
  } else if (wantedDomains.every((d) => (existing.self_hosted_domains ?? []).includes(d))) {
    app = existing;
  } else {
    // 2026-10-01: байгаа app-д шинэ зам (/api/trpc/inventory*) нэмэх — өмнө нь байгаа app-ыг огт
    // шинэчилдэггүй байсан тул замын жагсаалт хөгжихгүй байв. PUT нь бүтэн солих тул байгаа
    // бодлогуудыг (id + precedence) заавал дамжуулна — эс бөгөөс app бодлогогүй үлдэж Access
    // хүн бүрийг (Tom-ийг ч) хаана. Доор PUT-ийн дараа бодлого үлдсэнийг шалгана.
    const policies = (existing.policies ?? []).map((p, i) => ({ id: p.id, precedence: p.precedence ?? i + 1 }));
    if (!policies.length) throw new Error(`Access app "${name}" has no policies to preserve — refusing to PUT; fix it in the dashboard first`);
    app = await cf("PUT", `/accounts/${ACCT}/access/apps/${existing.id}`, { ...body, policies, self_hosted_domains: [...new Set([...(existing.self_hosted_domains ?? []), ...wantedDomains])] });
    const after = await cf("GET", `/accounts/${ACCT}/access/apps/${existing.id}`);
    if (!(after.policies ?? []).length) throw new Error(`Access app "${name}" lost its policies after PUT — re-add the Owner allow policy in Zero Trust NOW or /admin is locked for everyone`);
  }
  ok(`Access app "${app.name}" ${!existing ? "created" : app === existing ? "already up to date" : "updated"} (${app.self_hosted_domains.join(", ")})`);
} else {
  console.log("INFO Access gate on /admin not applied (pass --access to add it)");
}

// Live check ---------------------------------------------------------------
for (const p of ["/", "/admin", "/api/trpc/catalog.bestsellers?input=%7B%7D", "/wp-login.php"]) {
  const r = await fetch(`https://${HOST}${p}`, { redirect: "manual" });
  console.log(`TEST ${p.padEnd(45)} -> ${r.status}${r.status === 302 ? " (Access)" : ""}`);
}
// Кэшийн дүрэм бодитоор ажиллаж байгаа эсэх: эхний хүсэлт MISS, хоёр дахь нь HIT
// байх ёстой (DYNAMIC гарвал дүрэм тухайн зам дээр хүрээгүй гэсэн үг).
for (const p of ["/sitemap.xml", "/robots.txt"]) {
  const statuses = [];
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`https://${HOST}${p}`, { redirect: "manual", headers: { "cache-control": "no-transform" } });
    statuses.push(r.headers.get("cf-cache-status") ?? "-");
  }
  console.log(`TEST ${p.padEnd(45)} -> cf-cache-status ${statuses.join(" then ")}`);
}
console.log("DONE");
