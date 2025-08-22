#!/bin/bash

echo "🔍 ПОЛНАЯ ПРОВЕРКА ПРОЕКТА"
echo "=========================="
echo ""

# Проверяем TypeScript
echo "📘 TypeScript проверка:"
./scripts/check-types.sh

echo ""
echo "=========================="
echo ""

# Проверяем ESLint
echo "📋 ESLint проверка:"
./scripts/check-lint.sh

echo ""
echo "=========================="
echo "🎯 ИТОГО:"
echo "  - TypeScript: $(./scripts/check-types.sh 2>/dev/null | grep -E 'ошибок|error' | grep -o '[0-9]\+' | awk '{sum+=$1} END {print sum+0}') ошибок"
echo "  - ESLint: $(./scripts/check-lint.sh 2>/dev/null | grep -E 'проблем|warning' | grep -o '[0-9]\+' | awk '{sum+=$1} END {print sum+0}') проблем"
echo ""
echo "✅ Полная проверка завершена!"
