// One-time migration: copies every object from a local MinIO bucket into
// this machine's currently-configured S3-compatible destination (whatever
// .env's S3_* vars point at). Written for the 2026-08-26 MinIO -> Cloudflare
// R2 move (see docs/PROJECT-GUIDE.md's dated section) so both laptops read/write the
// same shared bucket instead of each having their own local MinIO copy --
// no cross-machine sync needed at all once this has run once per machine.
//
// IMPORTANT: point .env's S3_* vars at the DESTINATION (R2) before running
// this -- the source (local MinIO) is hardcoded below to the standard local
// dev defaults, not read from .env, since .env IS the destination here.
//
// Run with:
//   pnpm exec tsx scripts/migrate-storage-to-r2.ts
//
// Safe to re-run: skips any key that already exists at the destination (a
// HeadObject check before each copy), so an interrupted run can just be
// started again without re-uploading everything.
import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { ENV } from "../server/_core/env";

// Overridable via env vars only for the rare case you're migrating from
// somewhere other than the standard local MinIO dev setup.
const SOURCE_ENDPOINT = process.env.SOURCE_S3_ENDPOINT || "http://127.0.0.1:9000";
const SOURCE_BUCKET = process.env.SOURCE_S3_BUCKET || "sugi-asayake";
const SOURCE_ACCESS_KEY_ID = process.env.SOURCE_S3_ACCESS_KEY_ID || "minioadmin";
const SOURCE_SECRET_ACCESS_KEY = process.env.SOURCE_S3_SECRET_ACCESS_KEY || "minioadmin";
// docs/PROJECT-GUIDE.md's 2026-08-20 note: some local MinIO buckets on this project were
// created back when the region was mistakenly set to "Mongolia" instead of
// the standard "us-east-1" -- ListObjectsV2 rejects a signature signed for
// the wrong region with AuthorizationHeaderMalformed. Override here if this
// machine's bucket is one of those (the error message itself names the
// region it expects).
const SOURCE_REGION = process.env.SOURCE_S3_REGION || "us-east-1";

async function main() {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    console.error("Destination storage isn't configured -- set S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (and S3_ENDPOINT) in .env first.");
    process.exitCode = 1;
    return;
  }
  if (ENV.s3Endpoint?.includes("127.0.0.1") || ENV.s3Endpoint?.includes("localhost")) {
    console.error("Destination (.env S3_ENDPOINT) still points at local MinIO -- point it at R2 first (docs/PROJECT-GUIDE.md's 2026-08-26 section has the exact steps), then re-run this.");
    process.exitCode = 1;
    return;
  }

  const source = new S3Client({
    region: SOURCE_REGION,
    endpoint: SOURCE_ENDPOINT,
    credentials: { accessKeyId: SOURCE_ACCESS_KEY_ID, secretAccessKey: SOURCE_SECRET_ACCESS_KEY },
  });
  const dest = new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint,
    credentials: { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey },
  });

  console.log(`Source:      ${SOURCE_ENDPOINT}/${SOURCE_BUCKET}`);
  console.log(`Destination: ${ENV.s3Endpoint ?? "(AWS S3)"}/${ENV.s3Bucket}\n`);

  let continuationToken: string | undefined;
  let total = 0, copied = 0, skipped = 0, failed = 0;

  do {
    const page = await source.send(new ListObjectsV2Command({ Bucket: SOURCE_BUCKET, ContinuationToken: continuationToken }));
    const objects = page.Contents ?? [];
    total += objects.length;

    for (const obj of objects) {
      if (!obj.Key) continue;
      try {
        const alreadyThere = await dest.send(new HeadObjectCommand({ Bucket: ENV.s3Bucket, Key: obj.Key })).then(() => true).catch(() => false);
        if (alreadyThere) { skipped++; continue; }

        const got = await source.send(new GetObjectCommand({ Bucket: SOURCE_BUCKET, Key: obj.Key }));
        const bytes = await got.Body?.transformToByteArray();
        if (!bytes) throw new Error("empty body");

        await dest.send(new PutObjectCommand({
          Bucket: ENV.s3Bucket,
          Key: obj.Key,
          Body: Buffer.from(bytes),
          ContentType: got.ContentType ?? "application/octet-stream",
        }));
        copied++;
        if (copied % 20 === 0) console.log(`  ...${copied} copied so far`);
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${obj.Key} -- ${err instanceof Error ? err.message : err}`);
      }
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`\nDone. ${total} objects found -- ${copied} copied, ${skipped} already present, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main();
