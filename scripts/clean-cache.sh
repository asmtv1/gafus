#!/bin/bash

echo "🧹 Очищаем кэш проекта (без удаления node_modules и .next)..."

# Очищаем кэш Turborepo (основной источник размера)
if [ -d ".turbo" ]; then
  echo "  Удаляем .turbo кэш..."
  rm -rf .turbo
  echo "  ✅ .turbo очищен"
fi

# Очищаем кэш Next.js внутри .next папок (но не сами .next)
for dir in apps/*; do
  if [ -d "$dir/.next/cache" ]; then
    echo "  Очищаем кэш Next.js в $dir..."
    rm -rf "$dir/.next/cache"
    echo "  ✅ Кэш Next.js очищен в $dir"
  fi
done

# Очищаем кэш ESLint
if [ -f ".eslintcache" ]; then
  echo "  Удаляем .eslintcache..."
  rm -f .eslintcache
  echo "  ✅ .eslintcache удален"
fi

# Очищаем кэш Prettier
if [ -d ".prettier-cache" ]; then
  echo "  Удаляем .prettier-cache..."
  rm -rf .prettier-cache
  echo "  ✅ .prettier-cache удален"
fi

# Очищаем кэш pnpm (опционально, но безопасно)
echo "  Очищаем неиспользуемые пакеты из pnpm store..."
pnpm store prune

# Очищаем временные файлы
echo "  Удаляем временные файлы..."
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete 2>/dev/null
find . -name ".DS_Store" -delete 2>/dev/null

echo ""
echo "✅ Кэш очищен!"
echo ""
echo "💡 Размер проекта должен уменьшиться примерно на 9-10GB"
echo "💡 При следующей сборке кэш пересоздастся автоматически"


