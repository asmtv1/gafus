#!/bin/bash

echo "🔍 ТЕСТИРУЕМ СБОРКУ В DOCKER-ПОДОБНОМ ОКРУЖЕНИИ"
echo "================================================"
echo ""

# Проверяем, что мы в корне проекта
if [ ! -f "pnpm-workspace.yaml" ]; then
    echo "❌ Запустите скрипт из корня проекта!"
    exit 1
fi

echo "✅ Находимся в корне проекта"
echo ""

# Функция для тестирования приложения
test_app_build() {
    local app_name=$1
    local app_path=$2
    
    echo "🔍 Тестируем $app_name..."
    echo "   Путь: $app_path"
    
    # Переходим в директорию приложения
    cd "$app_path" || {
        echo "   ❌ Не удалось перейти в $app_path"
        return 1
    }
    
    # Проверяем TypeScript
    echo "   📘 Проверяем TypeScript..."
    if pnpm typecheck > /dev/null 2>&1; then
        echo "   ✅ TypeScript - OK"
    else
        echo "   ❌ TypeScript - ошибки!"
        echo "   Запустите: cd $app_path && pnpm typecheck"
        cd ../..
        return 1
    fi
    
    # Пытаемся собрать
    echo "   🏗️  Пытаемся собрать..."
    if pnpm build > /dev/null 2>&1; then
        echo "   ✅ Сборка - OK"
        cd ../..
        return 0
    else
        echo "   ❌ Сборка - ошибки!"
        echo "   Запустите: cd $app_path && pnpm build"
        cd ../..
        return 1
    fi
}

# Тестируем все приложения
echo "📦 Тестируем приложения:"
echo ""

failed_builds=0

# Web app
if test_app_build "web" "apps/web"; then
    echo "   ✅ Web app - OK"
else
    echo "   ❌ Web app - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""

# Trainer Panel
if test_app_build "trainer-panel" "apps/trainer-panel"; then
    echo "   ✅ Trainer Panel - OK"
else
    echo "   ❌ Trainer Panel - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""

# Error Dashboard
if test_app_build "error-dashboard" "apps/error-dashboard"; then
    echo "   ✅ Error Dashboard - OK"
else
    echo "   ❌ Error Dashboard - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""
echo "================================================"

if [ $failed_builds -eq 0 ]; then
    echo "🎉 ВСЕ ПРИЛОЖЕНИЯ СБИРАЮТСЯ УСПЕШНО!"
    echo "   Теперь можно пушить в GitHub!"
else
    echo "💥 $failed_builds из 3 приложений не собираются!"
    echo "   Исправьте ошибки перед пушем!"
fi

echo ""
echo "💡 Используйте: ./scripts/test-build-env.sh"
