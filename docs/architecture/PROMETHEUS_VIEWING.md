# Просмотр метрик Prometheus

## Доступ к Prometheus UI

После запуска системы, Prometheus UI доступен по адресу:

**https://prometheus.gafus.ru**

### Основные разделы Prometheus UI

1. **Graph** - графики метрик с PromQL запросами
2. **Alerts** - настройка и просмотр алертов
3. **Status** - статус Prometheus, конфигурация, цели сбора метрик

## Полезные PromQL запросы для системных метрик

### Память

```promql
# Общая память
node_memory_MemTotal_bytes

# Доступная память
node_memory_MemAvailable_bytes

# Использованная память
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes

# Процент использования памяти
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### CPU

```promql
# Загрузка CPU за 1 минуту
node_load1

# Загрузка CPU за 5 минут
node_load5

# Загрузка CPU за 15 минут
node_load15

# Процент использования CPU (idle)
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Количество CPU ядер
count(node_cpu_seconds_total{mode="idle"}) by (instance)
```

### Uptime

```promql
# Время работы системы (в секундах)
time() - node_boot_time_seconds

# Время работы в часах
(time() - node_boot_time_seconds) / 3600
```

### Диск

```promql
# Свободное место на диске
node_filesystem_avail_bytes

# Использованное место на диске
node_filesystem_size_bytes - node_filesystem_avail_bytes

# Процент использования диска
(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100
```

### Сеть

```promql
# Входящий трафик (байт/сек)
rate(node_network_receive_bytes_total[5m])

# Исходящий трафик (байт/сек)
rate(node_network_transmit_bytes_total[5m])
```

## Просмотр метрик в Error Dashboard

Системные метрики также отображаются в Error Dashboard на странице **System Status**:

**https://monitor.gafus.ru/system-status**

Здесь отображаются:
- Использование памяти (total, used, free, percentage)
- Информация о CPU (количество ядер, модель, загрузка)
- Время работы системы (uptime)

Метрики обновляются каждые 30 секунд автоматически.

## API для получения метрик

Метрики доступны через API endpoint Error Dashboard:

```bash
GET https://monitor.gafus.ru/api/system-status
```

Ответ включает объект `metrics` с системными метриками:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "services": [...],
  "databases": [...],
  "metrics": {
    "memory": {
      "total": 8589934592,
      "used": 4294967296,
      "free": 4294967296,
      "percentage": 50.0
    },
    "cpu": {
      "count": 4,
      "model": "Intel Core i7",
      "usage": 1.5
    },
    "uptime": 86400
  }
}
```

## Прямой доступ к Prometheus API

Prometheus предоставляет REST API для программного доступа:

```bash
# Выполнить PromQL запрос
GET https://prometheus.gafus.ru/api/v1/query?query=node_memory_MemTotal_bytes

# Получить список всех метрик
GET https://prometheus.gafus.ru/api/v1/label/__name__/values
```

## Настройка алертов

В будущем можно настроить алерты через Alertmanager для:
- Высокого использования памяти (> 90%)
- Высокой загрузки CPU (> 80%)
- Недоступности сервисов
- Проблем с диском

## Примечания

- Prometheus собирает метрики каждые 15 секунд
- Данные хранятся 30 дней (настроено в docker-compose)
- node_exporter работает в host network mode для доступа к метрикам хоста
- Prometheus UI доступен только через HTTPS (через nginx)

