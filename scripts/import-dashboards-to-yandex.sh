#!/bin/bash
# Импорт дашбордов Grafana в Yandex Cloud Monitoring
# Требования: Python 3, yc CLI, grpcurl, jq, git

set -e

FOLDER_ID="${FOLDER_ID:-b1g0vbm2pvav4oqc4ds9}"
PROMETHEUS_DS_ID="${PROMETHEUS_DS_ID:-fbe681839dit4q6504um}"
WORKSPACE_ID="${WORKSPACE_ID:-monj8dpjri8u0bbqvq71}"
DASHBOARDS_DIR="ci-cd/docker/grafana/dashboards"
IMPORTER_DIR="${IMPORTER_DIR:-/tmp/yc-dashboard-importer}"
CLOUDAPI="${CLOUDAPI:-/tmp/cloudapi}"
OUTPUT_DIR="/tmp/yandex-dashboards"
API_BASE="https://monitoring.api.cloud.yandex.net"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📋 Параметры:"
echo "  FOLDER_ID=$FOLDER_ID"
echo "  PROMETHEUS_DS_ID=$PROMETHEUS_DS_ID"
echo "  WORKSPACE_ID=$WORKSPACE_ID"
echo "  CLOUDAPI=$CLOUDAPI"
echo ""

# Проверка yc
if ! command -v yc &>/dev/null; then
  echo "❌ yc CLI не найден в PATH."
  if [[ "$(uname -s)" == "Darwin" ]] && command -v brew &>/dev/null; then
    echo "   macOS + Homebrew: brew install --cask yandex-cloud-cli"
  fi
  echo "   Документация: https://cloud.yandex.ru/docs/cli/quickstart"
  echo "   После установки откройте новый терминал или: export PATH=\"/opt/homebrew/bin:\$PATH\""
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

# Патч импортера: unit_format=null и type=9 для stat ломают клиент Yandex (в т.ч. мобильный)
python3 "$PROJECT_ROOT/scripts/apply-yc-monitoring-importer-patch.py" "$IMPORTER_DIR"

# Proto для grpcurl (DashboardService.Create)
if [ ! -d "$CLOUDAPI/yandex/cloud/monitoring/v3" ]; then
  echo "📥 Клонирование yandex-cloud/cloudapi (нужно для grpcurl)..."
  git clone --depth 1 https://github.com/yandex-cloud/cloudapi.git "$CLOUDAPI"
fi

if ! command -v grpcurl &>/dev/null; then
  echo "❌ grpcurl не найден. Установите: brew install grpcurl"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Список дашбордов папки (один раз): по имени решаем Create vs Update
echo "📂 Получение списка дашбордов..."
set +e
LIST_RESPONSE=$(jq -n --arg fid "$FOLDER_ID" '{folder_id: $fid, page_size: 1000}' | grpcurl -rpc-header "Authorization: Bearer $IAM_TOKEN" \
  -d @ \
  -import-path "$CLOUDAPI" \
  -import-path "$CLOUDAPI/third_party/googleapis" \
  -proto "$CLOUDAPI/yandex/cloud/monitoring/v3/dashboard_service.proto" \
  monitoring.api.cloud.yandex.net:443 yandex.cloud.monitoring.v3.DashboardService.List 2>&1)
LIST_EC=$?
set -e
if [[ "$LIST_EC" -ne 0 ]]; then
  echo "❌ DashboardService.List: $LIST_RESPONSE"
  exit 1
fi

# Конвертация и загрузка каждого дашборда
DASHBOARDS="overview system-metrics postgres-metrics services-availability bullmq-queues"
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

  python3 "$PROJECT_ROOT/scripts/normalize-yandex-monitoring-dashboard.py" "$out"

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

  # Загрузка: Update (дашборд с таким name уже есть) или Create
  EXISTING=$(echo "$LIST_RESPONSE" | jq -c --arg n "$SAFE_NAME" '(.dashboards // []) | map(select(.name == $n)) | .[0] // empty')

  if [[ -n "$EXISTING" ]]; then
    DASH_ID=$(echo "$EXISTING" | jq -r .id)
    ETAG=$(echo "$EXISTING" | jq -r .etag)
    UPSERT=$(echo "$REQUEST" | jq -c \
      --arg id "$DASH_ID" \
      --arg etag "$ETAG" \
      '{
        dashboard_id: $id,
        etag: $etag,
        name: .name,
        description: .description,
        title: .title,
        labels: .labels,
        widgets: .widgets,
        parametrization: .parametrization
      }')
    METHOD="yandex.cloud.monitoring.v3.DashboardService.Update"
    OK_MSG="  ✅ Обновлён (created_at не меняется — в UI смотри дату изменения)"
  else
    UPSERT="$REQUEST"
    METHOD="yandex.cloud.monitoring.v3.DashboardService.Create"
    OK_MSG="  ✅ Создан"
  fi

  # Proto JSON (camelCase): мобильный клиент может не совпадать с тем, что терпит веб при snake_case
  UPSERT=$(echo "$UPSERT" | python3 "$PROJECT_ROOT/scripts/yandex-monitoring-proto-json.py")

  if RESPONSE=$(echo "$UPSERT" | grpcurl -rpc-header "Authorization: Bearer $IAM_TOKEN" \
    -d @ \
    -import-path "$CLOUDAPI" \
    -import-path "$CLOUDAPI/third_party/googleapis" \
    -proto "$CLOUDAPI/yandex/cloud/monitoring/v3/dashboard_service.proto" \
    monitoring.api.cloud.yandex.net:443 "$METHOD" 2>&1); then
    echo "$OK_MSG"
    ((SUCCESS++)) || true
  else
    echo "  ❌ Ошибка: $RESPONSE"
    ((FAILED++)) || true
  fi
done

echo ""
echo "📈 Результат: $SUCCESS успешно, $FAILED ошибок"
