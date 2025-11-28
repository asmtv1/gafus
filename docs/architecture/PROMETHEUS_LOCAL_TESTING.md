# Локальное тестирование Prometheus

## Быстрый старт

### 1. Запуск Prometheus и node_exporter

```bash
# Перейти в директорию с docker-compose
cd ci-cd/docker

# Запустить Prometheus и node_exporter
docker-compose -f docker-compose.local.yml up -d

# Проверить статус
docker-compose -f docker-compose.local.yml ps
```

### 2. Проверка работы

**Prometheus UI:**
```
http://localhost:9090
```

**Node Exporter метрики:**
```
http://localhost:9100/metrics
```

### 3. Настройка Error Dashboard для локального Prometheus

Добавьте переменную окружения в `.env` файл error-dashboard:

```bash
# apps/error-dashboard/.env.local
PROMETHEUS_URL=http://localhost:9090
```

Или экспортируйте перед запуском:

```bash
export PROMETHEUS_URL=http://localhost:9090
pnpm --filter @gafus/error-dashboard dev
```

### 4. Запуск Error Dashboard

```bash
# Из корня проекта
pnpm --filter @gafus/error-dashboard dev

# Error Dashboard будет доступен на
http://localhost:3005
```

### 5. Проверка метрик

1. **Prometheus UI**: http://localhost:9090
   - Перейдите в раздел "Graph"
   - Выполните запрос: `node_memory_MemTotal_bytes`
   - Нажмите "Execute"

2. **Error Dashboard**: http://localhost:3005/system-status
   - Откройте страницу System Status
   - Должны отображаться метрики из Prometheus

3. **API endpoint**: http://localhost:3005/api/system-status
   - Проверьте JSON ответ с метриками

## Полезные PromQL запросы для тестирования

### Память
```promql
# Общая память
node_memory_MemTotal_bytes

# Доступная память
node_memory_MemAvailable_bytes

# Процент использования
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### CPU
```promql
# Загрузка за 1 минуту
node_load1

# Количество CPU ядер
count(node_cpu_seconds_total{mode="idle"}) by (instance)
```

### Uptime
```promql
# Время работы в секундах
time() - node_boot_time_seconds
```

## Проверка работы node_exporter

```bash
# Проверить, что node_exporter собирает метрики
curl http://localhost:9100/metrics | grep node_memory_MemTotal_bytes

# Должен вернуть что-то вроде:
# node_memory_MemTotal_bytes 8589934592
```

## Проверка работы Prometheus

```bash
# Проверить статус Prometheus
curl http://localhost:9090/-/healthy

# Проверить список целей (targets)
curl http://localhost:9090/api/v1/targets

# Выполнить PromQL запрос через API
curl 'http://localhost:9090/api/v1/query?query=node_memory_MemTotal_bytes'
```

## Остановка

```bash
# Остановить контейнеры
docker-compose -f docker-compose.local.yml down

# Остановить и удалить volumes (очистить данные)
docker-compose -f docker-compose.local.yml down -v
```

## Решение проблем

### Prometheus не может подключиться к node_exporter

**Проблема:** В логах Prometheus ошибка "connection refused" к localhost:9100

**Решение:** 
1. Проверьте, что node_exporter запущен: `docker ps | grep node-exporter`
2. Проверьте, что node_exporter доступен: `curl http://localhost:9100/metrics`
3. В `prometheus.yml` убедитесь, что target указан как `localhost:9100` (для локальной разработки)

### Error Dashboard не может подключиться к Prometheus

**Проблема:** Ошибка 503 при запросе `/api/system-status`

**Решение:**
1. Проверьте, что Prometheus запущен: `docker ps | grep prometheus`
2. Проверьте переменную окружения: `echo $PROMETHEUS_URL`
3. Проверьте доступность Prometheus: `curl http://localhost:9090/-/healthy`
4. Убедитесь, что в `.env.local` указан правильный URL

### Метрики не отображаются

**Проблема:** Prometheus UI пустой или показывает "No data"

**Решение:**
1. Проверьте статус целей: http://localhost:9090/targets
2. Убедитесь, что node_exporter в статусе "UP"
3. Подождите 15-30 секунд (интервал сбора метрик)
4. Проверьте логи Prometheus: `docker logs gafus-prometheus-local`

## Отладка

### Просмотр логов

```bash
# Логи Prometheus
docker logs -f gafus-prometheus-local

# Логи node_exporter
docker logs -f gafus-node-exporter-local
```

### Проверка конфигурации Prometheus

```bash
# Проверить конфигурацию
docker exec gafus-prometheus-local promtool check config /etc/prometheus/prometheus.yml

# Перезагрузить конфигурацию без перезапуска
curl -X POST http://localhost:9090/-/reload
```

### Просмотр метрик node_exporter напрямую

```bash
# Все метрики
curl http://localhost:9100/metrics

# Только метрики памяти
curl http://localhost:9100/metrics | grep node_memory

# Только метрики CPU
curl http://localhost:9100/metrics | grep node_cpu
```

## Интеграция с существующими сервисами

Если у вас уже запущены PostgreSQL и Redis локально, можно добавить их в `docker-compose.local.yml`:

```yaml
services:
  # ... существующие сервисы ...
  
  prometheus:
    # ... конфигурация Prometheus ...
    depends_on:
      - node-exporter
      - postgres  # если есть
      - redis     # если есть
```

## Следующие шаги

После успешного локального тестирования:

1. Проверьте работу метрик в Error Dashboard
2. Протестируйте различные PromQL запросы
3. Убедитесь, что все метрики собираются корректно
4. Проверьте производительность (время ответа API)

## Примечания

- В локальной разработке Prometheus доступен на порту 9090
- Node Exporter доступен на порту 9100
- Данные Prometheus хранятся в volume `prometheus_local_data`
- Retention установлен на 7 дней для локальной разработки
- В production используется другой docker-compose файл

