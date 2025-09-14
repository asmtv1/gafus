#!/bin/bash

set -e

SCHEMA_PATH="packages/prisma/schema.prisma"

echo "🧹 Очищаем кэш Prisma и переустанавливаем зависимости..."
rm -rf packages/prisma/node_modules/.prisma
pnpm install

echo "🔥 Удаляем миграции..."
rm -rf packages/prisma/migrations

echo "💥 Сбрасываем базу данных..."
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="User explicitly consented to reset development database" DATABASE_URL="postgresql://gafus:gafus_password@localhost:5432/gafus" pnpx prisma migrate reset --schema=$SCHEMA_PATH --force --skip-seed

echo "🛠️  Создаём новый мигрэйшн: init"
DATABASE_URL="postgresql://gafus:gafus_password@localhost:5432/gafus" pnpx prisma migrate dev --schema=$SCHEMA_PATH --name init

echo "🔄 Генерируем Prisma Client..."
cd packages/prisma && pnpm prisma generate && cd ../..

echo "🌱 Прогоняем сид-скрипт..."
DATABASE_URL="postgresql://gafus:gafus_password@localhost:5432/gafus" pnpm --filter @gafus/prisma db:seed

echo "🔧 Генерируем Prisma Client для всех пакетов..."
pnpm --filter @gafus/prisma db:generate

echo "✅ База данных полностью сброшена и готова."
echo "🚀 Теперь можно запускать: pnpm run build"

#запуск 
# chmod +x /reset-db.sh
# ./reset-db.sh