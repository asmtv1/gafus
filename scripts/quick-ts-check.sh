#!/bin/bash

echo "🔍 БЫСТРАЯ ПРОВЕРКА TYPESCRIPT ОШИБОК"
echo "====================================="
echo ""

# Проверяем web app
echo "📱 Web app:"
cd apps/web
if pnpm typecheck > /dev/null 2>&1; then
    echo "   ✅ TypeScript - OK"
else
    echo "   ❌ TypeScript - ошибки!"
    echo "   Запустите: cd apps/web && pnpm typecheck"
    exit 1
fi

echo ""
echo "✅ Все TypeScript ошибки исправлены!"
echo "   Теперь можно пушить в GitHub!"
