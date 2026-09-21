import "dotenv/config";

/**
 * E2E аль өгөгдлийн сан руу бичихийг шийддэг цорын ганц газар.
 *
 * Дүрэм: E2E нь бодит дэлгүүрийн схем (`defaultdb`) рүү ХЭЗЭЭ Ч бичихгүй. Тест
 * сагс дүүргэж, хэрэглэгч үүсгэж, admin-аар өөрчилдөг — 2026-09-12-ны
 * цэвэрлэгээ (docs/HISTORY.md, "Амьд DB дээрх тестийн үлдэгдэл") яг ийм
 * зүйлээс үүссэн: бодит борлуулалтад тоологдож байсан тестийн захиалга,
 * admin эрхтэй тестийн хэрэглэгч.
 *
 * Анхдагч зорилт нь нэг ижил HeatWave дээрх `sugi_staging` (prod-ын
 * 2026-09-21-ний хуулбар — `scripts/db-restore.ps1 … -Force`-оор шинэчилнэ). `E2E_DATABASE_URL`-ээр бүрэн дарж болно.
 */
const FORBIDDEN_SCHEMAS = new Set(["defaultdb", "mysql", "sys"]);
const DEFAULT_E2E_SCHEMA = "sugi_staging";

export function e2eDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  const source = explicit ?? process.env.DATABASE_URL;
  if (!source) throw new Error("E2E-д DATABASE_URL (эсвэл E2E_DATABASE_URL) шаардлагатай.");

  const url = new URL(source);
  if (!explicit) url.pathname = `/${DEFAULT_E2E_SCHEMA}`;

  const schema = url.pathname.replace(/^\//, "");
  if (!schema || FORBIDDEN_SCHEMAS.has(schema)) {
    throw new Error(
      `E2E "${schema}" схем рүү заасан байна. Энэ нь бодит дэлгүүрийн өгөгдөл — тест захиалга, хэрэглэгч үүсгэдэг тул зөвшөөрөхгүй. ` +
        `E2E_DATABASE_URL-ээ ${DEFAULT_E2E_SCHEMA} (эсвэл өөр туршилтын схем) рүү заа.`
    );
  }
  return url.toString();
}

/** Тестийн үүсгэсэн мөрийг дараа нь таних тэмдэг. `test-residue-report.ts`
 *  зөвхөн `%test%`-ээр хайдаггүй (каталогт жинхэнэ "tester" бараа бий) тул
 *  энэ тэмдэг нь өвөрмөц. */
export const E2E_MARKER = "e2e-sugi";

export function e2eEmail(label: string): string {
  return `${E2E_MARKER}-${label}-${Date.now().toString(36)}@example.invalid`;
}
