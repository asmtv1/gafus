# Устранение проблем с Prometheus метриками БД

## Проблема: "No results for query: pg_up" или "No results for query: redis_up"

### Причина
Экспортеры PostgreSQL и Redis не запущены или Prometheus не может достучаться до них.

### Решение

#### 1. Проверьте, запущены ли экспортеры

```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml ps
```

Должны быть запущены:
- `gafus-postgres-exporter-local`
- `gafus-redis-exporter-local`
- `gafus-prometheus-local`

#### 2. Если экспортеры не запущены, запустите их

```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml up -d postgres-exporter redis-exporter
```

#### 3. Проверьте, что экспортеры доступны

```bash
# PostgreSQL экспортер
curl http://localhost:9187/metrics | grep pg_up

# Redis экспортер
curl http://localhost:9121/metrics | grep redis_up
```

Оба должны вернуть метрику со значением `1`.

#### 4. Проверьте, что Prometheus собирает метрики

```bash
# Проверка targets
curl "http://localhost:9090/api/v1/targets" | jq '.data.activeTargets[] | select(.labels.job | contains("postgres") or contains("redis"))'

# Проверка метрик
curl "http://localhost:9090/api/v1/query?query=pg_up"
curl "http://localhost:9090/api/v1/query?query=redis_up"
```

#### 5. Перезагрузите конфигурацию Prometheus (если нужно)

```bash
curl -X POST http://localhost:9090/-/reload
```

#### 6. Проверьте подключение экспортеров к БД

**PostgreSQL экспортер:**
```bash
docker-compose -f docker-compose.local.yml logs postgres-exporter | grep -i error
```

Если видите ошибки подключения, проверьте:
- Запущен ли PostgreSQL
- Правильный ли `DATA_SOURCE_NAME` в `docker-compose.local.yml`
- Доступен ли PostgreSQL по адресу `host.docker.internal:5432`

**Redis экспортер:**
```bash
docker-compose -f docker-compose.local.yml logs redis-exporter | grep -i error
```

Если видите ошибки подключения, проверьте:
- Запущен ли Redis
- Правильный ли `REDIS_ADDR` в `docker-compose.local.yml`
- Доступен ли Redis по адресу `host.docker.internal:6379`

### Проверка в UI

После выполнения всех шагов:
1. Откройте Error Dashboard: `http://localhost:3005/system-status`
2. Обновите страницу (F5)
3. Проверьте раздел "Базы данных"

Метрики должны отображаться корректно.

### Частые проблемы

#### Проблема: PostgreSQL экспортер не может подключиться

**Решение:**
1. Проверьте, что PostgreSQL запущен и доступен
2. Проверьте `DATA_SOURCE_NAME` в `docker-compose.local.yml`:
   ```yaml
   - DATA_SOURCE_NAME=postgresql://postgres:1488@host.docker.internal:5432/dog_trainer?sslmode=disable
   ```
3. Убедитесь, что база данных `dog_trainer` существует

#### Проблема: Redis экспортер не может подключиться

**Решение:**
1. Проверьте, что Redis запущен и доступен
2. Проверьте `REDIS_ADDR` в `docker-compose.local.yml`:
   ```yaml
   - REDIS_ADDR=host.docker.internal:6379
   ```

#### Проблема: Prometheus не собирает метрики

**Решение:**
1. Проверьте конфигурацию `prometheus.local.yml`:
   ```yaml
   - job_name: 'postgres-exporter'
     static_configs:
       - targets: ['postgres-exporter:9187']
   
   - job_name: 'redis-exporter'
     static_configs:
       - targets: ['redis-exporter:9121']
   ```
2. Перезагрузите Prometheus:
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```
3. Подождите 15-30 секунд (интервал сбора метрик)

#### Проблема: Приложение не может достучаться до Prometheus

**Решение:**
1. Проверьте переменную окружения `PROMETHEUS_URL` в `.env`:
   ```env
   PROMETHEUS_URL=http://localhost:9090
   ```
2. Перезапустите приложение после изменения `.env`
3. Проверьте логи приложения на наличие ошибок подключения

### Диагностика через логи

```bash
# Логи PostgreSQL экспортера
docker-compose -f docker-compose.local.yml logs -f postgres-exporter

# Логи Redis экспортера
docker-compose -f docker-compose.local.yml logs -f redis-exporter

# Логи Prometheus
docker-compose -f docker-compose.local.yml logs -f prometheus
```

### Проверка метрик напрямую

```bash
# Все метрики PostgreSQL
curl http://localhost:9187/metrics | grep "^pg_"

# Все метрики Redis
curl http://localhost:9121/metrics | grep "^redis_"

# Проверка в Prometheus UI
open http://localhost:9090
# Затем выполните запрос: pg_up или redis_up
```

