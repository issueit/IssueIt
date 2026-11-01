#!/usr/bin/env bash
# Checks the code that only a database can check.
#
# vitest can't reach the database: compose doesn't publish PostgreSQL's port,
# which is why a rate limiter that threw on every call passed every test and
# was found in a container log. These run the real modules against a scratch
# database on the compose network, so a driver that won't bind a parameter,
# a column that doesn't round-trip and a query that won't parse all fail here
# rather than in production.
#
#   scripts/smoke/run.sh          # against the compose database
#
# The scratch database is created and dropped each time; nothing touches the
# install's own data.
set -euo pipefail
cd "$(dirname "$0")/../.."

db="smoke_$$"
password=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
network=$(docker network ls --format '{{.Name}}' | grep -m1 issueit)
[ -n "$password" ] || { echo "No POSTGRES_PASSWORD in .env"; exit 1; }

cleanup() { docker compose exec -T db psql -U issueit -d postgres -q -c "drop database if exists \"$db\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker compose exec -T db psql -U issueit -d postgres -q -c "create database \"$db\""
for probe in scripts/smoke/*.ts; do
  echo "— $probe"
  docker run --rm --network "$network" -v "$PWD":/app -w /app \
    -e DATABASE_URL="postgres://issueit:$password@db:5432/$db" \
    -e ENCRYPTION_KEY=smokesmokesmokesmokesmokesmoke12 \
    -e SECRET_KEY=smokesmokesmokesmokesmokesmoke12 \
    node:22-alpine npx tsx "$probe" 2>&1 | grep -v "npm notice" || exit 1
done
