#!/bin/bash

echo "🔄 Останавливаю все процессы Next.js..."
pkill -f "next dev" || true
pkill -f "next start" || true

echo "🧹 Очищаю кэш Next.js..."
cd apps/web && rm -rf .next && echo "✅ Кэш web очищен"
cd ../error-dashboard && rm -rf .next && echo "✅ Кэш error-dashboard очищен"
cd ../trainer-panel && rm -rf .next && echo "✅ Кэш trainer-panel очищен"

echo "🔨 Пересобираю приложения..."
cd ../web && npm run build && echo "✅ web пересобран"
cd ../error-dashboard && npm run build && echo "✅ error-dashboard пересобран"
cd ../trainer-panel && npm run build && echo "✅ trainer-panel пересобран"

echo "🚀 Запускаю приложения в фоне..."
cd ../web && npm run dev &
WEB_PID=$!
echo "📱 web запущен с PID: $WEB_PID"

cd ../error-dashboard && npm run dev &
ERROR_PID=$!
echo "🚨 error-dashboard запущен с PID: $ERROR_PID"

cd ../trainer-panel && npm run dev &
TRAINER_PID=$!
echo "👨‍🏫 trainer-panel запущен с PID: $TRAINER_PID"

echo "✅ Все приложения перезапущены!"
echo "📱 web: http://localhost:3002 (PID: $WEB_PID)"
echo "🚨 error-dashboard: http://localhost:3003 (PID: $ERROR_PID)"
echo "👨‍🏫 trainer-panel: http://localhost:3004 (PID: $TRAINER_PID)"
echo "🌐 errors.gafus.localhost: http://errors.gafus.localhost"

echo ""
echo "💡 Для остановки всех приложений выполните: pkill -f 'next dev'"
echo "💡 Для просмотра логов используйте: tail -f apps/*/logs/*.log"
