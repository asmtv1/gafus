#!/bin/bash

echo "🐳 ТЕСТИРУЕМ DOCKER СБОРКУ ЛОКАЛЬНО"
echo "=================================="
echo ""

# Проверяем, что Docker запущен
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker не запущен! Запустите Docker Desktop"
    exit 1
fi

echo "✅ Docker запущен"
echo ""

# Функция для тестирования Dockerfile
test_dockerfile() {
    local dockerfile=$1
    local app_name=$2
    
    echo "🔍 Тестируем $app_name..."
    echo "   Dockerfile: $dockerfile"
    
    # Собираем образ локально (без push)
    if docker build -f "$dockerfile" -t "test-$app_name" . --no-cache; then
        echo "✅ $app_name: Docker сборка прошла успешно!"
        # Удаляем тестовый образ
        docker rmi "test-$app_name" > /dev/null 2>&1
        return 0
    else
        echo "❌ $app_name: Docker сборка упала!"
        return 1
    fi
}

# Тестируем все Dockerfile'ы
echo "📦 Тестируем приложения:"
echo ""

failed_builds=0

# Web app
if test_dockerfile "Dockerfile-web" "web"; then
    echo "   ✅ Web app - OK"
else
    echo "   ❌ Web app - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""

# Trainer Panel
if test_dockerfile "Dockerfile-trainer-panel" "trainer-panel"; then
    echo "   ✅ Trainer Panel - OK"
else
    echo "   ❌ Trainer Panel - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""

# Error Dashboard
if test_dockerfile "Dockerfile-error-dashboard" "error-dashboard"; then
    echo "   ✅ Error Dashboard - OK"
else
    echo "   ❌ Error Dashboard - FAILED"
    failed_builds=$((failed_builds + 1))
fi

echo ""
echo "=================================="

if [ $failed_builds -eq 0 ]; then
    echo "🎉 ВСЕ DOCKER СБОРКИ ПРОШЛИ УСПЕШНО!"
    echo "   Теперь можно пушить в GitHub!"
else
    echo "💥 $failed_builds из 3 сборок упали!"
    echo "   Исправьте ошибки перед пушем!"
fi

echo ""
echo "💡 Используйте: ./scripts/test-docker-build.sh"
