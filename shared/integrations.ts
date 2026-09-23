/**
 * Admin-ийн удирддаг гуравдагч талын интеграцуудын нэг жагсаалт (2026-09-11).
 *
 * Энэ файлаас өмнө провайдерийн жагсаалт таван газар гараар хуулагдсан (drizzle
 * enum, db.ts, router-ийн zod enum, admin панелд хоёр удаа) бөгөөд провайдер бүрийн
 * тохиргоо ямар түлхүүр хэрэгтэйгээ мэдэхгүй чөлөөт key/value editor байв. Одоо
 * schema enum, серверийн шалгалт, admin форм бүгд доорх тодорхойлолтыг уншина.
 *
 * Өнөөдөр гурав нь runtime кодтой холбогдсон: ntfy (server/_core/ntfy.ts), Smart
 * Software (server/integrations/smartSoftware.ts), StorePay (server/storepay.ts).
 * Бусад нь бизнесийн шийдвэр хүлээгдэж байхад зөвхөн credential бүртгэнэ; `wiredUp:
 * false` нь "Идэвхтэй" toggle амьд интеграц мэт харагдуулахын оронд admin дэлгэцэд
 * тэгж хэлүүлнэ.
 */

export const INTEGRATION_PROVIDERS = ["ebarimt", "storepay", "card_golomt", "courier_ebuuhia", "ntfy", "smartsoftware"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/**
 * `secret` values are write-only: the server reports only whether they are
 * set. `topic` is an ntfy topic name -- on a public ntfy server the topic IS
 * the password (anyone who knows it can read it), so it is treated like a
 * secret here and only shown back to members of its own group (see
 * notifications.mySubscriptions). `url`/`text` are ordinary settings and are
 * shown back in the form.
 */
export type IntegrationFieldKind = "text" | "url" | "secret" | "topic";

export type IntegrationField = {
  key: string;
  label: string;
  kind: IntegrationFieldKind;
  help?: string;
  /** Used when the field is unset. Shown as the input's placeholder. */
  defaultValue?: string;
};

/**
 * A provider's visual identity in /admin (2026-09-15). Both are STRING KEYS,
 * never a colour literal and never a React component: this module is imported
 * by server/db.ts, so a lucide import here would pull React into the server
 * bundle, and a hex would skip the admin's dark-mode tokens.
 */
export type IntegrationAccent = "amber" | "blue" | "green" | "violet" | "slate";
export type IntegrationIcon = "receipt" | "wallet" | "card" | "truck" | "phone" | "store";

/**
 * The "not connected yet" hero card. A provider that declares this gets a
 * single centred sign-in card (logo tile, title, the required fields, one
 * primary button) instead of the generic key-by-key editor, which is the
 * right shape for the one thing an admin does here first: connect it.
 * Everything else about the provider stays exactly as it is -- this only
 * changes what the card shows while `requiredFields` are still unset.
 */
export type IntegrationConnect = {
  title: string;
  subtitle: string;
  /** Every one must be set before the provider counts as connected. */
  requiredFields: readonly string[];
  cta: string;
  footnote: string;
};

export type IntegrationMeta = {
  label: string;
  note: string;
  /** True only once real runtime code reads this provider's settings. */
  wiredUp: boolean;
  guidance?: string;
  fields: readonly IntegrationField[];
  /** Also accept keys not listed in `fields` (vendors with unknown APIs). */
  freeForm: boolean;
  /** Whether the admin screen offers a "send a test" button. */
  testable: boolean;
  accent?: IntegrationAccent;
  icon?: IntegrationIcon;
  connect?: IntegrationConnect;
};

/** ntfy topic names: letters, digits, `_` and `-`, at most 64 characters. */
export const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const NTFY_DEFAULT_SERVER_URL = "https://ntfy.sh";
/** From developer.smartsoftware.mn (2026-09-12): the Inventory/Retail/Loyalty
 *  family and the Smart POS family live on different hosts. */
export const SMART_SOFTWARE_DEFAULT_INVENTORY_URL = "https://retailapiv2.smartlogic.mn";
export const SMART_SOFTWARE_DEFAULT_POS_URL = "https://smartposapi.smartapp.mn";

export const INTEGRATION_META: Record<IntegrationProvider, IntegrationMeta> = {
  // CORRECTION (2026-09-12): a note here used to say developer.smartsoftware.mn
  // carried "zero API docs". That was wrong, and it cost two sessions --
  // the site is an Apidog app that renders with JavaScript, so it looks
  // empty to curl and to a plain page fetch. Its real content is at
  // /llms.txt with every page fetchable as /api-<id>.md, and it documents a
  // full REST API (see server/integrations/smartSoftware.ts).
  //
  // What still holds: Mongolia's POS API 3.0, which every ebarimt vendor is
  // built on, needs a "PosService" running on the merchant's OWN network
  // (127.0.0.1:7080) -- three independent client libraries confirm it, most
  // recently github.com/hurelhuyag/ebarimt and PyPI's ebarimt-pos-sdk. Our
  // Aiven-hosted server cannot dial that. But Smart POS's own
  // /api/sale/sale returns the tax receipt (ДДТД, QR, lottery) for a sale we
  // send it, and QPay can issue one for what it collects -- so there are two
  // cloud paths that do not need a machine in the shop. No credentials
  // belong in this card for either; see EBARIMT.md for which questions are
  // left (they are for the accountant, not the vendor).
  ebarimt: {
    label: "И-баримт",
    accent: "violet" as const,
    icon: "receipt" as const,
    note: "Татварын албаны цахим баримт (SmartSoftware эсвэл POS API 3.0)",
    wiredUp: false,
    guidance: "2026-09-12: гурван зам тодорхой боллоо. (A) Smart POS-ын /api/sale/sale нь борлуулалт илгээхэд И-БАРИМТЫГ ӨӨРӨӨ гаргаж ДДТД/QR/сугалааг буцаадаг -- энэ тохиолдолд ЭНД юу ч оруулах шаардлагагүй, зөвхөн Smart Software картыг тохируулна. (B) Татварын албаны POS API 3.0 -- дэлгүүрийн өөрийн машин дээр PosService (127.0.0.1:7080) ажиллуулахыг шаарддаг тул манай cloud серверээс дуудагдахгүй. (C) QPay-ээр төлсөн захиалгад QPay өөрөө и-баримт гаргаж чадна. Аль замыг сонгохоос өмнө EBARIMT.md-ийн нягтлангийн 2 асуултад (НӨАТ/НХАТ, иргэн vs байгууллагын баримт) хариу хэрэгтэй.",
    fields: [],
    freeForm: true,
    testable: false,
  },
  // 2026-09-12: read by server/storepay.ts. StorePay issue TWO credential
  // pairs -- an app pair that signs the password grant and a Basic-auth pair
  // -- plus the store id; their own Go SDK takes exactly these seven values.
  storepay: {
    label: "StorePay",
    accent: "green" as const,
    icon: "wallet" as const,
    note: "Хэсэгчилсэн төлбөр (BNPL) — харилцагч StorePay апп дээрээ зөвшөөрнө",
    wiredUp: true,
    guidance: "StorePay-ээс мерчантын мэдээлэл авахдаа ХОЁР хос нэр/нууц үг (апп-ын болон үндсэн), дэлгүүрийн код (storeId), мөн auth/api хаягийг асууна. Долоо нь бүгд бөглөгдөж, \"Идэвхтэй\" болсон үед л худалдан авагчид төлбөрийн сонголт болж харагдана. Захиалгын дүнг StorePay руу илгээхэд харилцагч апп дээрээ зөвшөөрч, бид зөвшөөрснийг нь өөрсдөө шалгаад захиалгыг баталгаажуулна.",
    fields: [
      { key: "authUrl", label: "Auth хаяг", kind: "url", help: "Token авах сервер (StorePay өгнө)." },
      { key: "baseUrl", label: "API хаяг", kind: "url", help: "/merchant/loan, /user/possibleAmount дуудагдах сервер." },
      { key: "appUsername", label: "Апп-ын нэвтрэх нэр", kind: "text" },
      { key: "appPassword", label: "Апп-ын нууц үг", kind: "secret" },
      { key: "username", label: "Үндсэн нэвтрэх нэр", kind: "text" },
      { key: "password", label: "Үндсэн нууц үг", kind: "secret" },
      { key: "storeId", label: "Дэлгүүрийн код (storeId)", kind: "text" },
    ],
    freeForm: false,
    testable: false,
  },
  card_golomt: { accent: "slate", icon: "card", label: "Голомт банк (карт)", note: "Visa/Mastercard шууд төлбөр (e-Merchant)", wiredUp: false, guidance: "Кодыг бичихийн өмнө Голомтоос дараахыг авна: e-Merchant гэрээ, мерчант ID, нууц түлхүүр, туршилтын (sandbox) орчны хаяг, төлбөр амжилттай болоход манай сервер рүү мэдэгдэх callback-ийн бүтэц. Эдгээр ирмэгц QPay/StorePay-тэй ижил хэлбэрээр (claim → callback → бид өөрсдөө шалгах) хийгдэнэ.", fields: [], freeForm: true, testable: false },
  courier_ebuuhia: { accent: "slate", icon: "truck", label: "eBuuhia хүргэлт", note: "Эльчийн хүргэлтийн үйлчилгээ", wiredUp: false, guidance: "Хүргэлтийн компаниас авах зүйлс: гэрээ, API түлхүүр, захиалга үүсгэх endpoint, хүргэлтийн төлөв мэдэгдэх webhook, дүүрэг тус бүрийн тариф. Тариф ирвэл shared/delivery.ts дэх одоогийн нэг үнийн дүрмийг дүүргээр өргөтгөнө.", fields: [], freeForm: true, testable: false },
  ntfy: {
    label: "Утасны мэдэгдэл (ntfy)",
    accent: "blue" as const,
    icon: "phone" as const,
    note: "Захиалга, төлбөр, нөөцийн мэдэгдлийг ажилтнуудын утас руу push-ээр илгээнэ",
    wiredUp: true,
    guidance: "Бүлэг бүрт \"Сэдэв үүсгэх\" дарж санамсаргүй нууц нэр үүсгэнэ. Ажилтнууд \"Утасны мэдэгдэл\" хэсгээс өөрийн бүлгийн QR кодыг ntfy апп-аар уншуулж бүртгүүлнэ. Сэдвийн нэрийг мэддэг хүн бүр мессежийг уншиж чадах тул мессежид харилцагчийн нэр, утас, хаяг хэзээ ч ордоггүй. Ажилтан гарвал тухайн бүлгийн сэдвийг дахин үүсгэнэ.",
    fields: [
      { key: "serverUrl", label: "Серверийн хаяг", kind: "url", defaultValue: NTFY_DEFAULT_SERVER_URL, help: "Хоосон бол ntfy.sh. Өөрийн сервер эсвэл ntfy Pro руу шилжихэд л солино." },
      { key: "accessToken", label: "Access token", kind: "secret", help: "Заавал биш. ntfy Pro-ийн нөөцөлсөн сэдэв эсвэл өөрийн сервер ашиглавал (tk_...)." },
      { key: "topicAdmin", label: "Удирдлагын сэдэв", kind: "topic" },
      { key: "topicWarehouse", label: "Агуулахын сэдэв", kind: "topic" },
      { key: "topicFinance", label: "Санхүүгийн сэдэв", kind: "topic" },
      { key: "topicStore", label: "Дэлгүүрийн зөвлөхүүдийн сэдэв", kind: "topic" },
      { key: "disabledEvents", label: "Унтраасан мэдэгдлүүд", kind: "text", help: "Таслалаар тусгаарласан үйл явдлын код (жишээ: stock.low_digest). Хоосон бол бүгд идэвхтэй." },
    ],
    freeForm: false,
    testable: true,
  },
  // The shop's POS vendor (2026-09-12): read by server/integrations/
  // smartSoftware.ts. Their API is OAuth2 password grant -- a username and a
  // password issued after the API contract, not an API key -- against the
  // hosts below (from developer.smartsoftware.mn). Products are matched by
  // barcode; each store's location code is mapped on the same card.
  smartsoftware: {
    label: "Smart Software (Smart POS)",
    accent: "amber" as const,
    icon: "store" as const,
    note: "Дэлгүүрийн касс -- байршил бүрийн нөөцийг татаж, батлах тооллого болгоно",
    wiredUp: true,
    guidance: "Смарт Ложик ХХК-тай API холболтын гэрээ хийсний дараа имэйлээр ирэх НЭВТРЭХ НЭР, НУУЦ ҮГ-ийг энд оруулна (API түлхүүр биш). Дараа нь \"Холболт шалгах\" дарж байршлуудыг татаад, дэлгүүр бүрийн Smart POS байршлыг доор сонгоно. 15 минут тутам (эсвэл \"Одоо синк\" дарахад) байршил бүрийн үлдэгдэл татагдаж, зөрүүтэй бараа нь Бараа хүлээн авах → Тооллого хэсэгт БАТЛАХ хүлээсэн тооллого болно -- нөөц хэзээ ч шууд дарж бичигдэхгүй. Бараа баркодоор таардаг тул Smart POS дахь баркод манай SKU-тэй ижил байх ёстой.",
    fields: [
      { key: "username", label: "Нэвтрэх нэр", kind: "text", help: "Смарт Ложикоос олгосон API хэрэглэгчийн нэр." },
      { key: "password", label: "Нууц үг", kind: "secret" },
      { key: "inventoryBaseUrl", label: "Inventory API хаяг", kind: "url", defaultValue: SMART_SOFTWARE_DEFAULT_INVENTORY_URL, help: "Хоосон бол баримтад заасан хаяг. Смарт Ложик өөр сервер өгсөн үед л солино." },
      { key: "posBaseUrl", label: "POS API хаяг", kind: "url", defaultValue: SMART_SOFTWARE_DEFAULT_POS_URL, help: "Борлуулалт илгээх (и-баримт) ирээдүйн алхамд зориулсан; одоогоор уншдаггүй." },
    ],
    freeForm: false,
    testable: true,
    connect: {
      title: "Smart Logic",
      subtitle: "ERP интеграци — бараа, үлдэгдэл, үнэ",
      requiredFields: ["username", "password"],
      cta: "Холбох",
      footnote: "Смарт Ложик ХХК-тай API холболтын гэрээ хийсний дараа имэйлээр ирэх нэвтрэх мэдээллээ оруулна уу.",
    },
  },
};

export const isIntegrationProvider = (value: string): value is IntegrationProvider => (INTEGRATION_PROVIDERS as readonly string[]).includes(value);

export function getIntegrationField(provider: IntegrationProvider, key: string): IntegrationField | undefined {
  return INTEGRATION_META[provider].fields.find(field => field.key === key);
}

/** Setting keys: short identifiers only, so a typo cannot smuggle markup or
 *  whitespace into a key that later ends up in a log line or a form label. */
const SETTING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

/** Providers whose base URLs the server calls and which live on the public
 *  internet by definition. */
const CLOUD_VENDOR_PROVIDERS = new Set<IntegrationProvider>(["smartsoftware", "storepay"]);

/** Loopback, link-local, RFC 1918, cloud-metadata and bare-IP hosts. A static
 *  check (no DNS): it stops the obvious mistakes and the obvious attack, and
 *  the vendors in question are only ever reached by public hostname. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  // 2026-09-23: IPv6-ийн шалгалтыг ЗӨВХӨН IPv6 хаяг дээр. `fc00::/7` (ULA)
  // шалгалт нь `startsWith("fc")`/`("fd")` байсан тул `fcstore.com`,
  // `fdx.mn` зэрэг НИЙТИЙН домэйнийг "дотоод сүлжээ" гэж татгалзаж, админ
  // тийм хостоор ирсэн API хаягийг хадгалж чаддаггүй байв.
  if (host === "::1") return true;
  if (host.includes(":") && (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return !host.includes(".");
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Validates the keys and values an admin is about to SAVE (not the whole
 * stored config -- a value saved under older rules is never retro-rejected).
 * Returns a Mongolian error message, or null when everything is acceptable.
 * Shared so the admin form can show the same message before the round trip.
 */
export function validateIntegrationSettings(provider: IntegrationProvider, settings: Record<string, string>): string | null {
  const meta = INTEGRATION_META[provider];
  for (const [key, rawValue] of Object.entries(settings)) {
    if (!SETTING_KEY_PATTERN.test(key)) return `"${key}" гэсэн түлхүүрийн нэр буруу байна (латин үсэг, тоо, _ л болно).`;
    const field = getIntegrationField(provider, key);
    if (!field) {
      if (!meta.freeForm) return `${meta.label}-д "${key}" гэсэн тохиргоо байхгүй.`;
      continue;
    }
    const value = rawValue.trim();
    if (!value) continue; // an empty value means "clear this setting"
    if (field.kind === "url") {
      let parsed: URL;
      try { parsed = new URL(value); } catch { return `${field.label}: зөв хаяг биш байна.`; }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return `${field.label}: http(s):// хаяг байх ёстой.`;
      // The server itself dials these. For a cloud vendor that must be a public
      // https host: an admin-typed address pointing at localhost, the LAN or a
      // cloud metadata endpoint would turn the vendor adapter into a way to
      // read this server's own network (SSRF). ntfy is exempt on purpose -- a
      // self-hosted ntfy on the shop's LAN over http is a supported setup.
      if (CLOUD_VENDOR_PROVIDERS.has(provider)) {
        if (parsed.protocol !== "https:") return `${field.label}: зөвхөн https:// хаяг зөвшөөрнө.`;
        if (isPrivateHost(parsed.hostname)) return `${field.label}: дотоод сүлжээний хаяг зөвшөөрөгдөхгүй.`;
      }
    }
    if (field.kind === "topic" && !NTFY_TOPIC_PATTERN.test(value)) return `${field.label}: зөвхөн латин үсэг, тоо, "_" болон "-" (64 хүртэл тэмдэгт).`;
    if (field.kind === "topic" && value.length < 16) return `${field.label}: хэт богино байна -- таамаглахад хэцүү байхын тулд 16-аас дээш тэмдэгт хэрэгтэй ("Сэдэв үүсгэх" товчийг ашиглана уу).`;
  }
  return null;
}

/**
 * Merge semantics for saving (2026-09-11 fix). The old editor REPLACED the
 * whole stored config with whatever keys were typed in, so adding one key
 * silently deleted every other one. Now: `set` adds or overwrites keys (an
 * empty value clears that key), `clearKeys` removes keys, everything else is
 * kept as it was.
 */
export function mergeIntegrationSettings(existing: Record<string, string>, set: Record<string, string> | undefined, clearKeys: readonly string[] | undefined): Record<string, string> {
  const merged: Record<string, string> = { ...existing };
  for (const [key, value] of Object.entries(set ?? {})) {
    const trimmed = value.trim();
    if (trimmed) merged[key] = trimmed; else delete merged[key];
  }
  for (const key of clearKeys ?? []) delete merged[key];
  return merged;
}
