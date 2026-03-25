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

# 4. Turbo в пакетах (остатки локального кэша задач)
for d in apps/*/.turbo packages/*/.turbo; do
  if [ -d "$d" ]; then
    echo "  Удаляем $d..."
    rm -rf "$d"
  fi
done

# 5. Мобильное приложение: Expo, CocoaPods, локальные .aab/.ipa/.apk, Android build
MOBILE="apps/mobile"
if [ -d "$MOBILE/.expo" ]; then
  echo "  Удаляем $MOBILE/.expo..."
  rm -rf "$MOBILE/.expo"
  echo "  ✅ $MOBILE/.expo удалён"
fi
if [ -d "$MOBILE/ios/Pods" ]; then
  echo "  Удаляем $MOBILE/ios/Pods..."
  rm -rf "$MOBILE/ios/Pods"
  echo "  ✅ $MOBILE/ios/Pods удалён (при необходимости: cd $MOBILE/ios && pod install)"
fi
mob_bins=$(find "$MOBILE" -maxdepth 1 -type f \( -name "*.aab" -o -name "*.ipa" -o -name "*.apk" \) 2>/dev/null | wc -l | tr -d "[:space:]")
if [ "${mob_bins:-0}" -gt 0 ]; then
  find "$MOBILE" -maxdepth 1 -type f \( -name "*.aab" -o -name "*.ipa" -o -name "*.apk" \) -delete
  echo "  ✅ локальные .aab/.ipa/.apk в $MOBILE удалены"
fi
for android_build in "$MOBILE/android/app/build" "$MOBILE/android/build"; do
  if [ -d "$android_build" ]; then
    echo "  Удаляем $android_build..."
    rm -rf "$android_build"
    echo "  ✅ $android_build удалён"
  fi
done

# 6. coverage
find . -maxdepth 4 -type d -name "coverage" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
echo "  ✅ coverage удалён"

# 7. Кэши линтеров/форматтеров
[ -f ".eslintcache" ] && rm -f .eslintcache && echo "  ✅ .eslintcache удалён"
[ -d ".prettier-cache" ] && rm -rf .prettier-cache && echo "  ✅ .prettier-cache удалён"

# 8. Временные и кэш-файлы
find . -name "*.tsbuildinfo" ! -path "*/node_modules/*" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true
[ -d ".cache" ] && rm -rf .cache && echo "  ✅ .cache удалён"

# 9. Очистка неиспользуемых пакетов в pnpm store
echo "  Очищаем pnpm store (prune)..."
pnpm store prune 2>/dev/null || true

echo ""
echo "✅ Кэш и артефакты очищены."
echo "💡 Ожидаемо освобождено ~20GB. Для сборки заново: pnpm build"


