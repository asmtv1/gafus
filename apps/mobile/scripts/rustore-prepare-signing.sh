#!/bin/bash
# Подготовка файлов подписи для RuStore
# Запуск: ./scripts/rustore-prepare-signing.sh
#
# ПРЕДВАРИТЕЛЬНО: скачайте credentials из EAS:
#   cd apps/mobile && eas credentials -p android
#   Выберите: "Download credentials from EAS to credentials.json"
#   Выберите профиль: production

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$MOBILE_DIR/rustore-signing"
CREDS_FILE="$MOBILE_DIR/credentials.json"

echo "=== Подготовка подписи для RuStore ==="

# Поддержка ручного указания (если credentials.json нет)
if [[ -n "$KEYSTORE_PATH" && -n "$KEY_ALIAS" ]]; then
  echo "Используются переменные KEYSTORE_PATH и KEY_ALIAS"
elif [[ ! -f "$CREDS_FILE" ]]; then
  echo ""
  echo "Файл credentials.json не найден!"
  echo ""
  echo "Сначала скачайте credentials из EAS:"
  echo "  cd apps/mobile"
  echo "  eas credentials -p android"
  echo "  Выберите: Download credentials from EAS to credentials.json"
  echo "  Выберите профиль: production"
  echo ""
  echo "Или укажите вручную:"
  echo "  export KEYSTORE_PATH=/путь/к/keystore"
  echo "  export KEY_ALIAS=имя_ключа"
  echo "  ./scripts/rustore-prepare-signing.sh"
  echo ""
  exit 1
fi

# Проверяем наличие keytool
if ! command -v keytool &>/dev/null; then
  echo "keytool не найден. Установите JDK (Java)."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

if [[ -z "$KEYSTORE_PATH" || -z "$KEY_ALIAS" ]]; then
  # Парсим credentials.json
  if command -v jq &>/dev/null; then
    KEYSTORE_PATH=$(jq -r '.android.keystore.keystorePath // empty' "$CREDS_FILE")
    KEY_ALIAS=$(jq -r '.android.keystore.keyAlias // empty' "$CREDS_FILE")
    KEYSTORE_PASS=$(jq -r '.android.keystore.keystorePassword // empty' "$CREDS_FILE")
    KEY_PASS=$(jq -r '.android.keystore.keyPassword // empty' "$CREDS_FILE")
  else
    KEYSTORE_PATH=$(grep -o '"keystorePath"[[:space:]]*:[[:space:]]*"[^"]*"' "$CREDS_FILE" | head -1 | cut -d'"' -f4)
    KEY_ALIAS=$(grep -o '"keyAlias"[[:space:]]*:[[:space:]]*"[^"]*"' "$CREDS_FILE" | head -1 | cut -d'"' -f4)
    KEYSTORE_PASS=$(grep -o '"keystorePassword"[[:space:]]*:[[:space:]]*"[^"]*"' "$CREDS_FILE" | head -1 | cut -d'"' -f4)
    KEY_PASS=$(grep -o '"keyPassword"[[:space:]]*:[[:space:]]*"[^"]*"' "$CREDS_FILE" | head -1 | cut -d'"' -f4)
  fi

  # Если keystorePath относительный - делаем абсолютным
  if [[ -n "$KEYSTORE_PATH" && ! -f "$KEYSTORE_PATH" ]]; then
    KEYSTORE_PATH="$MOBILE_DIR/$KEYSTORE_PATH"
  fi

  # EAS может сохранить keystore как base64 в JSON
  if grep -q 'keystoreBase64\|keystore"' "$CREDS_FILE" 2>/dev/null; then
    B64=$(grep -o '"keystore"[[:space:]]*:[[:space:]]*"[^"]*"' "$CREDS_FILE" | head -1 | cut -d'"' -f4)
    if [[ -n "$B64" ]]; then
      echo "Keystore в формате base64. Декодируем..."
      echo "$B64" | base64 -d > "$OUTPUT_DIR/upload.keystore"
      KEYSTORE_PATH="$OUTPUT_DIR/upload.keystore"
    fi
  fi
fi

if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo ""
  echo "Keystore не найден: $KEYSTORE_PATH"
  echo "Проверьте credentials.json или укажите KEYSTORE_PATH и KEY_ALIAS"
  exit 1
fi

echo "Keystore: $KEYSTORE_PATH"
echo "Key alias: $KEY_ALIAS"
echo ""

# 1. Экспорт сертификата в PEM
PEM_FILE="$OUTPUT_DIR/upload-cert.pem"
echo "Экспорт сертификата в PEM..."
KEYTOOL_OPTS=(-exportcert -alias "$KEY_ALIAS" -keystore "$KEYSTORE_PATH" -rfc -file "$PEM_FILE")
[[ -n "$KEYSTORE_PASS" ]] && KEYTOOL_OPTS+=(-storepass "$KEYSTORE_PASS")
[[ -n "$KEY_PASS" ]] && KEYTOOL_OPTS+=(-keypass "$KEY_PASS")
keytool "${KEYTOOL_OPTS[@]}"
echo "✓ Создан: $PEM_FILE"
echo ""

# 2. Инструкция для PEPK
echo "=== Следующие шаги ==="
echo ""
echo "1. RuStore Консоль → Приложение → Загрузить версию"
echo "2. Нажмите 'Загрузить' рядом с 'Подпись не загружена'"
echo "3. Скачайте pepk.jar, скопируйте команду PEPK из окна"
KEYSTORE_ABS="$KEYSTORE_PATH"
[[ "$KEYSTORE_PATH" != /* ]] && KEYSTORE_ABS="$MOBILE_DIR/$KEYSTORE_PATH"
echo "4. В команде замените:"
echo "   ваше_хранилище_ключей → $KEYSTORE_ABS"
echo "   имя_ключа → $KEY_ALIAS"
echo "5. Запустите команду, введите пароли"
echo "6. Загрузите в RuStore:"
echo "   • $PEM_FILE"
echo "   • pepk_out.zip (результат шага 5)"
echo ""
echo "Файлы: $OUTPUT_DIR"
echo ""
