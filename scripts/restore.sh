#!/usr/bin/env bash
#
# Puts a backup back. Destructive on purpose: it replaces the database and
# the attachment files with the ones in the backup.
#
#   ./scripts/restore.sh backups/20261101T031500Z
#
# Practise this before you need it. An untested backup is a wish.
set -euo pipefail

cd "$(dirname "$0")/.."

FROM="${1:-}"
if [ -z "$FROM" ] || [ ! -f "$FROM/issueit.dump" ]; then
  echo "usage: ./scripts/restore.sh <backup directory>" >&2
  echo "       the directory must hold issueit.dump" >&2
  exit 1
fi

echo "This replaces the current database and attachment files with $FROM."
printf "Type the word restore to continue: "
read -r answer
[ "$answer" = "restore" ] || { echo "Nothing was changed."; exit 1; }

if [ -f "$FROM/env" ] && [ -f .env ] && ! diff -q "$FROM/env" .env >/dev/null; then
  echo "note: .env differs from the backup's. If ENCRYPTION_KEY changed, stored"
  echo "      credentials from the backup can't be decrypted. The backup's copy"
  echo "      is at $FROM/env."
fi

docker compose up -d db
docker compose exec -T db sh -c 'until pg_isready -U issueit -d issueit >/dev/null 2>&1; do sleep 1; done'

# Stop the app so nothing writes while the database is being replaced.
docker compose stop app 2>/dev/null || true

echo "restore: database"
# --clean drops what it's about to recreate; --if-exists keeps it quiet on a
# fresh database. Ownership comes from the target, not the dump.
docker compose exec -T db pg_restore -U issueit -d issueit --clean --if-exists --no-owner --no-privileges < "$FROM/issueit.dump"

if [ -f "$FROM/data.tar.gz" ]; then
  echo "restore: files"
  docker compose up -d app
  docker compose exec -T app sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null || true'
  gunzip -c "$FROM/data.tar.gz" | docker compose exec -T app tar -C /data -xf -
fi

docker compose up -d
echo "restore: done. Migrations run on start, so a newer build will bring the schema forward."
