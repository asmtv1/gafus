#!/bin/bash
# Полная очистка кэша и артефактов сборки.
# Освобождает ~20GB (.turbo ~16GB + .next ~4GB + dist, cache).

set -e
cd "$(dirname "$0")/.."

echo "🧹 Очищаем весь кэш и артефакты сборки..."

# 1. Turborepo — основной объём (~16GB)
if [ -d ".turbo" ]; then
  echo "  Удаляем .turbo..."
  rm -rf .turbo
  echo "  ✅ .turbo удалён"
fi

# 2. Next.js — билды и кэш во всех apps (~4GB)
for dir in apps/*/; do
  if [ -d "${dir}.next" ]; then
    echo "  Удаляем ${dir}.next..."
    rm -rf "${dir}.next"
    echo "  ✅ ${dir}.next удалён"
  fi
done

# 3. dist во всех packages и apps
for dir in apps/*/ packages/*/; do
  if [ -d "${dir}dist" ]; then
    echo "  Удаляем ${dir}dist..."
    rm -rf "${dir}dist"
    echo "  ✅ ${dir}dist удалён"
  fi
done

# 4. coverage
find . -maxdepth 4 -type d -name "coverage" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
echo "  ✅ coverage удалён"

# 5. Кэши линтеров/форматтеров
[ -f ".eslintcache" ] && rm -f .eslintcache && echo "  ✅ .eslintcache удалён"
[ -d ".prettier-cache" ] && rm -rf .prettier-cache && echo "  ✅ .prettier-cache удалён"

# 6. Временные и кэш-файлы
find . -name "*.tsbuildinfo" ! -path "*/node_modules/*" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true
[ -d ".cache" ] && rm -rf .cache && echo "  ✅ .cache удалён"

# 7. Очистка неиспользуемых пакетов в pnpm store
echo "  Очищаем pnpm store (prune)..."
pnpm store prune 2>/dev/null || true

echo ""
echo "✅ Кэш и артефакты очищены."
echo "💡 Ожидаемо освобождено ~20GB. Для сборки заново: pnpm build"


