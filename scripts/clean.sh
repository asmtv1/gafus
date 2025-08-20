#!/bin/bash

echo "🧹 Удаляем node_modules, dist, .turbo, .next, lock-файлы, prisma-client..."

rm -rf node_modules
rm -f pnpm-lock.yaml
rm -rf .turbo .next dist
rm -rf generated/prisma-client

# Удаляем в apps/ и packages/
for dir in packages apps; do
  if [ -d "$dir" ]; then
    find "$dir" -type d \( -name "node_modules" -o -name "dist" -o -name ".turbo" -o -name ".next" \) -exec rm -rf {} +
  fi
done

# Чистим кеш pnpm
pnpm store prune

echo "✅ Всё очищено. Запусти заново:"
echo "   pnpm install && pnpm build"


#запуск 
# chmod +x clean.sh                                                                   
# ./clean.sh