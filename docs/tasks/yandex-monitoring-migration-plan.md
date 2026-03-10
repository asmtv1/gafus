# Миграция на Yandex Cloud Monitoring

## Цель

Заменить self-hosted Prometheus и Grafana на сбор метрик через Grafana Alloy → remote_write в Yandex Monitoring. Дашборды — в Yandex Cloud.

## Предварительные требования

- Аккаунт Yandex Cloud
- Оплата/бilling включён для папки

---

## Шаг 1. Настройка Yandex Cloud

### 1.1 Создать workspace Prometheus (в консоли Yandex Cloud)

1. **Консоль** → **Monitoring** → **Workspaces**
2. **Создать workspace** → выбрать папку → имя `gafus-monitoring`
3. Сохранить **Workspace ID** (нужен для URL)

### 1.2 Сервисный аккаунт и API-ключ

1. **IAM** → **Сервисные аккаунты** → **Создать**
2. Имя: `gafus-monitoring-agent`
3. Роль: `monitoring.editor`
4. **Создать ключ** → API-ключ → сохранить в безопасное место

### 1.3 URL для remote_write

```
https://monitoring.api.cloud.yandex.net/prometheus/workspaces/<WORKSPACE_ID>/api/v1/write
```

---

## Шаг 2. Grafana Alloy вместо Prometheus

Grafana Agent (EOL 2025) заменён на **Grafana Alloy**. Конфиг конвертируется из prometheus.yml.

### 2.1 Конвертация prometheus.yml в Alloy

```bash
docker run --rm -v $(pwd)/ci-cd/docker/prometheus:/config \
  grafana/alloy:latest convert \
  --source-format=prometheus \
  --output=/config/config.alloy \
  /config/prometheus.yml
```

### 2.2 Добавить remote_write в config.alloy

В сгенерированном `config.alloy` в блок `prometheus.remote_write` добавить endpoint Yandex:

```
endpoint {
  url = "https://monitoring.api.cloud.yandex.net/prometheus/workspaces/<WORKSPACE_ID>/api/v1/write"
  bearer_token_file = "/etc/alloy/yc-api-key"
}
queue_config {
  max_samples_per_send = 2000
  min_backoff = "100ms"
  max_backoff = "15s"
}
metadata_config {
  send = false
}
```

### 2.3 API-ключ

**Вариант A (рекомендуется):** `bearer_token_file` — смонтировать файл. Создать скрипт/секрет при деплое.

**Вариант B:** Entrypoint: при старте контейнера записать `YC_MONITORING_API_KEY` в `/tmp/yc-api-key`, в Alloy указать `bearer_token_file = "/tmp/yc-api-key"`.

---

## Шаг 3. Изменения в docker-compose

### 3.1 Заменить Prometheus на Alloy

**Удалить:**
- Сервис `prometheus`
- Сервис `grafana`
- Volumes `prometheus_data`, `grafana_data`

**Добавить:**

```yaml
  grafana-alloy:
    image: grafana/alloy:latest
    container_name: gafus-alloy
    command: ["run", "/etc/alloy/config.alloy"]
    volumes:
      - ./prometheus:/etc/alloy:ro  # config.alloy + директория для ключа
      - alloy_data:/var/lib/alloy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    depends_on:
      - node-exporter
      - postgres-exporter
      - redis-exporter
      - blackbox-exporter
    environment:
      - YC_MONITORING_API_KEY=${YC_MONITORING_API_KEY}
    # Скрипт entrypoint: перед запуском alloy записать env в /etc/alloy/yc-api-key
```

**Вариант проще:** передать ключ через `bearer_token` в конфиге (если Alloy поддерживает env в конфиге) или использовать отдельный init-контейнер/script для создания файла.

**Альтернатива — env в Alloy:** проверить поддержку `env("YC_MONITORING_API_KEY")` в Alloy для bearer_token.

### 3.2 Обновить certbot

Убрать из `-d`:
- `prometheus.gafus.ru`
- `grafana.gafus.ru`

---

## Шаг 4. Nginx

Удалить блоки:
- `server_name prometheus.gafus.ru` (HTTP + HTTPS)
- `server_name grafana.gafus.ru` (HTTP + HTTPS)

Alloy не нужен внешний доступ (headless). Локально метрики уходят в Yandex.

---

## Шаг 5. CI/CD (.github/workflows/ci-cd.yml)

- В `docker rm -f` убрать `gafus-prometheus`, `gafus-grafana`
- В `docker-compose up` monitoring: заменить `prometheus grafana` на `grafana-alloy`
- Добавить `gafus-alloy` в список контейнеров для очистки

---

## Шаг 6. Дашборды в Yandex Monitoring

### 6.1 Варианты

1. **Ручное создание** — виджеты в консоли Yandex Monitoring (PromQL)
2. **Импорт из Grafana** — [yc-monitoring-dashboard-importer](https://github.com/yandex-cloud-examples/yc-monitoring-dashboard-importer) конвертирует JSON Grafana в формат Yandex

### 6.2 Импорт текущих дашбордов

Существующие дашборды: `overview`, `system-metrics`, `postgres-metrics`, `redis-metrics`, `services-availability`, `bullmq-queues`.

- Datasource в них — Prometheus. В Yandex Monitoring — Prometheus API, запросы PromQL будут работать.
- Конвертировать через yc-monitoring-dashboard-importer, указать workspace ID.

---

## Шаг 7. Переменные окружения

Добавить в `.env` / секреты:

```
YC_MONITORING_WORKSPACE_ID=<workspace_id>
YC_MONITORING_API_KEY=<api_key_из_сервисного_аккаунта>
```

В docker-compose передать в сервис alloy.

---

## Шаг 8. Локальная разработка (docker-compose.local.yml)

- Оставить локальный Prometheus для dev (опционально) ИЛИ
- Подключить Alloy с тем же remote_write — метрики будут и в Yandex (можно фильтровать по `environment="local"`)

---

## Шаг 9. Документация

Обновить:
- `docs/monitoring/README.md` — Yandex Monitoring вместо Grafana
- `docs/monitoring/GRAFANA.md` → переименовать/заменить на `docs/monitoring/yandex-monitoring.md`
- `docs/deployment/docker.md` — убрать grafana, prometheus, добавить alloy
- `.cursor/rules/` — если есть упоминания Grafana/Prometheus

---

## Порядок выполнения

1. **В консоли Yandex Cloud:** workspace, сервисный аккаунт, API-ключ
2. **Локально:** конвертировать prometheus.yml → config.alloy, добавить remote_write
3. **Проверить:** запустить Alloy локально (Docker), убедиться, что метрики появляются в Yandex
4. **Деплой:** обновить docker-compose, nginx, CI, удалить prometheus/grafana
5. **Дашборды:** создать или импортировать в Yandex Monitoring
6. **Документация:** обновить docs

---

## Проверка

- В Yandex Monitoring → **Explore** — выполнить запрос `up{job="node-exporter"}` (должны быть данные)
- Метрики должны поступать в течение 1–2 минут после старта Alloy
