#!/bin/bash
# Импорт дашбордов Grafana в Yandex Cloud Monitoring
# Требования: Python 3, yc CLI (настроен), curl, jq

set -e

FOLDER_ID="${FOLDER_ID:-b1g0vbm2pvav4oqc4ds9}"
PROMETHEUS_DS_ID="${PROMETHEUS_DS_ID:-fbe681839dit4q6504um}"
WORKSPACE_ID="${WORKSPACE_ID:-monn9k9fdti7o4qa45m1}"
DASHBOARDS_DIR="ci-cd/docker/grafana/dashboards"
IMPORTER_DIR="${IMPORTER_DIR:-/tmp/yc-dashboard-importer}"
OUTPUT_DIR="/tmp/yandex-dashboards"
API_BASE="https://monitoring.api.cloud.yandex.net"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📋 Параметры:"
echo "  FOLDER_ID=$FOLDER_ID"
echo "  PROMETHEUS_DS_ID=$PROMETHEUS_DS_ID"
echo "  WORKSPACE_ID=$WORKSPACE_ID"
echo ""

# Проверка yc
if ! command -v yc &>/dev/null; then
  echo "❌ yc CLI не найден. Установите: https://cloud.yandex.ru/docs/cli/quickstart"
  exit 1
fi

# Получение IAM token
echo "🔐 Получение IAM token..."
IAM_TOKEN=$(yc iam create-token 2>/dev/null) || {
  echo "❌ Не удалось получить IAM token. Выполните: yc init"
  exit 1
}

# Клонирование importer при необходимости
if [ ! -d "$IMPORTER_DIR" ]; then
  echo "📥 Клонирование yc-monitoring-dashboard-importer..."
  git clone --depth 1 https://github.com/yandex-cloud-examples/yc-monitoring-dashboard-importer.git "$IMPORTER_DIR"
fi

mkdir -p "$OUTPUT_DIR"

# Конвертация и загрузка каждого дашборда
DASHBOARDS="overview system-metrics postgres-metrics redis-metrics services-availability bullmq-queues"
SUCCESS=0
FAILED=0

for name in $DASHBOARDS; do
  src="$DASHBOARDS_DIR/${name}.json"
  out="$OUTPUT_DIR/${name}.json"

  if [ ! -f "$src" ]; then
    echo "⏭️  Пропуск $name (файл не найден)"
    continue
  fi

  echo ""
  echo "📊 Обработка: $name"

  # Конвертация Grafana → Yandex format (из директории importer для import monitoring_dashboard)
  if ! (cd "$IMPORTER_DIR" && python3 dashboard.py \
    -f "$FOLDER_ID" \
    -p "$PROMETHEUS_DS_ID" \
    -w "$WORKSPACE_ID" \
    -i "$PROJECT_ROOT/$src" \
    -s "$out" 2>/dev/null); then
    echo "  ❌ Ошибка конвертации"
    ((FAILED++)) || true
    continue
  fi

  [ ! -f "$out" ] && { echo "  ❌ Файл не создан"; ((FAILED++)) || true; continue; }

  # Преобразование в формат CreateDashboardRequest (folder_id, snake_case)
  # name должен быть [a-z][-a-z0-9]* (латиница), иначе API вернёт ошибку
  SAFE_NAME=$(echo "$name" | tr '_' '-')
  # Убрать поле "widget" из каждого виджета (proto oneof использует multi_source_chart, chart и т.д.)
  REQUEST=$(jq -c --arg safe_name "$SAFE_NAME" '
    .widgets |= map(del(.widget))
    | {
      folder_id: .folderId,
      name: $safe_name,
      description: (.description // "Imported from Grafana"),
      title: .title,
      labels: (.labels // {}),
      widgets: .widgets,
      parametrization: (.parametrization // {})
    }
  ' "$out")

  # Загрузка через gRPC (grpcurl)
  CLOUDAPI="${CLOUDAPI:-/tmp/cloudapi}"
  if [ ! -d "$CLOUDAPI" ]; then
    echo "  ❌ cloudapi не найден. Клонируйте: git clone https://github.com/yandex-cloud/cloudapi $CLOUDAPI"
    ((FAILED++)) || true
    continue
  fi

  if RESPONSE=$(echo "$REQUEST" | grpcurl -rpc-header "Authorization: Bearer $IAM_TOKEN" \
    -d @ \
    -import-path "$CLOUDAPI" \
    -import-path "$CLOUDAPI/third_party/googleapis" \
    -proto "$CLOUDAPI/yandex/cloud/monitoring/v3/dashboard_service.proto" \
    monitoring.api.cloud.yandex.net:443 yandex.cloud.monitoring.v3.DashboardService.Create 2>&1); then
    echo "  ✅ Загружен"
    ((SUCCESS++)) || true
  else
    echo "  ❌ Ошибка: $RESPONSE"
    ((FAILED++)) || true
  fi
done

echo ""
echo "📈 Результат: $SUCCESS успешно, $FAILED ошибок"
