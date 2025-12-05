# Просмотр логов из Loki

## 📋 Обзор

Loki собирает логи из Docker контейнеров через Promtail и хранит их для последующего просмотра. Есть несколько способов посмотреть собранные логи.

## 🔍 Способы просмотра логов

### 1. Через Error Dashboard UI (рекомендуется)

Error Dashboard имеет встроенную интеграцию с Loki для просмотра логов контейнеров.

**Как использовать:**

1. Откройте Error Dashboard: `https://monitor.gafus.ru` (или локально `http://localhost:3005`)
2. В фильтрах выберите тег: **`container-logs`**
3. Дополнительные фильтры:
   - По контейнеру: `container:gafus-web`
   - По приложению: `appName: web`
   - По уровню: `level: error`

**Пример запроса:**
- Тег: `container-logs`
- App: `web`
- Тип: `logs` или `all`

### 2. Через Loki API напрямую

Loki предоставляет REST API для запросов логов.

#### Локально

```bash
# Базовый URL
LOKI_URL="http://localhost:3100"

# Получить все логи за последний час
curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"}' \
  --data-urlencode 'start='$(date -d '1 hour ago' +%s)000000000 \
  --data-urlencode 'end='$(date +%s)000000000 \
  --data-urlencode 'limit=100' | jq

# Получить логи конкретного контейнера
curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode 'query={container_name="gafus-web"}' \
  --data-urlencode 'start='$(date -d '1 hour ago' +%s)000000000 \
  --data-urlencode 'end='$(date +%s)000000000 \
  --data-urlencode 'limit=100' | jq

# Получить только ошибки
curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"} |= "error"' \
  --data-urlencode 'start='$(date -d '1 hour ago' +%s)000000000 \
  --data-urlencode 'end='$(date +%s)000000000 \
  --data-urlencode 'limit=100' | jq
```

#### На сервере (через Docker)

```bash
# Войти в контейнер Loki
docker exec -it gafus-loki sh

# Или через docker-compose
cd ci-cd/docker
docker-compose exec loki sh

# Запрос через localhost внутри контейнера
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"}' \
  --data-urlencode 'start='$(date -d '1 hour ago' +%s)000000000 \
  --data-urlencode 'end='$(date +%s)000000000 \
  --data-urlencode 'limit=100'
```

#### Через SSH туннель (если порт не открыт)

```bash
# Создать SSH туннель
ssh -L 3100:localhost:3100 user@server

# Теперь можно обращаться к Loki как к localhost:3100
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"}' \
  --data-urlencode 'start='$(date -d '1 hour ago' +%s)000000000 \
  --data-urlencode 'end='$(date +%s)000000000 \
  --data-urlencode 'limit=100' | jq
```

### 3. Через Grafana (опционально)

Если нужно визуализировать логи с графиками и дашбордами, можно добавить Grafana.

**Установка Grafana:**

Добавить в `docker-compose.prod.yml`:

```yaml
grafana:
  image: grafana/grafana:latest
  container_name: gafus-grafana
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
    - GF_INSTALL_PLUGINS=
  volumes:
    - grafana_data:/var/lib/grafana
  restart: unless-stopped
  depends_on:
    - loki

volumes:
  grafana_data:
```

**Настройка Loki как источника данных в Grafana:**

1. Откройте Grafana: `http://localhost:3000`
2. Логин: `admin`, пароль: `admin`
3. Configuration → Data Sources → Add data source → Loki
4. URL: `http://loki:3100` (внутри Docker сети)
5. Сохраните

**Пример LogQL запроса в Grafana:**

```logql
{job="docker", container_name="gafus-web"} |= "error"
```

## 📊 LogQL запросы

### Базовые запросы

```logql
# Все логи
{job="docker"}

# Логи конкретного контейнера
{container_name="gafus-web"}

# Логи по приложению
{app="web"}

# Логи по уровню
{level="error"}
```

### Фильтрация по содержимому

```logql
# Содержит текст "error"
{job="docker"} |= "error"

# Не содержит текст "debug"
{job="docker"} != "debug"

# Регулярное выражение
{job="docker"} |~ "error|fatal"

# Исключить регулярное выражение
{job="docker"} !~ "debug|trace"
```

### Комбинации

```logql
# Логи ошибок из веб-приложения
{container_name="gafus-web", level="error"}

# Логи за последний час с фильтром
{job="docker"} |= "error" | json | app="web"
```

## 🔧 Проверка работы Loki

### Проверка статуса

```bash
# Локально
curl http://localhost:3100/ready
curl http://localhost:3100/metrics

# На сервере
docker exec gafus-loki wget -qO- http://localhost:3100/ready
```

### Проверка метрик

```bash
# Количество логов
curl -s http://localhost:3100/metrics | grep loki_ingester_chunks_created_total

# Размер хранилища
docker exec gafus-loki du -sh /loki
```

### Проверка Promtail

```bash
# Логи Promtail
docker-compose logs -f promtail

# Статус Promtail
curl http://localhost:9080/ready
curl http://localhost:9080/metrics
```

## 📝 Полезные команды

### Получить последние 100 логов

```bash
LOKI_URL="http://localhost:3100"
NOW=$(date +%s)000000000
HOUR_AGO=$(($(date +%s) - 3600))000000000

curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"}' \
  --data-urlencode "start=${HOUR_AGO}" \
  --data-urlencode "end=${NOW}" \
  --data-urlencode 'limit=100' | jq -r '.data.result[].values[][1]'
```

### Поиск ошибок за последние 24 часа

```bash
LOKI_URL="http://localhost:3100"
NOW=$(date +%s)000000000
DAY_AGO=$(($(date +%s) - 86400))000000000

curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode 'query={job="docker"} |= "error"' \
  --data-urlencode "start=${DAY_AGO}" \
  --data-urlencode "end=${NOW}" \
  --data-urlencode 'limit=1000' | jq
```

### Получить логи конкретного контейнера

```bash
CONTAINER="gafus-web"
LOKI_URL="http://localhost:3100"
NOW=$(date +%s)000000000
HOUR_AGO=$(($(date +%s) - 3600))000000000

curl -G -s "${LOKI_URL}/loki/api/v1/query_range" \
  --data-urlencode "query={container_name=\"${CONTAINER}\"}" \
  --data-urlencode "start=${HOUR_AGO}" \
  --data-urlencode "end=${NOW}" \
  --data-urlencode 'limit=500' | jq -r '.data.result[].values[][1]'
```

## ⚙️ Конфигурация

### Переменные окружения

- `LOKI_URL` — URL для подключения к Loki
  - Локально: `http://localhost:3100`
  - В Docker: `http://loki:3100`
  - На сервере: `http://loki:3100` (внутри Docker сети)

### Retention (хранение)

Логи хранятся **30 дней** (настроено в `loki/local-config.yaml`):

```yaml
limits_config:
  retention_period: 720h  # 30 дней
```

### Ограничения запросов

- Максимальный период запроса: **30 дней**
- Максимальный размер строки: **256KB**
- Максимальное количество потоков: **10000**

## 🐛 Решение проблем

### Loki не отвечает

```bash
# Проверить статус контейнера
docker ps | grep loki

# Проверить логи
docker logs gafus-loki

# Перезапустить
docker restart gafus-loki
```

### Promtail не собирает логи

```bash
# Проверить статус
docker logs gafus-promtail

# Проверить доступ к Docker сокету
docker exec gafus-promtail ls -la /var/run/docker.sock

# Проверить доступ к логам контейнеров
docker exec gafus-promtail ls -la /var/lib/docker/containers | head
```

### Нет логов в Loki

1. Проверить, что Promtail запущен: `docker ps | grep promtail`
2. Проверить логи Promtail: `docker logs gafus-promtail`
3. Проверить, что контейнеры пишут логи: `docker logs gafus-web | tail`
4. Проверить подключение Promtail к Loki: `docker logs gafus-promtail | grep -i loki`

---

*Логи из Loki доступны через Error Dashboard UI или напрямую через API.*

