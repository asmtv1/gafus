#!/usr/bin/env bash
# Option A: only a NEW, completely empty, explicitly confirmed local PG DB.
# Existing, staging, remote and production databases are NOT supported.
# Source-locked SQL (including historic triggers and constraints) + official
# Prisma migrate resolve journal. No prisma db push or manual history inserts.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec node "$root/ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs" --apply
