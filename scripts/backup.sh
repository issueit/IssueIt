#!/usr/bin/env bash
#
# Backs up everything that matters, which is three things:
#
#   1. the database      (accounts, projects, reports, delivery records)
#   2. DATA_DIR          (attachment files and project logos)
#   3. .env              (ENCRYPTION_KEY above all: without it every
#                         connected account has to be reconnected by hand)
#
# Run it from the directory holding docker-compose.yml:
#
#   ./scripts/backup.sh                     # into ./backups
#   BACKUP_DIR=/mnt/usb/issueit ./scripts/backup.sh
#
# Nightly, as the user that owns the compose project:
#
#   15 3 * * *  cd /home/you/srv/IssueIt && ./scripts/backup.sh >> backups/backup.log 2>&1
#
# Copy the result somewhere else as well. A backup on the same disk as the
# database is not a backup.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$STAMP"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "backup: the db service isn't running, so there's nothing to dump" >&2
  exit 1
fi

mkdir -p "$OUT"
# Only this user can read it: the dump holds password hashes and the env
# holds the key that decrypts every stored credential.
chmod 700 "$BACKUP_DIR" "$OUT"

echo "backup: $STAMP"

# --- the database -----------------------------------------------------------
# Custom format, so a restore can be selective and parallel.
docker compose exec -T db pg_dump -U issueit -d issueit --format=custom --compress=9 > "$OUT/issueit.dump"
echo "  database   $(du -h "$OUT/issueit.dump" | cut -f1)"

# --- attachments ------------------------------------------------------------
# Read out of the app container, so the Docker volume's real location and
# ownership don't matter.
if docker compose ps --status running --services | grep -qx app; then
  docker compose exec -T app tar -C /data -cf - . 2>/dev/null | gzip -6 > "$OUT/data.tar.gz"
  echo "  files      $(du -h "$OUT/data.tar.gz" | cut -f1)"
else
  echo "  files      skipped, the app container isn't running" >&2
fi

# --- the environment --------------------------------------------------------
if [ -f .env ]; then
  cp .env "$OUT/env"
  chmod 600 "$OUT/env"
  echo "  env        copied (keep this secret)"
fi

# A note to whoever finds this in a year.
cat > "$OUT/README.txt" <<TXT
Issueit backup, $STAMP (UTC)

issueit.dump   pg_dump --format=custom of the whole database
data.tar.gz    the contents of DATA_DIR: attachments/ and logos
env            the .env this install was running, including ENCRYPTION_KEY

Restore with:   ./scripts/restore.sh $OUT
TXT

# --- rotation ---------------------------------------------------------------
if [ "$KEEP_DAYS" -gt 0 ]; then
  gone=0
  while IFS= read -r -d '' old; do
    rm -rf "$old"
    gone=$((gone + 1))
  done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -print0)
  [ "$gone" -gt 0 ] && echo "  rotated    removed $gone older than $KEEP_DAYS days"
fi

echo "backup: done -> $OUT"
