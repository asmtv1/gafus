#!/bin/bash

echo "🔍 Проверяем TypeScript типы во всем проекте..."
echo ""

# Проверяем все приложения
echo "📱 Приложения:"
cd apps/web && echo "  - Web: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../trainer-panel && echo "  - Trainer Panel: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../error-dashboard && echo "  - Error Dashboard: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../..

echo ""
echo "📦 Пакеты:"
cd packages/types && echo "  - Types: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../prisma && echo "  - Prisma: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../auth && echo "  - Auth: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../csrf && echo "  - CSRF: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../queues && echo "  - Queues: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../swr && echo "  - SWR: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../worker && echo "  - Worker: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../webpush && echo "  - WebPush: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../ui-components && echo "  - UI Components: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../error-handling && echo "  - Error Handling: $(pnpm typecheck 2>&1 | grep -c 'error\|Error' || echo '0') ошибок"
cd ../..

echo ""
echo "✅ Проверка завершена!"
