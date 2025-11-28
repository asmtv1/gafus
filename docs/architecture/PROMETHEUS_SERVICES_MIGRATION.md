# Миграция проверки статуса сервисов на Prometheus

## Цель

Заменить прямые HTTP запросы к health endpoints сервисов в `apps/error-dashboard/src/app/api/system-status/route.ts` на сбор метрик через Prometheus с использованием `blackbox_exporter`.

## Реализовано

### 1. Docker Compose конфигурация

#### Production (`ci-cd/docker/docker-compose.prod.yml`)

Добавлен сервис:
- `blackbox-exporter`: проверка HTTP endpoints сервисов

#### Local (`ci-cd/docker/docker-compose.local.yml`)

Добавлен тот же сервис для локальной разработки.

### 2. Blackbox Exporter конфигурация

**Файл:** `ci-cd/docker/blackbox/config.yml`

Настроен модуль `http_2xx` для проверки HTTP endpoints:
- Таймаут: 5 секунд
- Валидные статус коды: 200, 201, 204
- Метод: GET
- Следование редиректам: включено

### 3. Prometheus конфигурация

Обновлены файлы:
- `ci-cd/docker/prometheus/prometheus.yml` (production)
- `ci-cd/docker/prometheus/prometheus.local.yml` (local)

Добавлен job `services-health` для проверки:
- Web App: `http://web:3000/api/health` (production) / `http://host.docker.internal:3000/api/health` (local)
- Trainer Panel: `http://trainer-panel:3001/api/health` (production) / `http://host.docker.internal:3001/api/health` (local)
- Admin Panel: `http://admin-panel:3006/api/health` (production) / `http://host.docker.internal:3006/api/health` (local)
- Bull Board: `http://bull-board:3002/health` (production) / `http://host.docker.internal:3002/health` (local)

### 4. Утилита Prometheus

**Файл:** `apps/error-dashboard/src/shared/lib/prometheus.ts`

Добавлены функции:
- `getServiceMetricsFromPrometheus(serviceName, instanceUrl)`: получение метрик одного сервиса
- `getAllServicesMetricsFromPrometheus()`: получение метрик всех сервисов

**Метрики blackbox_exporter:**
- `probe_success`: статус проверки (1 = успешно, 0 = неуспешно)
- `probe_http_status_code`: HTTP статус код ответа
- `probe_http_duration_seconds`: время ответа в секундах

### 5. API endpoint

**Файл:** `apps/error-dashboard/src/app/api/system-status/route.ts`

Изменения:
- Функция `checkServiceStatus()` теперь использует Prometheus вместо прямых HTTP запросов
- Добавлено логирование получения метрик сервисов

## Преимущества

1. **Стандартизация**: использование стандартного blackbox_exporter вместо самописных HTTP запросов
2. **Исторические данные**: метрики сервисов сохраняются в Prometheus для анализа трендов
3. **Меньше нагрузки**: проверки выполняются асинхронно через Prometheus
4. **Единая точка сбора**: все метрики (системные, БД, сервисы) собираются через Prometheus
5. **Возможность алертов**: можно настроить алерты на основе метрик сервисов
6. **Детальные метрики**: время ответа, HTTP статус коды, доступность

## Использование

### Локальная разработка

1. Запустить blackbox_exporter:
```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml up -d blackbox-exporter
```

2. Перезагрузить конфигурацию Prometheus:
```bash
curl -X POST http://localhost:9090/-/reload
```

3. Проверить метрики в Prometheus UI:
- http://localhost:9090
- Запросы: `probe_success{job="services-health"}`, `probe_http_duration_seconds{job="services-health"}`

### Production

Blackbox exporter запускается автоматически вместе с Prometheus при деплое через `docker-compose.prod.yml`.

## PromQL запросы

### Проверка статуса всех сервисов
```promql
probe_success{job="services-health"}
```

### Время ответа сервисов
```promql
probe_http_duration_seconds{job="services-health"}
```

### HTTP статус коды
```promql
probe_http_status_code{job="services-health"}
```

### Статус конкретного сервиса
```promql
probe_success{job="services-health", service="web-app"}
```

## Примечания

- URL сервисов должны совпадать с теми, что указаны в конфигурации Prometheus
- В local окружении используется `host.docker.internal` для доступа к сервисам на хосте
- В production используются имена Docker сервисов
- При недоступности Prometheus API возвращается ошибка
- Метрики обновляются каждые 15 секунд (scrape_interval)

