// One-off reconciliation: the home laptop's MySQL was restored from a
// catalog export taken BEFORE the multi-batch image-sourcing work, so
// products.imageUrl is back to NULL for ~145 products that already have a
// real, verified photo sitting in the (laptop-shared) R2 bucket. Since R2 is
// shared between machines, we recover by listing catalog/products/<id>/...
// objects and re-pointing imageUrl at whichever object is newest per id
// (in case of a re-upload/correction), without re-running any sourcing.
//
// Usage: pnpm exec tsx scripts/reconcile-images-from-r2.ts [--dry-run]

import "dotenv/config";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";

const ENV = {
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT || undefined,
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const client = new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });

  // id -> { key, lastModified }
  const latestByProductId = new Map<number, { key: string; lastModified: Date }>();

  let continuationToken: string | undefined;
  let objectCount = 0;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: ENV.s3Bucket,
        Prefix: "catalog/products/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      objectCount++;
      const key = obj.Key!;
      const m = key.match(/^catalog\/products\/(\d+)\//);
      if (!m) continue;
      const id = Number(m[1]);
      const lastModified = obj.LastModified ?? new Date(0);
      const existing = latestByProductId.get(id);
      if (!existing || lastModified > existing.lastModified) {
        latestByProductId.set(id, { key, lastModified });
      }
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`R2: found ${objectCount} objects under catalog/products/, spanning ${latestByProductId.size} product ids.`);

  const conn = await mysql.createConnection(ENV.databaseUrl);
  try {
    const [rows] = await conn.execute<any[]>(
      "SELECT id, imageUrl FROM products WHERE id IN (" +
        Array.from(latestByProductId.keys()).join(",") +
        ")",
    );
    const dbState = new Map<number, string | null>();
    for (const row of rows as any[]) dbState.set(row.id, row.imageUrl);

    let toUpdate: { id: number; url: string }[] = [];
    for (const [id, { key }] of latestByProductId) {
      const url = `/cdn/${key}`;
      const current = dbState.get(id);
      if (current === undefined) continue; // id not in DB at all
      if (current === null) {
        toUpdate.push({ id, url });
      }
      // if current is already set (non-null), leave it alone — don't
      // clobber a value that might already be correct/newer.
    }

    console.log(`Reconciling ${toUpdate.length} products (imageUrl was NULL, R2 object exists).`);
    if (dryRun) {
      for (const { id, url } of toUpdate) console.log(`  [dry-run] id=${id} -> ${url}`);
    } else {
      for (const { id, url } of toUpdate) {
        await conn.execute("UPDATE products SET imageUrl = ? WHERE id = ?", [url, id]);
      }
      console.log(`Updated ${toUpdate.length} rows.`);
    }

    const [[{ remaining }]] = (await conn.execute(
      "SELECT COUNT(*) AS remaining FROM products WHERE imageUrl IS NULL",
    )) as any;
    console.log(`Remaining imageUrl IS NULL: ${remaining}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
