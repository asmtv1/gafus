#!/bin/bash

echo "🔍 Проверяю статус приложений..."
echo ""

# Проверяем web приложение
echo "📱 Web приложение (порт 3002):"
if curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo "✅ Работает на http://localhost:3002"
else
    echo "❌ Не отвечает на http://localhost:3002"
fi

# Проверяем error-dashboard
echo ""
echo "🚨 Error Dashboard (порт 3003):"
if curl -s http://localhost:3003 > /dev/null 2>&1; then
    echo "✅ Работает на http://localhost:3003"
else
    echo "❌ Не отвечает на http://localhost:3003"
fi

# Проверяем trainer-panel
echo ""
echo "👨‍🏫 Trainer Panel (порт 3004):"
if curl -s http://localhost:3004 > /dev/null 2>&1; then
    echo "✅ Работает на http://localhost:3004"
else
    echo "❌ Не отвечает на http://localhost:3004"
fi

# Проверяем errors.gafus.localhost
echo ""
echo "🌐 Errors.gafus.localhost:"
if curl -s http://errors.gafus.localhost > /dev/null 2>&1; then
    echo "✅ Работает на http://errors.gafus.localhost"
else
    echo "❌ Не отвечает на http://errors.gafus.localhost"
fi

echo ""
echo "🔍 Процессы Next.js:"
ps aux | grep "next dev" | grep -v grep || echo "❌ Процессы Next.js не найдены"

echo ""
echo "💡 Для перезапуска используйте: ./scripts/restart-apps.sh"
