# Сбор логов из Docker контейнеров

## 📋 Обзор

Для сбора логов из Docker контейнеров используется **Vector** — агент для сбора и обработки логов, который автоматически читает логи из контейнеров и отправляет их в Seq.

## 🎯 Зачем нужен Vector?

Без Vector вы видите только:

- Логи, отправленные через `@gafus/logger` API
- Логи в `docker-compose logs` (локально)

С Vector вы видите:

- ✅ Все логи из контейнеров (stdout/stderr)
- ✅ Логи системных компонентов
- ✅ Логи в Seq с метаданными контейнера
- ✅ Парсинг Pino JSON логов
- ✅ Централизованный сбор всех логов

## 🏗️ Архитектура

```
Docker контейнеры
    ↓ (stdout/stderr)
Docker JSON log files (/var/lib/docker/containers/*/*-json.log)
    ↓
Vector (читает, парсит, форматирует)
    ↓
Seq (хранит логи, UI для просмотра)
```

## ⚙️ Конфигурация

### Vector конфигурация

Файл: `ci-cd/docker/vector/vector.toml`

```toml
[sources.docker_logs]
type = "file"
include = ["/var/lib/docker/containers/*/*-json.log"]
read_from = "beginning"
file_key = "file"

[transforms.parse_docker_json]
type = "remap"
inputs = ["docker_logs"]
# Парсинг Docker JSON формата

[transforms.parse_pino]
type = "remap"
inputs = ["parse_docker_json"]
# Парсинг Pino JSON логов

[transforms.format_clef]
type = "remap"
inputs = ["parse_pino"]
# Форматирование в CLEF для Seq

[sinks.seq]
type = "http"
inputs = ["format_clef"]
uri = "http://seq:80/api/events/raw?clef"
method = "post"
```

### Docker Compose

Vector добавлен в `docker-compose.local.yml` и `docker-compose.prod.yml`:

```yaml
vector:
  image: timberio/vector:latest-alpine
  container_name: gafus-vector-local
  command:
    - "--config-dir"
    - "/etc/vector"
  volumes:
    - ./vector:/etc/vector
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - vector_local_data:/var/lib/vector
  restart: unless-stopped
  depends_on:
    - seq
```

## 🔧 Как это работает

### 1. Сбор логов

Vector читает логи из файловой системы Docker:

- Путь: `/var/lib/docker/containers/{container_id}/{container_id}-json.log`
- Формат: Docker JSON log format

### 2. Парсинг Docker JSON

Vector парсит Docker JSON формат:

- Извлекает поле `log` (содержимое лога)
- Извлекает `stream` (stdout/stderr)
- Извлекает `time` (timestamp)
- Извлекает `container_id` из пути к файлу

### 3. Парсинг Pino JSON

Vector пытается распарсить содержимое лога как Pino JSON:

- Извлекает `level`, `msg`, `app`, `context`
- Извлекает `stack` для ошибок
- Нормализует уровни логов (10→trace, 30→info, 50→error)

### 4. Форматирование в CLEF

Vector форматирует данные в CLEF (Compact Log Event Format) для Seq:

- Поля `@t` (timestamp), `@m` (message), `@l` (level)
- Свойства: `ContainerId`, `Stream`, `App`, `Context`, `Level`
- Теги: `tag_container_logs`, `environment`

### 5. Отправка в Seq

Vector отправляет логи в Seq через HTTP API:

- Endpoint: `http://seq:80/api/events/raw?clef`
- Формат: CLEF (один JSON объект на строку)
- Batch: до 500 событий или 10MB за раз

## 📊 Просмотр логов

### В Seq UI

```bash
# Открыть Seq UI
open http://localhost:5341

# Запрос через API
curl -G "http://localhost:5341/api/events" \
  --data-urlencode 'q=select * from stream where Properties["App"] = "web"' \
  --data-urlencode 'count=100'
```

Логи в Seq отображаются с полями:

- `ContainerName` — имя контейнера
- `App`, `Level`, `Context` — из Pino

Фильтрация в Seq: по `ContainerName`, `Level`, `App`.

## 🔍 Отладка

### Проверка работы Vector

```bash
# Логи Vector
docker logs gafus-vector-local --tail 50 -f

# Проверка конфигурации (валидация)
docker exec gafus-vector-local vector validate --config-dir /etc/vector

# Метрики Vector (если включены)
curl http://localhost:8686/metrics
```

### Проверка Seq

```bash
# Проверка доступности Seq
curl http://localhost:5341/api

# Проверка количества событий
curl -G "http://localhost:5341/api/events" \
  --data-urlencode 'q=select count(*) from stream' \
  --data-urlencode 'count=1'
```

### Проверка логов контейнера

```bash
# Docker логи
docker logs gafus-web --tail 100

# Логи в Seq UI
# Открыть http://localhost:5341 и фильтровать по ContainerId
```

## 🎯 Метаданные контейнера

Vector автоматически добавляет метаданные:

| Поле                 | Источник                | Пример              |
| -------------------- | ----------------------- | ------------------- |
| `ContainerId`        | Из пути к файлу         | `abc123...`         |
| `Stream`             | Docker JSON             | `stdout` / `stderr` |
| `App`                | Pino log                | `web`, `worker`     |
| `Level`              | Pino log (нормализован) | `info`, `error`     |
| `Context`            | Pino log                | `auth-service`      |
| `environment`        | Статический             | `production`        |
| `tag_container_logs` | Статический             | `true`              |

## ⚠️ Ограничения

1. **Только Docker контейнеры** — Vector не может собрать логи из локальных процессов
2. **Производительность** — большие объёмы логов могут замедлить обработку
3. **Парсинг** — только Pino JSON логи парсятся структурированно, остальные — как текст

## 🔧 Настройка

### Изменить уровень фильтрации

В Vector можно добавить фильтрацию через transform `filter`:

```toml
[transforms.filter_errors]
type = "filter"
inputs = ["parse_pino"]
condition = '.level == "error" || .level == "fatal"'
```

### Добавить новые источники логов

Добавить новые sources в `vector.toml`:

```toml
[sources.system_logs]
type = "file"
include = ["/var/log/syslog"]
read_from = "beginning"
```

### Отключить сбор логов

В `docker-compose.prod.yml` закомментировать сервис `vector` или установить `restart: no`:

```yaml
# vector:
#   ...
```

## 📚 Дополнительные ресурсы

- [Vector документация](https://vector.dev/docs/)
- [Seq документация](https://docs.datalust.co/)
- [CLEF формат](https://github.com/serilog/serilog-formatting-compact)
- [VRL (Vector Remap Language)](https://vector.dev/docs/reference/vrl/)

---

_Сбор логов из контейнеров обеспечивает полную видимость происходящего внутри Docker контейнеров._
