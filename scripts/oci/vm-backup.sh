#!/usr/bin/env bash
# Daily database backup FROM THE VM to a private R2 bucket (2026-09-14).
#
# Until now the only off-database copy was the Windows task on the home
# laptop -- which runs only while that laptop is on. HeatWave keeps its own
# automatic backups for 7 days, but those live inside the same Oracle
# account; this is the independent copy, and it runs from the machine that
# is always on.
#
#   mysqldump (admin user, TLS) -> gzip -> openssl AES-256 (BACKUP_PASSPHRASE)
#   -> vm-backup-upload.mjs (PUT to R2 bucket "sugi-asayake-backups", prune > 30 days)
#
# Weekly (Sundays) it also runs media-backup.mjs, which copies the public image
# bucket into the same private bucket under "media/". Until 2026-09-20 the
# photos were the one asset with no second copy anywhere.
#
# The bucket is separate from the storefront's public one on purpose: that
# bucket is served publicly at pub-*.r2.dev, so a dump there would be one
# guessed URL away from the internet. Encryption is the second lock.
#
# Install (once, as ubuntu on the VM):
#   cp scripts/oci/vm-backup.sh scripts/oci/vm-backup-upload.mjs scripts/oci/media-backup.mjs ~/sugi-asayake/
#   echo "BACKUP_PASSPHRASE=<long random>" >> ~/sugi-asayake/.env   # keep a copy elsewhere!
#   (crontab -l 2>/dev/null; echo "0 19 * * * /home/ubuntu/sugi-asayake/vm-backup.sh >> /home/ubuntu/backup.log 2>&1") | crontab -
#   (19:00 UTC = 03:00 Ulaanbaatar)
#
# Restore: download the .sql.gz.enc, then
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in X.sql.gz.enc | gunzip | mysql ...
set -euo pipefail
cd "$(dirname "$0")"

# .env is KEY=VALUE lines (dotenv); export the ones we need without sourcing
# the whole file (a value containing spaces or '#' would trip `source`).
# `|| true` (2026-09-23): under `set -euo pipefail` a MISSING key made grep exit 1
# and killed the whole backup before its first log line -- even for the optional
# DATABASE_CA_CERT_PATH. Required keys are checked explicitly below.
env_get() { { grep -E "^$1=" .env || true; } | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DATABASE_ADMIN_URL="$(env_get DATABASE_ADMIN_URL)"
BACKUP_PASSPHRASE="$(env_get BACKUP_PASSPHRASE)"
CA_PATH="$(env_get DATABASE_CA_CERT_PATH)"
[ -n "$DATABASE_ADMIN_URL" ] || { echo "DATABASE_ADMIN_URL missing"; exit 1; }
[ -n "$BACKUP_PASSPHRASE" ] || { echo "BACKUP_PASSPHRASE missing"; exit 1; }
export BACKUP_PASSPHRASE

# mysql://user:pass@host:port/db?... -- the password is percent-encoded in .env.
# node, not `printf '%b'` (2026-09-23): %b also interprets backslash escapes, so
# a password containing a backslash sequence (e.g. "\c") was silently truncated.
urldecode() { node -e 'process.stdout.write(decodeURIComponent(process.argv[1]))' "$1"; }
DB_USER="$(urldecode "$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://([^:]+):.*#\1#')")"
DB_PASS="$(urldecode "$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^:]+:([^@]*)@.*#\1#')")"
DB_HOST="$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^@]+@([^:/]+).*#\1#')"
# A URL without ":port" used to leave the WHOLE URL in DB_PORT; default 3306.
DB_PORT="$(echo "$DATABASE_ADMIN_URL" | sed -nE 's#^mysql://[^@]+@[^:/]+:([0-9]+).*#\1#p')"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^/]+/([^?]+).*#\1#')"

STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/${DB_NAME}_${STAMP}.sql.gz.enc"

echo "[$(date -u +%FT%TZ)] dump $DB_NAME from $DB_HOST:$DB_PORT as $DB_USER"
# Same flags as scripts/db-backup.ps1: HeatWave is GTID-enabled and admin
# lacks SUPER/PROCESS, so the dump must not carry GTID_PURGED or tablespaces.
MYSQL_PWD="$DB_PASS" mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  ${CA_PATH:+--ssl-ca="$CA_PATH" --ssl-mode=VERIFY_CA} \
  --set-gtid-purged=OFF --no-tablespaces --single-transaction --routines --triggers "$DB_NAME" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"

SIZE=$(stat -c %s "$OUT")
[ "$SIZE" -gt 10000 ] || { echo "backup suspiciously small ($SIZE bytes) -- not uploading"; exit 1; }
echo "[$(date -u +%FT%TZ)] encrypted dump: $SIZE bytes"

node vm-backup-upload.mjs "$OUT"

# Зураг (2026-09-20): өгөгдлийн сан бүртгэлийг хадгална, харин зургууд өөрсдөө
# нэг л хуулбартай байсан. Долоо хоногт нэг удаа (ням гараг) нэмэгдүүлсэн
# хуулбар хийнэ — ETag ижил объектыг алгасдаг тул өдөр бүр ажиллуулж ч болно,
# гэхдээ жирийн өдөр шинэ зураг цөөн тул долоо хоног хангалттай.
if [ "$(date -u +%u)" = "7" ]; then
  echo "[$(date -u +%FT%TZ)] media backup (weekly)"
  node media-backup.mjs || echo "[$(date -u +%FT%TZ)] media backup FAILED (dump is still uploaded)"
fi

echo "[$(date -u +%FT%TZ)] done"
