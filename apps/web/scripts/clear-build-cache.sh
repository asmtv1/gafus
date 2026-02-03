#!/bin/bash
# Скрипт для очистки кеша билда Next.js при проблемах с Server Actions

set -e

echo "🧹 Очистка кеша Next.js..."

# Директория с приложением
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$APP_DIR"

# Удаляем .next
if [ -d ".next" ]; then
  echo "  📦 Удаляем .next..."
  rm -rf .next
fi

# Удаляем node_modules/.cache
if [ -d "node_modules/.cache" ]; then
  echo "  📦 Удаляем node_modules/.cache..."
  rm -rf node_modules/.cache
fi

# Удаляем .turbo
if [ -d ".turbo" ]; then
  echo "  📦 Удаляем .turbo..."
  rm -rf .turbo
fi

echo "✅ Кеш очищен"
echo ""
echo "Теперь выполните:"
echo "  pnpm build"
echo "  или"
echo "  pnpm dev"
