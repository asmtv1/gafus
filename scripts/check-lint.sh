#!/bin/bash

echo "🔍 Проверяем ESLint во всем проекте..."
echo ""

# Проверяем все приложения
echo "📱 Приложения:"
cd apps/web && echo "  - Web: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем"
cd ../trainer-panel && echo "  - Trainer Panel: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем"
cd ../error-dashboard && echo "  - Error Dashboard: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем"
cd ../..

echo ""
echo "📦 Пакеты (если есть ESLint):"
cd packages/types && echo "  - Types: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Types: ESLint не настроен"
cd ../prisma && echo "  - Prisma: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Prisma: ESLint не настроен"
cd ../auth && echo "  - Auth: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Auth: ESLint не настроен"
cd ../csrf && echo "  - CSRF: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - CSRF: ESLint не настроен"
cd ../queues && echo "  - Queues: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Queues: ESLint не настроен"
cd ../swr && echo "  - SWR: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - SWR: ESLint не настроен"
cd ../worker && echo "  - Worker: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Worker: ESLint не настроен"
cd ../webpush && echo "  - WebPush: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - WebPush: ESLint не настроен"
cd ../ui-components && echo "  - UI Components: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - UI Components: ESLint не настроен"
cd ../error-handling && echo "  - Error Handling: $(pnpm lint 2>&1 | grep -c 'warning\|error\|Error' || echo '0') проблем" 2>/dev/null || echo "  - Error Handling: ESLint не настроен"
cd ../..

echo ""
echo "✅ Проверка ESLint завершена!"
