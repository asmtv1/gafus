#!/usr/bin/env bash
# Manual image/deploy workflows must never apply a breaking migration with
# the legacy "docker-compose down" path. The coordinated main CI owns schema.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
[[ -d packages/prisma/migrations ]] || { echo 'Prisma migration directory missing' >&2; exit 1; }
local_migrations="$(mktemp)"
applied_migrations="$(mktemp)"
trap 'rm -f "$local_migrations" "$applied_migrations"' EXIT
find packages/prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql \
  | sed -E 's@.*/([^/]+)/migration.sql@\1@' | LC_ALL=C sort -u > "$local_migrations"
docker exec gafus-postgres psql -X -Atq -v ON_ERROR_STOP=1 -U gafus -d gafus \
  -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name' \
  | LC_ALL=C sort -u > "$applied_migrations"
pending="$(comm -23 "$local_migrations" "$applied_migrations")"
if [[ -n "$pending" ]]; then
  echo 'BLOCKED: manual container deployment would encounter pending Prisma migrations:'
  printf '%s\n' "$pending"
  echo 'Use the coordinated main CI deployment (maintenance -> stop all app writers -> backup -> migrate -> new containers).'
  exit 1
fi
echo 'Manual container deployment: no pending local Prisma migrations.'
