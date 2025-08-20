#!/bin/bash

# Скрипт для локальной проверки типов, идентичной CI процессу
# Запускает те же команды, что и в .github/workflows/ci-cd.yml

set -e

echo "🔍 Запуск проверки типов (как в CI)..."
echo "=================================="

# Проверяем что мы в корне проекта
if [ ! -f "package.json" ] || [ ! -f "pnpm-lock.yaml" ]; then
    echo "❌ Ошибка: запустите скрипт из корня проекта"
    exit 1
fi

# Устанавливаем зависимости (как в CI)
echo "📦 Установка зависимостей..."
pnpm install

# Проверяем типы web приложения (как в CI)
echo "🌐 Проверка типов web приложения..."
cd apps/web
pnpm typecheck
cd ../..

# Проверяем типы trainer-panel (как в CI)
echo "👨‍🏫 Проверка типов trainer-panel..."
cd apps/trainer-panel
pnpm typecheck
cd ../..

# Проверяем типы error-dashboard (как в CI)
echo "📊 Проверка типов error-dashboard..."
cd apps/error-dashboard
pnpm typecheck
cd ../..

# Проверяем типы всех пакетов
echo "📦 Проверка типов всех пакетов..."
pnpm -r run typecheck

echo "=================================="
echo "✅ Проверка типов завершена успешно!"
echo "🎯 Теперь локальные настройки точно соответствуют CI"
