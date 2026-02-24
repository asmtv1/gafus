#!/usr/bin/env bash
# Замена "Подзовите {{petName}} по рабочей кличке" на "Подзовите {{petNameAcc}} по рабочей кличке" в БД
#
# Запуск на сервере (через Docker):
#   ssh -i ~/.ssh/gafus_server_key root@185.239.51.125
#   cd /root/gafus && git pull && chmod +x scripts/fix-petname-placeholder.sh && ./scripts/fix-petname-placeholder.sh
#
# Локально (если есть psql и DATABASE_URL):
#   source .env && ./scripts/fix-petname-placeholder.sh

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$ROOT_DIR/scripts/fix-petname-placeholder.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Файл не найден: $SQL_FILE"
  exit 1
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^gafus-postgres$'; then
  echo "Выполняю замену через Docker (gafus-postgres)..."
  docker exec -i gafus-postgres psql -U gafus -d gafus < "$SQL_FILE"
elif [ -n "$DATABASE_URL" ]; then
  echo "Выполняю замену через psql..."
  psql "$DATABASE_URL" -f "$SQL_FILE" --quiet
else
  echo "Запустите контейнер gafus-postgres или укажите DATABASE_URL."
  exit 1
fi
echo "Готово."
