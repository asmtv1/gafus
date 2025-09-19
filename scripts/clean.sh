#!/bin/bash

echo "🧹 Удаляем node_modules, dist, .turbo, .next, lock-файлы, prisma-client..."

rm -rf node_modules
rm -f pnpm-lock.yaml
rm -rf .turbo .next dist
rm -rf generated/prisma-client

# Дополнительная очистка
rm -rf .env.local.backup
rm -rf .env.backup
rm -rf *.log
rm -rf logs/
rm -rf tmp/
rm -rf temp/

# Удаляем в apps/ и packages/
for dir in packages apps; do
  if [ -d "$dir" ]; then
    find "$dir" -type d \( -name "node_modules" -o -name "dist" -o -name ".turbo" -o -name ".next" -o -name "build" -o -name ".cache" -o -name "coverage" \) -exec rm -rf {} +
    find "$dir" -name "*.log" -delete
    find "$dir" -name "*.tsbuildinfo" -delete
    find "$dir" -name ".DS_Store" -delete
  fi
done

# Чистим кеш pnpm
pnpm store prune

# Очищаем системные файлы
rm -rf .DS_Store
rm -rf Thumbs.db
rm -rf desktop.ini

echo "✅ Всё очищено. Запусти заново:"
echo "   pnpm install && pnpm build"


#запуск 
# chmod +x clean.sh                                                                   
# ./clean.sh