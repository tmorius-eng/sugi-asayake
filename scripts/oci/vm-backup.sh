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
# The bucket is separate from the storefront's public one on purpose: that
# bucket is served publicly at pub-*.r2.dev, so a dump there would be one
# guessed URL away from the internet. Encryption is the second lock.
#
# Install (once, as ubuntu on the VM):
#   cp scripts/oci/vm-backup.sh scripts/oci/vm-backup-upload.mjs ~/sugi-asayake/
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
env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DATABASE_ADMIN_URL="$(env_get DATABASE_ADMIN_URL)"
BACKUP_PASSPHRASE="$(env_get BACKUP_PASSPHRASE)"
CA_PATH="$(env_get DATABASE_CA_CERT_PATH)"
[ -n "$DATABASE_ADMIN_URL" ] || { echo "DATABASE_ADMIN_URL missing"; exit 1; }
[ -n "$BACKUP_PASSPHRASE" ] || { echo "BACKUP_PASSPHRASE missing"; exit 1; }
export BACKUP_PASSPHRASE

# mysql://user:pass@host:port/db?... -- the password is percent-encoded in .env.
urldecode() { printf '%b' "${1//%/\\x}"; }
DB_USER="$(urldecode "$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://([^:]+):.*#\1#')")"
DB_PASS="$(urldecode "$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^:]+:([^@]*)@.*#\1#')")"
DB_HOST="$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^@]+@([^:/]+).*#\1#')"
DB_PORT="$(echo "$DATABASE_ADMIN_URL" | sed -E 's#^mysql://[^@]+@[^:/]+:([0-9]+).*#\1#')"
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
echo "[$(date -u +%FT%TZ)] done"
