#!/usr/bin/env bash
# Bootstrap only a brand-new, empty PostgreSQL database. Historical Gafus
# migrations predate the repository's first complete schema snapshot, so they
# are not a clean-room replay. Existing environments MUST use migrate deploy.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "psql and node are required to verify that the target database is empty" >&2
  exit 1
fi

# Prisma recognises `schema=public`; libpq/psql does not. Preserve every other
# URI option (for example sslmode) while removing only Prisma's option.
psql_database_url="$(node -e '
  const value = process.env.DATABASE_URL;
  const url = new URL(value);
  url.searchParams.delete("schema");
  process.stdout.write(url.toString());
')"

relations="$(psql "$psql_database_url" -Atqc "
  SELECT count(*)
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
  UNION ALL
  SELECT count(*)
  FROM pg_catalog.pg_views
  WHERE schemaname = 'public';
")"

if [[ "$(awk '{ total += $1 } END { print total + 0 }' <<<"$relations")" != "0" ]]; then
  echo "Refusing to bootstrap a non-empty database. Use prisma migrate deploy for an existing environment." >&2
  exit 1
fi

pnpm --filter @gafus/prisma exec prisma db push --skip-generate

while IFS= read -r migration; do
  pnpm --filter @gafus/prisma exec prisma migrate resolve --applied "$migration" >/dev/null
done < <(find packages/prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

pnpm --filter @gafus/prisma exec prisma migrate status
echo "Fresh database bootstrapped and historical migrations baselined."
