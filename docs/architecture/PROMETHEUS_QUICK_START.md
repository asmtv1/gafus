# Быстрый старт: Тестирование Prometheus локально

## Шаг 1: Запуск Prometheus и node_exporter

```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml up -d
```

Проверьте, что контейнеры запущены:
```bash
docker-compose -f docker-compose.local.yml ps
```

## Шаг 2: Откройте Prometheus UI

```
http://localhost:9090
```

В Prometheus UI:
1. Перейдите в раздел **Graph** (вверху)
2. Введите запрос: `node_memory_MemTotal_bytes`
3. Нажмите **Execute**
4. Должен появиться график с метрикой памяти

## Шаг 3: Настройте Error Dashboard

Создайте или обновите `.env.local` в `apps/error-dashboard/`:

```bash
# apps/error-dashboard/.env.local
PROMETHEUS_URL=http://localhost:9090
```

## Шаг 4: Запустите Error Dashboard

```bash
# Из корня проекта
PROMETHEUS_URL=http://localhost:9090 pnpm --filter @gafus/error-dashboard dev
```

Или экспортируйте переменную:
```bash
export PROMETHEUS_URL=http://localhost:9090
pnpm --filter @gafus/error-dashboard dev
```

## Шаг 5: Проверьте метрики

1. **Error Dashboard UI**: http://localhost:3005/system-status
   - Должны отображаться метрики из Prometheus

2. **API endpoint**: http://localhost:3005/api/system-status
   - Откройте в браузере или выполните:
   ```bash
   curl http://localhost:3005/api/system-status | jq .metrics
   ```

## Полезные команды

### Проверка работы node_exporter
```bash
curl http://localhost:9100/metrics | grep node_memory_MemTotal_bytes
```

### Проверка работы Prometheus
```bash
curl http://localhost:9090/-/healthy
```

### Просмотр логов
```bash
# Prometheus
docker logs -f gafus-prometheus-local

# Node Exporter
docker logs -f gafus-node-exporter-local
```

### Остановка
```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml down
```

## Тестовые PromQL запросы

В Prometheus UI (http://localhost:9090) попробуйте:

```promql
# Память
node_memory_MemTotal_bytes
node_memory_MemAvailable_bytes
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# CPU
node_load1
count(node_cpu_seconds_total{mode="idle"}) by (instance)

# Uptime
time() - node_boot_time_seconds
```

## Решение проблем

**Ошибка подключения к Prometheus:**
- Убедитесь, что Prometheus запущен: `docker ps | grep prometheus`
- Проверьте URL: `curl http://localhost:9090/-/healthy`

**Метрики не отображаются:**
- Проверьте статус целей: http://localhost:9090/targets
- Убедитесь, что node_exporter в статусе "UP"
- Подождите 15-30 секунд (интервал сбора)

**Error Dashboard показывает ошибку 503:**
- Проверьте переменную окружения: `echo $PROMETHEUS_URL`
- Убедитесь, что Prometheus доступен: `curl http://localhost:9090/-/healthy`

