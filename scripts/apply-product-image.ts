// Локалд татаж, аль хэдийн шалгасан барааны зургийг нэг бараанд хэрэглэнэ:
// хэмжээг өөрчилж, хуваалцсан R2 bucket-ийн catalog/products/<id>/ доор upload
// хийж, тухайн барааны imageUrl-ийг түүн рүү заана.
//
// Энэ бол барааны бодит зураг олох ажлын өгөгдөл оруулах туслах (docs/PROJECT-
// GUIDE.md / backups/image-sourcing-log.md) — өөрөө хайлт, шалгалт ХИЙХГҮЙ.
// Дуудахаасаа ӨМНӨ зураг яг тэр бараа мөн эсэхийг шалга.
//
// Хэрэглээ:
//   pnpm exec tsx scripts/apply-product-image.ts <productId> <path-to-image>
import "dotenv/config";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import sharp from "sharp";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { planMysqlConnection } from "../server/_core/dbConnection";
import { storagePut } from "../server/storage";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-") || "product";
}

async function main() {
  const [idArg, imagePath] = process.argv.slice(2);
  const productId = Number(idArg);
  if (!productId || !imagePath) {
    console.error("Usage: pnpm exec tsx scripts/apply-product-image.ts <productId> <path-to-image>");
    process.exit(1);
  }

  // 2026-09-09: same TLS rules as the app (server/_core/dbConnection.ts) --
  // a bare URL string let mysql2 talk to Aiven in plaintext.
  const conn = await mysql.createConnection(planMysqlConnection(process.env.DATABASE_URL ?? "").options);
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id, name, imageUrl FROM products WHERE id = ?",
      [productId],
    );
    const product = rows[0];
    if (!product) {
      console.error(`No product with id=${productId}`);
      process.exit(1);
    }

    const raw = readFileSync(imagePath);
    const ext = (extname(imagePath).slice(1) || "jpg").toLowerCase();
    const slug = slugify(product.name);

    let pipeline = sharp(raw).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
    let contentType: string;
    let outExt: string;
    if (ext === "png") {
      pipeline = pipeline.png({ quality: 90 });
      contentType = "image/png";
      outExt = "png";
    } else if (ext === "webp") {
      pipeline = pipeline.webp({ quality: 90 });
      contentType = "image/webp";
      outExt = "webp";
    } else {
      pipeline = pipeline.jpeg({ quality: 90 });
      contentType = "image/jpeg";
      outExt = "jpg";
    }
    const buffer = await pipeline.toBuffer();

    const { url } = await storagePut(
      `catalog/products/${productId}/${slug}.${outExt}`,
      buffer,
      contentType,
    );

    await conn.execute("UPDATE products SET imageUrl = ? WHERE id = ?", [url, productId]);

    console.log(`Applied: product ${productId} (${product.name}) -> ${url}`);
    if (product.imageUrl) {
      console.log(`  (previous imageUrl was: ${product.imageUrl})`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
