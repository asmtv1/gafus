#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# .env имеет приоритет, иначе — дефолтное подключение к локальной БД
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | grep -v '^$' | xargs)
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:1488@localhost:5432/dog_trainer}"

echo "🔄 Применяем миграции..."
cd "$ROOT_DIR/packages/prisma" && DATABASE_URL="$DATABASE_URL" pnpm db:migrate:deploy

echo "✅ Миграции применены успешно!"

