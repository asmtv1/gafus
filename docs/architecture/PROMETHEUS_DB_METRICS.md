# Миграция метрик баз данных на Prometheus

## Цель

Заменить прямые запросы к PostgreSQL и Redis в `apps/error-dashboard/src/app/api/system-status/route.ts` на сбор метрик через Prometheus с использованием `postgres_exporter` и `redis_exporter`.

## Реализовано

### 1. Docker Compose конфигурация

#### Production (`ci-cd/docker/docker-compose.prod.yml`)

Добавлены сервисы:
- `postgres-exporter`: собирает метрики PostgreSQL
- `redis-exporter`: собирает метрики Redis

Оба экспортера автоматически подключаются к соответствующим БД через переменные окружения.

#### Local (`ci-cd/docker/docker-compose.local.yml`)

Добавлены те же экспортеры для локальной разработки:
- Используют `host.docker.internal` для доступа к локальным БД
- Проброшены порты для доступа извне (9187 для PostgreSQL, 9121 для Redis)

### 2. Prometheus конфигурация

Обновлены файлы:
- `ci-cd/docker/prometheus/prometheus.yml` (production)
- `ci-cd/docker/prometheus/prometheus.local.yml` (local)

Добавлены job'ы для сбора метрик:
- `postgres-exporter`: порт 9187
- `redis-exporter`: порт 9121

### 3. Утилита Prometheus

**Файл:** `apps/error-dashboard/src/shared/lib/prometheus.ts`

Добавлены функции:
- `getPostgresMetricsFromPrometheus()`: получение метрик PostgreSQL
- `getRedisMetricsFromPrometheus()`: получение метрик Redis

**Метрики PostgreSQL:**
- `pg_up`: статус БД (1 = онлайн, 0 = офлайн)
- `pg_stat_database_numbackends`: количество активных подключений
- `pg_stat_database_version`: версия PostgreSQL (опционально)

**Метрики Redis:**
- `redis_up`: статус Redis (1 = онлайн, 0 = офлайн)
- `redis_info_redis_version`: версия Redis

### 4. API endpoint

**Файл:** `apps/error-dashboard/src/app/api/system-status/route.ts`

Изменения:
- Удалены прямые запросы к БД через Prisma и Redis connection
- Функции `checkPostgresStatus()` и `checkRedisStatus()` теперь используют Prometheus
- Добавлено логирование получения метрик БД

## Преимущества

1. **Стандартизация**: использование стандартных экспортеров вместо самописных запросов
2. **Исторические данные**: метрики БД сохраняются в Prometheus для анализа трендов
3. **Меньше нагрузки на БД**: экспортеры собирают метрики асинхронно, не блокируя основной поток
4. **Единая точка сбора**: все метрики (системные и БД) собираются через Prometheus
5. **Возможность алертов**: можно настроить алерты на основе метрик БД

## Использование

### Локальная разработка

1. Запустить Prometheus и экспортеры:
```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml up -d
```

2. Проверить доступность экспортеров:
- PostgreSQL: http://localhost:9187/metrics
- Redis: http://localhost:9121/metrics

3. Проверить в Prometheus UI:
- http://localhost:9090
- Запросы: `pg_up`, `redis_up`

### Production

Экспортеры запускаются автоматически вместе с Prometheus при деплое через `docker-compose.prod.yml`.

## Примечания

- Версия PostgreSQL может быть недоступна через метрики в некоторых конфигурациях - в этом случае она будет `undefined`
- Время отклика измеряется как время выполнения запроса к Prometheus API
- При недоступности Prometheus API возвращается ошибка 503

