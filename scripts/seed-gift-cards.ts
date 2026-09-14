// 2026-09-14: checkout-оор зарагдах бэлгийн карт — каталогийн тал.
//
// Картын зургийг render хийж (client/public/images/gift-cards/<amount>.webp,
// packshot шиг 1600px дөрвөлжин, + ангиллын зураг) "Бэлгийн карт" ангилал (slug
// gift-card) болон дүн бүрд нэг бараа (kind = gift_card) үүсгэнэ. createAdminCategory
// / createAdminProduct-оор явдаг тул default variant, branch_stock бүртгэл, cache
// invalidation бүгд /admin-д нэмсэн бараатай яг ижил. Idempotent: байгаа ангилал,
// SKU-г хөндөхгүй (DENOMINATIONS засаад дахин ажиллуулбал шинийг нэмнэ).
//
//   pnpm exec tsx scripts/seed-gift-cards.ts            # зураг render + dry run
//   pnpm exec tsx scripts/seed-gift-cards.ts --apply    # DB-д ч бичнэ
//
// Зургийг sharp-аар SVG-ээс зурна (системийн sans-serif; sharp хоёр лаптоп дээр
// кириллийг зөв зурдгийг бичихээс өмнө шалгасан). Үнэ = картын дүн: 50,000₮-ийн
// бараа нь 50,000₮-ийн карт МӨН.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { createAdminCategory, createAdminProduct, findProductBySku, getDb } from "../server/db";
import { productCategories } from "../drizzle/schema";

const DENOMINATIONS = [25_000, 50_000, 100_000, 200_000];
const CATEGORY = { name: "Бэлгийн карт", slug: "gift-card", sortOrder: 8 };
const ART_DIR = join(process.cwd(), "client", "public", "images", "gift-cards");
const CATEGORY_ART = join(process.cwd(), "client", "public", "images", "categories", "gift-card.webp");

const mnt = (amount: number) => `${new Intl.NumberFormat("en-US").format(amount).replace(/,/g, " ")}₮`;

/** 1600x1600, the card sitting on the site's Linen ground, like a packshot. */
function cardSvg(amount: number | null): string {
  const label = amount === null ? "БЭЛГИЙН КАРТ" : mnt(amount);
  const sub = amount === null ? "ХҮССЭН ЗҮЙЛЭЭ ӨӨРӨӨ СОНГО" : "БЭЛГИЙН КАРТ";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b01729"/><stop offset="1" stop-color="#e43a55"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1600" fill="#f2f5f2"/>
  <g transform="translate(160 430)">
    <rect x="0" y="0" width="1280" height="760" rx="56" fill="#000" opacity=".12" transform="translate(0 28)"/>
    <rect x="0" y="0" width="1280" height="760" rx="56" fill="url(#g)"/>
    <rect x="0" y="0" width="1280" height="760" rx="56" fill="url(#shine)"/>
    <circle cx="1120" cy="140" r="260" fill="#ffffff" opacity=".07"/>
    <circle cx="180" cy="700" r="200" fill="#ffffff" opacity=".06"/>
    <text x="96" y="130" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" letter-spacing="14" fill="#ffffff" opacity=".92">SUGI ASAYAKE</text>
    <rect x="96" y="160" width="120" height="6" fill="#f0b52d"/>
    <text x="96" y="${amount === null ? 460 : 430}" font-family="Arial, Helvetica, sans-serif" font-size="${amount === null ? 150 : 190}" font-weight="700" letter-spacing="-4" fill="#ffffff">${label}</text>
    <text x="96" y="${amount === null ? 560 : 520}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" letter-spacing="10" fill="#ffffff" opacity=".9">${sub}</text>
    <text x="96" y="680" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#ffffff" opacity=".8">Онлайн болон бүх салбарт · 12 сар хүчинтэй</text>
    <rect x="1040" y="600" width="144" height="96" rx="14" fill="#ffffff" opacity=".22"/>
    <rect x="1064" y="626" width="96" height="10" rx="5" fill="#ffffff" opacity=".8"/>
    <rect x="1064" y="650" width="64" height="10" rx="5" fill="#ffffff" opacity=".6"/>
  </g>
</svg>`;
}

async function renderArt() {
  await mkdir(ART_DIR, { recursive: true });
  for (const amount of DENOMINATIONS) {
    const file = join(ART_DIR, `${amount}.webp`);
    await writeFile(file, await sharp(Buffer.from(cardSvg(amount))).webp({ quality: 88 }).toBuffer());
    console.log(`art  ${file}`);
  }
  await writeFile(CATEGORY_ART, await sharp(Buffer.from(cardSvg(null))).webp({ quality: 88 }).toBuffer());
  console.log(`art  ${CATEGORY_ART}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  await renderArt();
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const [existing] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.slug, CATEGORY.slug)).limit(1);
  let categoryId = existing?.id ?? 0;
  if (!categoryId) {
    console.log(`category "${CATEGORY.name}" (${CATEGORY.slug}) ${apply ? "will be created" : "would be created"}`);
    if (apply) {
      const created = await createAdminCategory({
        ...CATEGORY,
        description: "Юу бэлэглэхээ мэдэхгүй байна уу? Бэлгийн карт — хүлээн авагч дуртай зүйлээ өөрөө сонгоно. Код нь төлбөр баталгаажмагц шууд ирнэ, онлайн болон бүх салбарт 12 сар хүчинтэй.",
        imageUrl: "/images/categories/gift-card.webp",
        isActive: true,
      });
      categoryId = created.id;
    }
  } else {
    console.log(`category "${CATEGORY.name}" exists (id ${categoryId})`);
  }
  let n = 0;
  for (const amount of DENOMINATIONS) {
    const sku = `GIFT-${amount}`;
    if (await findProductBySku(sku)) { console.log(`=  ${sku} exists`); continue; }
    console.log(`${apply ? "+" : "~"}  ${sku}  ${mnt(amount)}`);
    if (!apply) continue;
    await createAdminProduct({
      categoryId,
      name: `Бэлгийн карт ${mnt(amount)}`,
      slug: `gift-card-${amount}`,
      brand: "SUGI ASAYAKE",
      shortDescription: `${mnt(amount)}-ийн үнэ бүхий цахим бэлгийн карт. Төлбөр баталгаажмагц код танд шууд ирнэ.`,
      // Plain text: ProductDetail prints descriptions as text (GlossaryText), not HTML.
      description: `SUGI ASAYAKE-ийн ${mnt(amount)}-ийн бэлгийн карт. Төлбөр баталгаажмагц картын код таны захиалгын түүх, имэйл (өгсөн бол) болон утасны мэдэгдлээр ирнэ — хүргэлт, салбар шаардлагагүй.

Хүлээн авагч кодыг Профайл → Гишүүнчлэл → "Бэлгийн карт ашиглах" хэсэгт оруулахад дүн нь дэлгүүрийн зээл болж, дараагийн захиалгаас автоматаар хасагдана. Хугацаа: олгосноос хойш 12 сар. Бэлгийн картыг мөнгөөр буцаан авах боломжгүй.`,
      priceMnt: amount,
      sku,
      imageUrl: `/images/gift-cards/${amount}.webp`,
      stockQuantity: 999,
      isPublished: true,
      kind: "gift_card",
    });
    n += 1;
  }
  console.log(apply ? `\nCreated ${n} gift card product(s).` : "\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
