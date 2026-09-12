/**
 * The one list of admin-managed third-party integrations (2026-09-11).
 *
 * Before this file the provider list was hand-copied in five places (the
 * drizzle enum, db.ts, the router's zod enum, and twice in the admin panel),
 * and each provider's settings were a free-form key/value editor with no idea
 * which keys it needed. Now the schema enum, the server's validation and the
 * admin form all read the definitions below.
 *
 * Only ntfy is actually wired to runtime code today (see server/_core/ntfy.ts
 * and server/notifications.ts). The other five record credentials for
 * integrations whose business side is still open; `wiredUp: false` makes the
 * admin screen say so instead of letting an "Идэвхтэй" toggle look like a
 * live integration.
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
};

/** ntfy topic names: letters, digits, `_` and `-`, at most 64 characters. */
export const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const NTFY_DEFAULT_SERVER_URL = "https://ntfy.sh";
/** From developer.smartsoftware.mn (2026-09-12): the Inventory/Retail/Loyalty
 *  family and the Smart POS family live on different hosts. */
export const SMART_SOFTWARE_DEFAULT_INVENTORY_URL = "https://retailapiv2.smartlogic.mn";
export const SMART_SOFTWARE_DEFAULT_POS_URL = "https://smartposapi.smartapp.mn";

export const INTEGRATION_META: Record<IntegrationProvider, IntegrationMeta> = {
  // 2026-09-04: read the developer.smartsoftware.mn page Tom pointed at --
  // it's a marketing/company-overview page with zero API/webhook docs, not
  // a technical integration guide. Separately confirmed (3 independent
  // open-source ebarimt client libraries, incl. a Node.js one) that
  // Mongolia's underlying POS API 3.0 -- which every ebarimt POS vendor,
  // SmartSoftware included, is built on -- requires a "PosService" process
  // running LOCALLY on the merchant's own network (e.g. 127.0.0.1:7080),
  // registered with an 8-digit POS number, not a plain cloud REST call our
  // Aiven-hosted server could dial from anywhere. Writing server/ebarimt.ts
  // against a guessed cloud shape would risk shipping something that looks
  // configured but can never actually reach the tax system -- see
  // EBARIMT.md's open questions for exactly what to ask SmartSoftware
  // support before any code here can be real.
  ebarimt: {
    label: "И-баримт",
    note: "Татварын албаны цахим баримт (SmartSoftware эсвэл POS API 3.0)",
    wiredUp: false,
    guidance: "developer.smartsoftware.mn-д техникийн API баримт бичиг байхгүй байсныг баталгаажуулсан. EBARIMT.md-д SmartSoftware-аас тодруулах асуултууд бэлэн байгаа -- ялангуяа: манай сервер таны PosService-тэй нэг сүлжээнд байх ёстой юу, эсвэл хаанаас ч дуудаж болох cloud endpoint байгаа юу? Хариу ирмэгц энд бодит талбарууд (жишээ нь posServiceUrl/posNumber) нэмэгдэнэ.",
    fields: [],
    freeForm: true,
    testable: false,
  },
  // 2026-09-12: read by server/storepay.ts. StorePay issue TWO credential
  // pairs -- an app pair that signs the password grant and a Basic-auth pair
  // -- plus the store id; their own Go SDK takes exactly these seven values.
  storepay: {
    label: "StorePay",
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
  card_golomt: { label: "Голомт банк (карт)", note: "Visa/Mastercard шууд төлбөр (e-Merchant)", wiredUp: false, fields: [], freeForm: true, testable: false },
  courier_ebuuhia: { label: "eBuuhia хүргэлт", note: "Эльчийн хүргэлтийн үйлчилгээ", wiredUp: false, fields: [], freeForm: true, testable: false },
  ntfy: {
    label: "Утасны мэдэгдэл (ntfy)",
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
  },
};

export const isIntegrationProvider = (value: string): value is IntegrationProvider => (INTEGRATION_PROVIDERS as readonly string[]).includes(value);

export function getIntegrationField(provider: IntegrationProvider, key: string): IntegrationField | undefined {
  return INTEGRATION_META[provider].fields.find(field => field.key === key);
}

/** Setting keys: short identifiers only, so a typo cannot smuggle markup or
 *  whitespace into a key that later ends up in a log line or a form label. */
const SETTING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

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
