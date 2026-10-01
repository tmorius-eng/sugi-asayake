import "dotenv/config";
import { CopyObjectCommand, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/**
 * CV (`applications/`) болон барааны баримтын зураг (`inventory/receipts/`)-ийг
 * НИЙТИЙН bucket-ээс ХУВИЙН bucket (S3_PRIVATE_BUCKET) руу зөөнө (2026-10-01).
 *
 * Яагаад: эдгээр объект нийтийн bucket-д "нууц" key-тэй байсан ч bucket public-read тул
 * key мэдсэн хэн ч уншдаг байв. Шинэ upload-ууд аль хэдийн хувийн bucket руу явна;
 * энэ скрипт хуучин объектуудыг зөөнө. DB-ийн key (`applications/…`, `/cdn/inventory/receipts/…`)
 * ХЭВЭЭРЭЭ — storageGetSignedUrlPrivate нь хувийн bucket-ээс эхэлж хайна.
 *
 *   pnpm exec tsx scripts/move-private-objects.ts            # dry-run (анхдагч): юу зөөгдөхийг харуулна
 *   pnpm exec tsx scripts/move-private-objects.ts --apply    # хуулаад, амжилттай бол нийтээс устгана
 *
 * Хуулалт амжилтгүй бол тухайн объектыг нийтээс УСТГАХГҮЙ. S3_PRIVATE_BUCKET тохируулаагүй бол татгалзана.
 * Нийтийн ба хувийн bucket нэг account/түлхүүртэй (CopyObject ижил endpoint дээр).
 */

const PREFIXES = ["applications/", "inventory/receipts/"];
const APPLY = process.argv.includes("--apply");

async function main() {
  const publicBucket = process.env.S3_BUCKET ?? "";
  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? "";
  if (!privateBucket) {
    console.error("S3_PRIVATE_BUCKET тохируулаагүй байна — зөөхөөс татгалзлаа.");
    process.exit(2);
  }
  if (!publicBucket || privateBucket === publicBucket) {
    console.error("S3_BUCKET тохируулаагүй эсвэл S3_PRIVATE_BUCKET-тэй ижил байна — зөөхөөс татгалзлаа.");
    process.exit(2);
  }
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  if (!accessKeyId || !secretAccessKey) {
    console.error("S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY тохируулаагүй байна.");
    process.exit(2);
  }
  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId, secretAccessKey },
  });
  // Хувийн bucket байгаа эсэхийг эхэлж шалгана (байхгүй бол хуулалт бүр унана).
  await client.send(new HeadBucketCommand({ Bucket: privateBucket }));

  console.log(APPLY ? "РЕЖИМ: --apply (хуулаад, нийтээс устгана)" : "РЕЖИМ: dry-run (юу ч өөрчлөхгүй; --apply-аар ажиллуул)");
  let found = 0, moved = 0, failed = 0;
  for (const prefix of PREFIXES) {
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: publicBucket, Prefix: prefix, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        const key = object.Key;
        if (!key) continue;
        found += 1;
        if (!APPLY) { console.log(`  [dry-run] ${key} (${object.Size ?? "?"} байт)`); continue; }
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: publicBucket, Key: key }));
          await client.send(new CopyObjectCommand({
            Bucket: privateBucket,
            Key: key,
            // Key нь `/`-ээс гадна тусгай тэмдэгт агуулж болох тул кодчилно (сегмент бүрийг).
            CopySource: `${publicBucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
            MetadataDirective: "REPLACE",
            ContentType: head.ContentType,
            CacheControl: "private, no-store",
          }));
          await client.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: key }));
          moved += 1;
          console.log(`  зөөв: ${key}`);
        } catch (error) {
          failed += 1;
          console.error(`  АЛДАА ${key}:`, error instanceof Error ? error.message : error);
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  console.log(`Олдсон: ${found}, зөөсөн: ${moved}, алдаатай: ${failed}${APPLY ? "" : " (dry-run)"}`);
  if (failed > 0) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
