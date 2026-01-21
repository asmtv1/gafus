#!/bin/bash

# Скрипт для тестирования API endpoints на продакшн
# Использование: ./scripts/test-api-auth.sh [URL]
# По умолчанию: https://api.gafus.ru

API_URL="${1:-https://api.gafus.ru}"

echo "🔍 Тестирование API: $API_URL"
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Проверка health endpoint
echo "1️⃣  Проверка /health..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" --max-time 10 "$API_URL/health" 2>&1)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n2 | head -n1)
TIME_TOTAL=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | sed '$d' | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Health check passed (${TIME_TOTAL}s)${NC}"
  echo "Response: $BODY"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}✗ Не удалось подключиться к серверу${NC}"
  HOST_FOR_PING=$(echo "$API_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  echo "Проверьте:"
  echo "  - Доступен ли сервер: ping $HOST_FOR_PING"
  echo "  - Правильность URL: $API_URL"
  echo "  - Настройки сети и firewall"
  if echo "$HEALTH_RESPONSE" | grep -qi "SSL\|certificate"; then
    echo "  - Проблемы с SSL сертификатом (попробуйте: curl -k $API_URL/health)"
  fi
  if echo "$HEALTH_RESPONSE" | grep -qi "timeout\|timed out"; then
    echo "  - Таймаут подключения (сервер может быть перегружен)"
  fi
else
  echo -e "${RED}✗ Health check failed (HTTP $HTTP_CODE)${NC}"
  echo "Response: $BODY"
fi
echo ""

# 2. Проверка ready endpoint
echo "2️⃣  Проверка /ready..."
READY_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "$API_URL/ready" 2>&1)
HTTP_CODE=$(echo "$READY_RESPONSE" | tail -n1)
BODY=$(echo "$READY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Ready check passed${NC}"
  echo "Response: $BODY"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}✗ Не удалось подключиться${NC}"
else
  echo -e "${YELLOW}⚠ Ready check returned HTTP $HTTP_CODE${NC}"
  echo "Response: $BODY"
fi
echo ""

# 3. Тест login endpoint (с неверными данными - ожидаем 401)
echo "3️⃣  Тест /api/v1/auth/login (неверные данные)..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"wrong"}' 2>&1)
HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✓ Login endpoint работает правильно (вернул 401)${NC}"
  echo "Response: $BODY"
elif [ "$HTTP_CODE" = "429" ]; then
  echo -e "${YELLOW}⚠ Rate limit (429) - слишком много запросов${NC}"
  echo "Response: $BODY"
elif [ "$HTTP_CODE" = "000" ]; then
  echo -e "${RED}✗ Не удалось подключиться к серверу${NC}"
else
  echo -e "${YELLOW}⚠ Неожиданный HTTP код: $HTTP_CODE${NC}"
  echo "Response: $BODY"
fi
echo ""

# 4. Проверка CORS headers
echo "4️⃣  Проверка CORS headers..."
CORS_RESPONSE=$(curl -s -I --max-time 10 -X OPTIONS "$API_URL/api/v1/auth/login" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" 2>&1)
ACCESS_CONTROL=$(echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" || echo "Not found")

if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
  echo -e "${GREEN}✓ CORS настроен${NC}"
  echo "$ACCESS_CONTROL"
elif echo "$CORS_RESPONSE" | grep -q "000"; then
  echo -e "${RED}✗ Не удалось подключиться${NC}"
else
  echo -e "${YELLOW}⚠ CORS headers не найдены${NC}"
fi
echo ""

# 5. Базовая проверка доступности сервера
echo "5️⃣  Проверка доступности сервера..."
# Извлекаем хост из URL (убираем протокол и путь)
HOST=$(echo "$API_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
if [ -n "$HOST" ] && [ "$HOST" != "https:" ] && [ "$HOST" != "http:" ]; then
  if ping -c 1 -W 2 "$HOST" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Сервер доступен (ping успешен)${NC}"
  else
    echo -e "${YELLOW}⚠ Ping не прошел (возможно, ping заблокирован или сервер недоступен)${NC}"
    echo "Хост: $HOST"
  fi
  
  # Проверка порта 443 (HTTPS)
  echo "   Проверка порта 443 (HTTPS)..."
  if nc -z -v -G 2 "$HOST" 443 > /dev/null 2>&1 || timeout 2 bash -c "echo > /dev/tcp/$HOST/443" 2>/dev/null; then
    echo -e "   ${GREEN}✓ Порт 443 открыт${NC}"
  else
    echo -e "   ${YELLOW}⚠ Порт 443 недоступен или закрыт${NC}"
  fi
  
  # Проверка SSL сертификата
  echo "   Проверка SSL сертификата..."
  if command -v openssl > /dev/null 2>&1; then
    SSL_OUTPUT=$(echo | timeout 10 openssl s_client -connect "$HOST:443" -servername "$HOST" 2>&1)
    VERIFY_CODE=$(echo "$SSL_OUTPUT" | grep "Verify return code" | head -1)
    CERT_SUBJECT=$(echo "$SSL_OUTPUT" | grep "subject=" | head -1)
    CERT_ISSUER=$(echo "$SSL_OUTPUT" | grep "issuer=" | head -1)
    
    if echo "$VERIFY_CODE" | grep -q "Verify return code: 0"; then
      echo -e "   ${GREEN}✓ SSL сертификат валиден${NC}"
      if [ -n "$CERT_SUBJECT" ]; then
        echo "   Subject: $CERT_SUBJECT"
      fi
      if [ -n "$CERT_ISSUER" ]; then
        echo "   Issuer: $CERT_ISSUER"
      fi
    elif [ -n "$VERIFY_CODE" ]; then
      echo -e "   ${RED}✗ Проблема с SSL сертификатом${NC}"
      echo "   $VERIFY_CODE"
      if echo "$VERIFY_CODE" | grep -q "self signed"; then
        echo -e "   ${YELLOW}⚠ Сертификат самоподписанный${NC}"
      elif echo "$VERIFY_CODE" | grep -q "unable to get local issuer"; then
        echo -e "   ${YELLOW}⚠ Неполная цепочка сертификатов (промежуточные сертификаты отсутствуют)${NC}"
      elif echo "$VERIFY_CODE" | grep -q "certificate has expired"; then
        echo -e "   ${RED}✗ Сертификат истёк${NC}"
      elif echo "$VERIFY_CODE" | grep -q "hostname mismatch"; then
        echo -e "   ${RED}✗ Несоответствие имени хоста в сертификате${NC}"
      fi
      if [ -n "$CERT_SUBJECT" ]; then
        echo "   Subject: $CERT_SUBJECT"
      fi
    else
      echo -e "   ${YELLOW}⚠ Не удалось проверить SSL (таймаут или ошибка подключения)${NC}"
    fi
  else
    echo -e "   ${YELLOW}⚠ openssl не установлен, пропускаем проверку SSL${NC}"
  fi
  
  # Детальная проверка curl с verbose
  echo "   Детальная диагностика curl..."
  CURL_VERBOSE=$(curl -v --max-time 5 --connect-timeout 3 "$API_URL/health" 2>&1)
  if echo "$CURL_VERBOSE" | grep -q "< HTTP"; then
    HTTP_VERSION=$(echo "$CURL_VERBOSE" | grep "< HTTP" | head -1)
    echo -e "   ${GREEN}✓ Удалось установить HTTP соединение${NC}"
    echo "   $HTTP_VERSION"
  elif echo "$CURL_VERBOSE" | grep -qi "SSL\|TLS\|certificate\|handshake"; then
    SSL_ERROR=$(echo "$CURL_VERBOSE" | grep -iE "SSL|TLS|certificate|handshake|error" | head -5)
    echo -e "   ${RED}✗ Проблема с SSL/TLS handshake${NC}"
    echo "$SSL_ERROR"
    echo ""
    echo "   Попытка подключения без проверки SSL (-k)..."
    CURL_INSECURE=$(curl -k -s -w "\n%{http_code}" --max-time 5 "$API_URL/health" 2>&1)
    INSECURE_CODE=$(echo "$CURL_INSECURE" | tail -n1)
    if [ "$INSECURE_CODE" = "200" ]; then
      echo -e "   ${GREEN}✓ С -k флагом подключение работает!${NC}"
      echo -e "   ${YELLOW}⚠ Проблема в SSL сертификате или его проверке${NC}"
    else
      echo -e "   ${RED}✗ Даже с -k флагом не работает (HTTP $INSECURE_CODE)${NC}"
    fi
  elif echo "$CURL_VERBOSE" | grep -qi "resolve\|DNS\|could not resolve"; then
    DNS_ERROR=$(echo "$CURL_VERBOSE" | grep -iE "resolve|DNS|could not" | head -2)
    echo -e "   ${RED}✗ Проблема с DNS${NC}"
    echo "$DNS_ERROR"
  elif echo "$CURL_VERBOSE" | grep -qi "timeout\|timed out\|Connection timed out"; then
    echo -e "   ${RED}✗ Таймаут подключения${NC}"
  elif echo "$CURL_VERBOSE" | grep -qi "Connection refused\|connection refused"; then
    echo -e "   ${RED}✗ Соединение отклонено (сервер не принимает подключения)${NC}"
  else
    echo -e "   ${YELLOW}⚠ Неизвестная ошибка подключения${NC}"
    ERROR_LINES=$(echo "$CURL_VERBOSE" | grep -iE "error|fail|unable|curl:" | head -5)
    if [ -n "$ERROR_LINES" ]; then
      echo "$ERROR_LINES"
    else
      echo "Последние строки вывода:"
      echo "$CURL_VERBOSE" | tail -5
    fi
  fi
else
  echo -e "${YELLOW}⚠ Не удалось извлечь хост из URL${NC}"
  echo "URL: $API_URL"
fi
echo ""

echo "✅ Тестирование завершено"
echo ""
echo "💡 Полезные команды для проверки API:"
echo ""
echo "1. Проверка health:"
echo "   curl $API_URL/health"
echo ""
echo "2. Проверка ready (БД + Redis):"
echo "   curl $API_URL/ready"
echo ""
echo "3. Тест login с реальными данными:"
echo "   curl -X POST $API_URL/api/v1/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}'"
echo ""
echo "4. Проверка ответа с подробностями (verbose):"
echo "   curl -v -X POST $API_URL/api/v1/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"test\",\"password\":\"wrong\"}'"
echo ""
echo "5. Проверка только подключения (без проверки SSL):"
echo "   curl -k $API_URL/health"
echo ""
echo "6. Проверка с таймаутом и выводом ошибок:"
echo "   curl --max-time 10 --connect-timeout 5 -v $API_URL/health"
echo ""
echo "7. Проверка SSL сертификата (детально):"
echo "   echo | openssl s_client -connect api.gafus.ru:443 -servername api.gafus.ru | grep -E 'Verify return code|subject=|issuer='"
echo ""
echo "8. Проверка с игнорированием SSL (если проблема в сертификате):"
echo "   curl -k https://api.gafus.ru/health"
echo ""
echo "9. Проверка порта 443:"
echo "   nc -zv api.gafus.ru 443"
echo "   # или"
echo "   timeout 2 bash -c 'echo > /dev/tcp/api.gafus.ru/443' && echo 'Порт открыт'"
