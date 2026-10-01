import "dotenv/config";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Хувийн R2 bucket (S3_PRIVATE_BUCKET) үүсгэж, одоогийн түлхүүрээр бичих/унших/устгах
 * боломжтойг шалгана (2026-10-01, аюулгүй байдлын scan #6).
 *
 *   pnpm exec tsx scripts/r2-create-private-bucket.ts [нэр]     # анхдагч: <S3_BUCKET>-private
 *
 * R2-ийн шинэ bucket анхдагчаар ХУВИЙН (r2.dev public access унтраалттай, custom domain-гүй) —
 * энэ скрипт public access-ийг асаахгүй. Bucket аль хэдийн байвал зөвхөн шалгана.
 * Токен bucket үүсгэх эрхгүй бол Cloudflare → R2 → Create bucket-аар гараар үүсгээд
 * дахин ажиллуулна (тэгвэл зөвхөн эрхийг шалгана). Дараа нь `.env`-д S3_PRIVATE_BUCKET=<нэр>.
 */

async function main() {
  const publicBucket = process.env.S3_BUCKET ?? "";
  const name = process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? (publicBucket ? `${publicBucket}-private` : "");
  if (!name) throw new Error("Bucket-ийн нэр олдсонгүй (S3_BUCKET тохируулаагүй).");
  if (name === publicBucket) throw new Error("Хувийн bucket нийтийнхтэй ижил нэртэй байж болохгүй.");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  const timeout = () => ({ abortSignal: AbortSignal.timeout(20_000) });

  let exists = false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }), timeout());
    exists = true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw new Error(`Bucket "${name}"-ийг шалгаж чадсангүй (HTTP ${status ?? "?"}): ${error instanceof Error ? error.message : error}`);
  }
  if (!exists) {
    await client.send(new CreateBucketCommand({ Bucket: name }), timeout());
    console.log(`Үүсгэв: ${name}`);
  } else {
    console.log(`Аль хэдийн байна: ${name}`);
  }

  const key = `healthcheck/${Date.now()}.txt`;
  await client.send(new PutObjectCommand({ Bucket: name, Key: key, Body: "ok", ContentType: "text/plain", CacheControl: "private, no-store" }), timeout());
  const got = await client.send(new GetObjectCommand({ Bucket: name, Key: key }), timeout());
  const body = await got.Body?.transformToString();
  await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }), timeout());
  if (body !== "ok") throw new Error("Бичсэн объектыг буцааж уншиж чадсангүй.");
  console.log(`Бичих/унших/устгах: OK`);
  console.log(`\n.env-д нэм: S3_PRIVATE_BUCKET=${name}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
