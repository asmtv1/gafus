#!/bin/bash

# Скрипт для импорта дашбордов Seq через API

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка переменных окружения
if [ -z "$SEQ_URL" ]; then
  echo -e "${RED}❌ SEQ_URL не установлена${NC}"
  echo "Использование: SEQ_URL=http://localhost:5341 SEQ_API_KEY=your-key ./scripts/import-seq-dashboards.sh"
  exit 1
fi

if [ -z "$SEQ_API_KEY" ]; then
  echo -e "${YELLOW}⚠️  SEQ_API_KEY не установлена${NC}"
  echo "Попытка импорта без авторизации..."
fi

DASHBOARDS_DIR="ci-cd/docker/seq/dashboards"

if [ ! -d "$DASHBOARDS_DIR" ]; then
  echo -e "${RED}❌ Директория $DASHBOARDS_DIR не найдена${NC}"
  exit 1
fi

echo -e "${GREEN}🚀 Импорт дашбордов Seq${NC}"
echo "📍 Seq URL: $SEQ_URL"
echo ""

# Проверка доступности Seq
echo -e "${YELLOW}🔍 Проверка доступности Seq...${NC}"
if curl -s -f -o /dev/null "$SEQ_URL/api/signals" -H "X-Seq-ApiKey: $SEQ_API_KEY" 2>/dev/null; then
  echo -e "${GREEN}✅ Seq доступен${NC}"
else
  echo -e "${RED}❌ Seq недоступен или API ключ неверный${NC}"
  exit 1
fi

echo ""

# Импорт каждого дашборда
SUCCESS=0
FAILED=0

for file in "$DASHBOARDS_DIR"/*.json; do
  if [ ! -f "$file" ]; then
    continue
  fi

  filename=$(basename "$file")
  dashboard_name=$(cat "$file" | grep -o '"Title": "[^"]*' | cut -d'"' -f4)

  echo -e "${YELLOW}📊 Импорт: $dashboard_name${NC}"

  response=$(curl -s -w "\n%{http_code}" -X POST "$SEQ_URL/api/dashboards" \
    -H "Content-Type: application/json" \
    -H "X-Seq-ApiKey: $SEQ_API_KEY" \
    -d @"$file")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 201 ] || [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}   ✅ Успешно импортирован${NC}"
    SUCCESS=$((SUCCESS + 1))
  else
    echo -e "${RED}   ❌ Ошибка (HTTP $http_code)${NC}"
    echo "   Ответ: $body"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo -e "${GREEN}✅ Успешно: $SUCCESS${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Ошибок: $FAILED${NC}"
fi

if [ $FAILED -gt 0 ]; then
  exit 1
fi
