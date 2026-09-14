// Preference Profile v2 (2026-09-01) bulk auto-tag. Амьд каталогийг бодитоор
// уншихад 937-оос ердөө 4 бараа personalization tag-тай байсан тул санал болгох
// хөдөлгүүрт (server/db.ts getRecommendedProducts) оноо өгөх зүйл бараг байсангүй.
// Бараа бүрт дарааллаар ажиллах 2 шат:
//
//   1-р шат — admin панелийн бараа бүрийн санал chip-ийн ашигладаг ижил дүрэмд
//   суурилсан keyword matcher (shared/product-tagging.ts suggestTagsForProduct):
//   барааны өөрийн нэр/тайлбарт олдсон бодит дохио, ангиллаар хаалттай тул
//   холилдохгүй (арьсны үг үсний барааг tag хийхгүй).
//
//   2-р шат — 1-р шатны дараа tag-гүй үлдсэн бараанд бүдүүвч АНГИЛЛЫН анхдагч утга
//   (tag-гүй арьс арчилгааны бараанд skinType: "normal", үсний бараанд hairType:
//   "normal"). 2026-09-01-ний амьд QA-ийн дараа нэмэгдсэн: зөвхөн 1-р шатаар
//   "Үс ба бие" мэт ангилалд бодит хамрах хүрээ 0%-тай ойр тул "Хуурай үс" сонгосон
//   худалдан авагчид таарах бараа огт байсангүй — доогуур эрэмбэлэгдсэн биш, ОГТ
//   БАЙХГҮЙ. 2-р шат нь нийтлэгдсэн бараа бүр дор хаяж нэг таарах дохиотой байлгахын
//   тулд. Санаатайгаар suggestTagsForProduct-ийн хэсэг БИШ тул admin-ийн санал chip
//   болж хэзээ ч гарахгүй — chip нь "текстэд бодит дохио олдсон" гэсэн утгатай,
//   ангиллын анхдагч утга тийм биш; 2-р шат зөвхөн энд, bulk pass-д л ажиллана.
//
// Хоёр шат хоёулаа admin аль хэдийн тавьсан талбарыг ХЭЗЭЭ Ч дарж бичихгүй
// (бичилт бүр тухайн баганад isNull-аар хамгаалагдсан).
//
// Хэзээ ч дахин ажиллуулахад аюулгүй. Анхдагчаар DRY RUN (ангилал бүрийн хамрах
// хүрээний тайлан хэвлэнэ, юу ч бичихгүй) — Tom-ийн шууд шийдвэрээр (2026-09-01)
// бодитоор ажиллуулахаас өмнө заавал хянана.
//
// Хэрэглээ:
//   pnpm exec tsx scripts/auto-tag-products.ts             # dry run (анхдагч)
//   pnpm exec tsx scripts/auto-tag-products.ts --apply      # бодитоор бичнэ
//
// Бодит DB дээр --apply хийхээсээ өмнө шинэ backup ав: powershell scripts/db-backup.ps1
import "dotenv/config";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../server/db";
import { products, productCategories } from "../drizzle/schema";
import { suggestTagsForProduct, type SuggestedTags } from "../shared/product-tagging";

const APPLY = process.argv.includes("--apply");

type Tally = { total: number; taggedBefore: number; taggedAfter: number };

function isTagged(row: { skinType: string | null; skinConcerns: string | null; hairType: string | null; hairConcerns: string | null; fragrancePreference: string | null; wellnessInterests: string | null }): boolean {
  return Boolean(row.skinType || row.skinConcerns || row.hairType || row.hairConcerns || row.fragrancePreference || row.wellnessInterests);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      shortDescription: products.shortDescription,
      description: products.description,
      categorySlug: productCategories.slug,
      categoryName: productCategories.name,
      skinType: products.skinType,
      skinConcerns: products.skinConcerns,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(or(
      isNull(products.skinType), isNull(products.skinConcerns), isNull(products.hairType),
      isNull(products.hairConcerns), isNull(products.fragrancePreference), isNull(products.wellnessInterests),
    ));

  const byCategory = new Map<string, Tally>();
  let writes = 0;

  for (const row of rows) {
    const categoryKey = row.categoryName ?? "(ангилалгүй)";
    const tally = byCategory.get(categoryKey) ?? { total: 0, taggedBefore: 0, taggedAfter: 0 };
    tally.total++;
    if (isTagged(row)) tally.taggedBefore++;

    const suggestion: SuggestedTags = suggestTagsForProduct({
      name: row.name, brand: row.brand, categorySlug: row.categorySlug,
      shortDescription: row.shortDescription, description: row.description,
    });

    const patch: Record<string, string> = {};
    if (row.skinType == null && suggestion.skinType) patch.skinType = suggestion.skinType;
    if (row.skinConcerns == null && suggestion.skinConcerns?.length) patch.skinConcerns = suggestion.skinConcerns.join(",");
    if (row.hairType == null && suggestion.hairType) patch.hairType = suggestion.hairType;
    if (row.hairConcerns == null && suggestion.hairConcerns?.length) patch.hairConcerns = suggestion.hairConcerns.join(",");
    if (row.fragrancePreference == null && suggestion.fragrancePreference) patch.fragrancePreference = suggestion.fragrancePreference;
    if (row.wellnessInterests == null && suggestion.wellnessInterests?.length) patch.wellnessInterests = suggestion.wellnessInterests.join(",");

    // Tier 2 (2026-09-01, Tom's explicit request after a live QA run showed
    // 0 tagged hair-care products meant "Хуурай үс / Үс унах" preferences
    // had NOTHING to match against at all): a coarse CATEGORY-LEVEL default
    // for whatever tier 1's precise keyword matcher still left untagged, so
    // every published product carries at least one matchable signal instead
    // of some categories being permanently invisible to the recommender.
    // Deliberately NOT applied to suggestTagsForProduct itself (and so NOT
    // shown as an admin suggestion chip) -- a chip implies "we found a real
    // signal in this product's text", which a category default is not.
    // "normal"/"normal" are genuinely the most common real values for
    // skinType/hairType (see SKIN_TYPES ordering in Profile.tsx), not an
    // arbitrary pick.
    if (row.skinType == null && patch.skinType == null && (row.categorySlug === "arhis-archilgaa" || row.categorySlug === "goo-saikhan" || row.categorySlug === "eej-ba-khuukhed")) patch.skinType = "normal";
    if (row.hairType == null && patch.hairType == null && row.categorySlug === "us-ba-bie") patch.hairType = "normal";
    if (row.fragrancePreference == null && patch.fragrancePreference == null && row.categorySlug === "eruul-akhui") patch.fragrancePreference = "light";
    if (row.wellnessInterests == null && patch.wellnessInterests == null && row.categorySlug === "eruul-mend") patch.wellnessInterests = "energy";

    const willBeTagged = isTagged(row) || Object.keys(patch).length > 0;
    if (willBeTagged) tally.taggedAfter++;
    byCategory.set(categoryKey, tally);

    if (Object.keys(patch).length > 0) {
      writes++;
      if (APPLY) {
        // Column-by-column isNull guard (not just the WHERE above, which is
        // OR'd across all 6 columns) -- a product missing only e.g.
        // wellnessInterests must not get its untouched skinType clobbered.
        const guards = Object.keys(patch).map(column => isNull((products as unknown as Record<string, typeof products.id>)[column]));
        await db.update(products).set(patch).where(and(eq(products.id, row.id), ...guards));
      }
    }
  }

  console.log(APPLY ? "APPLIED (real writes made):" : "DRY RUN (no writes made -- pass --apply to write for real):");
  console.log("");
  let totalBefore = 0, totalAfter = 0, totalAll = 0;
  for (const [category, tally] of Array.from(byCategory.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${category.padEnd(20)} ${tally.taggedBefore}/${tally.total} -> ${tally.taggedAfter}/${tally.total} tagged`);
    totalBefore += tally.taggedBefore; totalAfter += tally.taggedAfter; totalAll += tally.total;
  }
  console.log("");
  console.log(`TOTAL: ${totalBefore}/${totalAll} tagged before -> ${totalAfter}/${totalAll} tagged after (${writes} product(s) ${APPLY ? "updated" : "would be updated"}).`);
  if (!APPLY) console.log("\nThis was a dry run -- nothing was written. Re-run with --apply to write for real (take a fresh backup first: powershell scripts/db-backup.ps1).");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
