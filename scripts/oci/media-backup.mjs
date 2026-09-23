// Copies the PUBLIC image bucket into the private backup bucket (2026-09-20).
//
// Why this exists: until now the only thing backed up was the database.
// vm-backup.sh dumps MySQL every night, but the product photos -- ~522 files
// that took months to gather and cannot be regenerated -- lived as a SINGLE
// copy in one Cloudflare R2 bucket. A deleted bucket, a revoked API token or
// a billing lapse would have taken all of them with it, and the database rows
// that point at them would survive pointing at nothing. Found while preparing
// the system for sale (docs/OWNER-HANDOVER.md); a buyer inheriting
// single-copy media is inheriting an unbacked-up asset.
//
//   node media-backup.mjs            # copy anything new or changed
//   node media-backup.mjs --dry-run  # list what WOULD be copied
//
// Incremental by ETag: R2 returns the object's ETag (the MD5 for a simple
// upload) in a listing, so an object already present in the backup with the
// same ETag is skipped without transferring a byte. A re-run right after a
// full run therefore copies nothing and costs one listing per 1,000 objects.
//
// Restore: copy back the other way, or download a prefix with rclone/aws.
// The originals keep their key under `media/` so the mapping is one-to-one --
// `media/products/x.webp` in the backup is `products/x.webp` in the live
// bucket. See docs/OPERATIONS.md §4.
import { readFileSync } from "node:fs";
import { S3Client, ListObjectsV2Command, CopyObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const BACKUP_BUCKET = process.env.BACKUP_BUCKET || "sugi-asayake-backups";
const PREFIX = "media/";
const DRY = process.argv.includes("--dry-run");

// Same .env reader as vm-backup-upload.mjs: KEY=VALUE lines, no shell sourcing
// (a value containing spaces or '#' would trip `source`).
// VM дээр энэ скриптийн ХАЖУУД .env байдаг (суулгах зааврыг vm-backup.sh-аас
// үз). Хөгжүүлэгчийн машин дээр тэр файл байхгүй тул process.env руу унана:
//   node --env-file=.env scripts/oci/media-backup.mjs --dry-run
let env;
try {
  env = Object.fromEntries(
    readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")
      .filter(line => /^[A-Z0-9_]+=/.test(line))
      .map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")]; }),
  );
} catch {
  env = process.env;
}
for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"]) {
  if (!env[key]) { console.error(`${key} missing in .env`); process.exit(1); }
}
const SOURCE_BUCKET = env.S3_BUCKET;

const s3 = new S3Client({
  region: env.S3_REGION || "auto",
  endpoint: env.S3_ENDPOINT,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

/** Every object in a bucket, following continuation tokens. */
async function listAll(Bucket, Prefix) {
  const out = new Map();
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    for (const o of page.Contents ?? []) out.set(o.Key, { etag: (o.ETag || "").replace(/"/g, ""), size: o.Size });
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

try {
  await s3.send(new HeadBucketCommand({ Bucket: BACKUP_BUCKET }));
} catch {
  if (DRY) { console.error(`backup bucket ${BACKUP_BUCKET} does not exist (dry run: not creating)`); process.exit(1); }
  await s3.send(new CreateBucketCommand({ Bucket: BACKUP_BUCKET }));
  console.log(`created bucket ${BACKUP_BUCKET}`);
}

const source = await listAll(SOURCE_BUCKET, undefined);
const backup = await listAll(BACKUP_BUCKET, PREFIX);
console.log(`source ${SOURCE_BUCKET}: ${source.size} object(s) | backup ${BACKUP_BUCKET}/${PREFIX}: ${backup.size}`);

let copied = 0, skipped = 0, failed = 0, bytes = 0;
for (const [key, meta] of source) {
  const target = `${PREFIX}${key}`;
  const have = backup.get(target);
  if (have && have.etag && meta.etag && have.etag === meta.etag) { skipped += 1; continue; }
  if (DRY) { console.log(`would copy ${key} (${meta.size} bytes)`); copied += 1; bytes += meta.size || 0; continue; }
  try {
    // Server-side copy: the bytes never travel through this machine.
    await s3.send(new CopyObjectCommand({
      Bucket: BACKUP_BUCKET, Key: target,
      CopySource: `/${SOURCE_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
    }));
    copied += 1;
    bytes += meta.size || 0;
  } catch (error) {
    failed += 1;
    console.error(`FAILED ${key}: ${error instanceof Error ? error.message : error}`);
  }
}

// Objects deleted from the live bucket are deliberately KEPT in the backup:
// this is a safety net against accidental deletion, so pruning it to match
// would defeat the purpose. Old files cost storage, not correctness.
console.log(`${DRY ? "[dry run] " : ""}copied ${copied}, skipped ${skipped} (unchanged), failed ${failed}, ~${Math.round(bytes / 1024)} KB`);
if (failed) process.exit(1);
