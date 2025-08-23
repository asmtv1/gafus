#!/bin/bash

echo "🚀 БЫСТРЫЙ ТЕСТ DOCKER СБОРКИ WEB APP"
echo "======================================"
echo ""

# Проверяем Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker не запущен!"
    exit 1
fi

echo "🔍 Тестируем web app..."
echo "   Dockerfile: Dockerfile-web"
echo ""

# Собираем образ
if docker build -f Dockerfile-web -t test-web . --no-cache; then
    echo ""
    echo "✅ Web app: Docker сборка прошла успешно!"
    echo "   Теперь можно пушить в GitHub!"
    
    # Удаляем тестовый образ
    docker rmi test-web > /dev/null 2>&1
    echo "   🧹 Тестовый образ удален"
else
    echo ""
    echo "❌ Web app: Docker сборка упала!"
    echo "   Исправьте ошибки перед пушем!"
    exit 1
fi

echo ""
echo "💡 Используйте: ./scripts/test-web-docker.sh"
