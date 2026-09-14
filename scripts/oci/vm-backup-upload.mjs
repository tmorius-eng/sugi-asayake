/* global process, console, URL */
// Uploads one encrypted dump to the private R2 backup bucket and prunes old
// ones (2026-09-14). Runs on the VM with the app's own node_modules -- the
// same @aws-sdk/client-s3 the storefront uses for images -- so no extra
// binary (rclone/aws) is needed there.
//
//   node vm-backup-upload.mjs /path/to/defaultdb_2026-09-14_190000.sql.gz.enc
//
// Reads S3_* from ./.env (same credentials as the image bucket; the R2 API
// token can create buckets, which is how the storefront bucket was made).
// The backup bucket is created on first run and is NOT connected to a
// public r2.dev domain, so nothing in it is reachable without the API key.
import { readFileSync, createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.BACKUP_BUCKET || "sugi-asayake-backups";
const PREFIX = "db/";
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);

const env = Object.fromEntries(
  readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")
    .filter(line => /^[A-Z0-9_]+=/.test(line))
    .map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")]; }),
);
for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
  if (!env[key]) { console.error(`${key} missing in .env`); process.exit(1); }
}

const file = process.argv[2];
if (!file) { console.error("usage: node vm-backup-upload.mjs <file>"); process.exit(1); }

const s3 = new S3Client({
  region: env.S3_REGION || "auto",
  endpoint: env.S3_ENDPOINT,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  console.log(`created bucket ${BUCKET}`);
}

const key = `${PREFIX}${basename(file)}`;
await s3.send(new PutObjectCommand({
  Bucket: BUCKET, Key: key, Body: createReadStream(file), ContentLength: statSync(file).size,
  ContentType: "application/octet-stream",
}));
console.log(`uploaded ${key} (${statSync(file).size} bytes)`);

// Prune: anything older than KEEP_DAYS.
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
const stale = (listed.Contents ?? []).filter(o => o.LastModified && o.LastModified.getTime() < cutoff && o.Key !== key);
if (stale.length) {
  await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: stale.map(o => ({ Key: o.Key })) } }));
  console.log(`pruned ${stale.length} backup(s) older than ${KEEP_DAYS} days`);
}
console.log(`retained: ${(listed.Contents ?? []).length - stale.length}`);
