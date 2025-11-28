# Просмотр метрик в Prometheus UI

## Как просматривать метрики в Prometheus

### 1. Откройте Prometheus UI

```
http://localhost:9090
```

### 2. Перейдите в раздел "Graph"

В верхнем меню нажмите **"Graph"** (или "Query").

### 3. Введите PromQL запрос

В поле ввода введите любой из запросов ниже и нажмите **"Execute"**.

## Полезные запросы для системных метрик

### Память

```promql
# Общая память (в байтах)
node_memory_MemTotal_bytes

# Доступная память
node_memory_MemAvailable_bytes

# Использованная память
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes

# Процент использования памяти
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Память в гигабайтах
node_memory_MemTotal_bytes / 1024 / 1024 / 1024
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
# Время работы системы в секундах
time() - node_boot_time_seconds

# Время работы в часах
(time() - node_boot_time_seconds) / 3600

# Время работы в днях
(time() - node_boot_time_seconds) / 86400
```

### Диск

```promql
# Свободное место на диске
node_filesystem_avail_bytes

# Использованное место
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

## Как работать с графиками

### Просмотр графика

1. Введите запрос
2. Нажмите **"Execute"**
3. Нажмите **"Graph"** (вкладка рядом с "Table")
4. Увидите график метрики во времени

### Настройка времени

- Используйте кнопки **-15m**, **-1h**, **-6h**, **-1d** для выбора периода
- Или выберите диапазон в календаре справа

### Сохранение графика

- Нажмите на звездочку ⭐ рядом с запросом, чтобы сохранить его
- Сохраненные запросы доступны в разделе "Alerts"

## Примеры готовых запросов

### Системные метрики (как в Error Dashboard)

```promql
# Память - процент использования
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# CPU - загрузка
node_load1

# Uptime - в секундах
time() - node_boot_time_seconds
```

### Все метрики node_exporter

В Prometheus UI:
1. Перейдите в **"Status"** → **"Targets"**
2. Нажмите на `http://node-exporter:9100/metrics`
3. Увидите все доступные метрики

Или введите в Graph:
```promql
{job="node-exporter"}
```

## Просмотр всех метрик

### Список всех метрик

1. Перейдите в **"Status"** → **"TSDB Status"**
2. Или используйте запрос:
```promql
{__name__=~".+"}
```

### Поиск метрик

В поле ввода начните вводить название метрики - Prometheus покажет автодополнение.

Например, начните вводить `node_memory` и увидите все метрики памяти.

## Полезные разделы Prometheus UI

- **Graph** - выполнение запросов и просмотр графиков
- **Alerts** - настройка и просмотр алертов
- **Status** → **Targets** - статус источников метрик
- **Status** → **Configuration** - текущая конфигурация
- **Status** → **TSDB Status** - статистика базы данных метрик

## Советы

1. **Используйте автодополнение** - Prometheus подсказывает доступные метрики
2. **Сохраняйте запросы** - нажимайте ⭐ для сохранения
3. **Экспортируйте графики** - можно скопировать ссылку на график
4. **Используйте функции** - `rate()`, `avg()`, `sum()`, `max()` и другие

