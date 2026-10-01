/**
 * Бодит дэлгүүрийн схем рүү бичих ЁСГҮЙ скриптүүдийн хамгаалалт (2026-09-23).
 *
 * `.env`-ийн DATABASE_URL нь production (`defaultdb`) тул "тест/CI/туршилт"
 * скриптийг локал дээр санамсаргүй ажиллуулахад шууд амьд дэлгүүрт бичдэг
 * байв: CI-ийн migration гинж өгөгдлийн migration-уудыг дахин ажиллуулж
 * (бүх хэрэглэгчийг баталгаажсан болгох, нөөцийн дэвтрийг давхарлах…),
 * ci-seed нь давхар салбар (хоёр дахь `isFulfillmentDefault`) нэмэх,
 * verify-review-thread нь нийтэд харагдах хуурамч сэтгэгдэл, төлөгдсөн
 * захиалга үүсгэх. e2e/helpers/environment.ts-тэй ижил дүрэм.
 *
 * Ухамсартайгаар production дээр ажиллуулах шаардлага гарвал `--i-know-this-is-production`.
 */
import { decodedSchemaOf, PRODUCTION_SCHEMAS } from "../shared/dbUrl";

export function refuseProductionDatabase(scriptName: string, url = process.env.DATABASE_URL): void {
  if (!url || process.argv.includes("--i-know-this-is-production")) return;
  let schema: string;
  try {
    schema = decodedSchemaOf(url);
  } catch {
    // 2026-10-01: an unparseable URL used to be waved through ("can't tell, allow").
    // A SAFETY guard fails closed.
    console.error(`${scriptName}: DATABASE_URL задлагдсангүй — аюулгүй байдлын үүднээс скрипт ажиллахаас татгалзав.`);
    process.exit(2);
  }
  if (PRODUCTION_SCHEMAS.has(schema)) {
    console.error(`${scriptName}: DATABASE_URL нь "${schema}" (бодит дэлгүүр) руу заасан байна — энэ скрипт тест/CI/туршилтын схемд л ажиллана. ` +
      `sugi_staging эсвэл хоосон туршилтын схем рүү заа (жишээ: $env:DATABASE_URL=".../sugi_staging").`);
    process.exit(2);
  }
}
