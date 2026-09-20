// Хайлт v3 (2026-09-20): кодын синонимын бүлгүүд (shared/search-synonyms.ts
// DEFAULT_SYNONYM_GROUPS) ба брэндийн alias-уудыг (shared/brand-aliases.ts
// DEFAULT_BRAND_ALIASES) DB-ийн `search_synonyms` / `brand_aliases` хүснэгтэд
// оруулна. Idempotent: аль хэдийн байгаа concept/alias-ийг алгасна — admin-ий
// засварыг хэзээ ч дарахгүй. Migration 0087, 0088-ийн дараа нэг удаа, дараа нь
// кодын жагсаалтад шинэ бүлэг нэмсэн бүрт ажиллуулж болно.
//
//   pnpm exec tsx scripts/seed-search-dictionaries.ts
import "dotenv/config";
import { seedSearchDictionaries } from "../server/search/dictionaries";

(async () => {
  const result = await seedSearchDictionaries();
  console.log(`search_synonyms: ${result.synonymsInserted} шинэ мөр, brand_aliases: ${result.aliasesInserted} шинэ мөр.`);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
