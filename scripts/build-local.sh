#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm --filter @gafus/prisma db:generate
pnpm -r --if-present run build
node scripts/check-builds.js
