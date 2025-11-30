# Сбор логов из Docker контейнеров

## 📋 Обзор

Для сбора логов из Docker контейнеров используется **Promtail** — агент для сбора логов, который автоматически читает логи из контейнеров и отправляет их в error-dashboard.

## 🎯 Зачем нужен Promtail?

Без Promtail вы видите только:
- Логи, отправленные через `@gafus/logger` API
- Логи в `docker-compose logs` (локально)

С Promtail вы видите:
- ✅ Все логи из контейнеров (stdout/stderr)
- ✅ Логи системных компонентов
- ✅ Логи в error-dashboard с метаданными контейнера
- ✅ Парсинг Pino JSON логов

## 🏗️ Архитектура

```
Docker контейнеры
    ↓ (stdout/stderr)
Docker JSON log files (/var/lib/docker/containers/*/*-json.log)
    ↓
Promtail (читает, парсит, фильтрует)
    ↓
error-dashboard /api/container-logs
    ↓
PostgreSQL (ErrorReport)
    ↓
error-dashboard UI
```

## ⚙️ Конфигурация

### Promtail конфигурация

Файл: `ci-cd/docker/promtail/promtail.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://error-dashboard:3005/api/container-logs
    batchwait: 1s
    batchsize: 100
    timeout: 10s

scrape_configs:
  - job_name: docker
    static_configs:
      - targets:
          - localhost
        labels:
          job: docker
          __path__: /var/lib/docker/containers/*/*-json.log
    # ... pipeline для парсинга
```

### Docker Compose

Promtail добавлен в `docker-compose.prod.yml`:

```yaml
promtail:
  image: grafana/promtail:latest
  container_name: gafus-promtail
  command:
    - '-config.file=/etc/promtail/promtail.yml'
  volumes:
    - ./promtail:/etc/promtail
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
  restart: unless-stopped
  depends_on:
    - error-dashboard
```

## 🔧 Как это работает

### 1. Сбор логов

Promtail читает логи из файловой системы Docker:
- Путь: `/var/lib/docker/containers/{container_id}/{container_id}-json.log`
- Формат: Docker JSON log format

### 2. Парсинг

Pipeline Promtail:
1. Парсит Docker JSON формат
2. Извлекает метаданные контейнера (container_id, container_name)
3. Пытается распарсить Pino JSON логи
4. Извлекает level, message, context, app и другие поля

### 3. Фильтрация

Отправляются только важные логи:
- `warn`, `error`, `fatal` уровни
- В development — все логи

### 4. Отправка в error-dashboard

Promtail отправляет логи в формат Loki Push API:
```json
{
  "streams": [
    {
      "stream": {
        "container_name": "gafus-web",
        "app": "web",
        "level": "error"
      },
      "values": [
        ["1642678800000000000", "{\"level\":40,\"msg\":\"Error message\"}"]
      ]
    }
  ]
}
```

### 5. Обработка в error-dashboard

Endpoint `/api/container-logs`:
1. Принимает логи в формате Promtail
2. Парсит Pino JSON логи
3. Извлекает метаданные (app, level, context)
4. Сохраняет в PostgreSQL через `reportError()`

## 📊 Просмотр логов в error-dashboard

Логи из контейнеров отображаются в error-dashboard с тегами:
- `container-logs` — все логи из контейнеров
- `container:{container_name}` — логи конкретного контейнера
- `level:{level}` — уровень логирования

Фильтрация:
- По контейнеру: тег `container:gafus-web`
- По уровню: тег `level:error`
- По приложению: `appName: web`

## 🔍 Отладка

### Проверка работы Promtail

```bash
# Логи Promtail
docker-compose logs -f promtail

# Проверка конфигурации
docker exec gafus-promtail promtail -config.file=/etc/promtail/promtail.yml -dry-run

# Статистика Promtail
curl http://localhost:9080/ready
curl http://localhost:9080/metrics
```

### Проверка endpoint error-dashboard

```bash
# Тестовый запрос
curl -X POST http://localhost:3005/api/container-logs \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {
        "container_name": "test",
        "app": "test",
        "level": "error"
      },
      "values": [
        ["1642678800000000000", "{\"msg\":\"Test log\"}"]
      ]
    }]
  }'
```

### Просмотр логов контейнера

```bash
# Docker логи
docker-compose logs -f web

# Логи в error-dashboard
# Фильтр: тег container-logs + container:gafus-web
```

## 🎯 Метаданные контейнера

Promtail автоматически добавляет метаданные:

| Поле | Источник | Пример |
|------|----------|--------|
| `container_name` | Docker attrs | `gafus-web` |
| `container_id` | Docker attrs | `abc123...` |
| `app` | Извлечено из container_name | `web` |
| `level` | Pino log level | `error` |
| `context` | Pino context | `auth-service` |

## ⚠️ Ограничения

1. **Фильтрация** — отправляются только `warn`, `error`, `fatal` (или все в development)
2. **Производительность** — большие объёмы логов могут замедлить обработку
3. **Парсинг** — только Pino JSON логи парсятся структурированно, остальные — как текст

## 🔧 Настройка

### Изменить уровень фильтрации

В `promtail.yml` изменить pipeline stages для фильтрации нужных уровней.

### Добавить новые источники логов

Добавить новые `scrape_configs` в `promtail.yml`:

```yaml
scrape_configs:
  - job_name: system-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: system
          __path__: /var/log/syslog
```

### Отключить сбор логов

В `docker-compose.prod.yml` закомментировать сервис `promtail` или установить `restart: no`.

---

*Сбор логов из контейнеров обеспечивает полную видимость происходящего внутри Docker контейнеров.*

