# Prometheus запросы для графиков

Список доступных метрик и примеры запросов для построения графиков в Prometheus.

## 📊 Системные метрики (Node Exporter)

### CPU (Процессор)

**Загрузка CPU в процентах:**
```promql
100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

**Загрузка CPU по ядрам:**
```promql
100 - (irate(node_cpu_seconds_total{mode="idle"}[5m]) * 100)
```

**Load Average (средняя загрузка системы):**
```promql
node_load1        # За 1 минуту
node_load5        # За 5 минут
node_load15       # За 15 минут
```

**Количество ядер CPU:**
```promql
count(node_cpu_seconds_total{mode="idle"}) by (instance)
```

### Память (RAM)

**Использование памяти в процентах:**
```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

**Использованная память в байтах:**
```promql
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes
```

**Доступная память:**
```promql
node_memory_MemAvailable_bytes
```

**Общая память:**
```promql
node_memory_MemTotal_bytes
```

**Память в гигабайтах (удобнее для чтения):**
```promql
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024 / 1024
```

### Диск (Disk)

**Использование диска в процентах:**
```promql
100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)
```

**Свободное место на диске:**
```promql
node_filesystem_avail_bytes{mountpoint="/"}
```

**Общий размер диска:**
```promql
node_filesystem_size_bytes{mountpoint="/"}
```

**I/O операций чтения в секунду:**
```promql
rate(node_disk_reads_completed_total[5m])
```

**I/O операций записи в секунду:**
```promql
rate(node_disk_writes_completed_total[5m])
```

### Сеть (Network)

**Входящий трафик (байт/сек):**
```promql
rate(node_network_receive_bytes_total{device!="lo"}[5m])
```

**Исходящий трафик (байт/сек):**
```promql
rate(node_network_transmit_bytes_total{device!="lo"}[5m])
```

**Пакеты в секунду (входящие):**
```promql
rate(node_network_receive_packets_total{device!="lo"}[5m])
```

**Пакеты в секунду (исходящие):**
```promql
rate(node_network_transmit_packets_total{device!="lo"}[5m])
```

### Uptime (Время работы)

**Время работы сервера:**
```promql
time() - node_boot_time_seconds
```

## 🔍 Доступность сервисов (Blackbox Exporter)

**Доступность сервиса (1 = доступен, 0 = недоступен):**
```promql
probe_success{service="web-app"}
probe_success{service="trainer-panel"}
probe_success{service="admin-panel"}
probe_success{service="bull-board"}
```

**Время ответа сервиса (секунды):**
```promql
probe_http_duration_seconds{service="web-app"}
```

**HTTP статус код:**
```promql
probe_http_status_code{service="web-app"}
```

**Доступность всех сервисов:**
```promql
probe_success{job="services-health"}
```

## 🗄️ PostgreSQL метрики

**Статус PostgreSQL (1 = работает, 0 = не работает):**
```promql
pg_up
```

**Количество подключений:**
```promql
pg_stat_database_numbackends
```

**Размер базы данных:**
```promql
pg_database_size_bytes
```

**Cache Hit Ratio (процент попаданий в кэш):**
```promql
pg_stat_database_blks_hit / (pg_stat_database_blks_hit + pg_stat_database_blks_read) * 100
```

**Количество транзакций:**
```promql
pg_stat_database_xact_commit    # Успешные транзакции
pg_stat_database_xact_rollback  # Откаты
```

**Количество запросов:**
```promql
pg_stat_database_tup_returned  # SELECT
pg_stat_database_tup_inserted  # INSERT
pg_stat_database_tup_updated   # UPDATE
pg_stat_database_tup_deleted   # DELETE
```

## 🔴 Redis метрики

**Статус Redis (1 = работает, 0 = не работает):**
```promql
redis_up
```

**Использование памяти:**
```promql
redis_memory_used_bytes
redis_memory_max_bytes
```

**Процент использования памяти:**
```promql
(redis_memory_used_bytes / redis_memory_max_bytes) * 100
```

**Количество ключей:**
```promql
redis_db_keys{db="0"}
```

**Cache Hit Ratio:**
```promql
redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100
```

**Команды в секунду:**
```promql
rate(redis_commands_processed_total[5m])
```

**Количество подключений:**
```promql
redis_connected_clients
```

## 📦 Очереди BullMQ

**Количество заданий в очереди:**
```promql
bullmq_queue_waiting_total{queue="push"}
bullmq_queue_active_total{queue="push"}
bullmq_queue_completed_total{queue="push"}
bullmq_queue_failed_total{queue="push"}
```

**Скорость обработки заданий:**
```promql
rate(bullmq_queue_completed_total[5m])
rate(bullmq_queue_failed_total[5m])
```

**Время обработки заданий:**
```promql
bullmq_job_duration_seconds
```

## 📈 Полезные комбинированные запросы

**Средняя загрузка CPU за последний час:**
```promql
avg_over_time((100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))[1h:])
```

**Топ 5 сервисов по времени ответа:**
```promql
topk(5, probe_http_duration_seconds)
```

**Процент доступности всех сервисов:**
```promql
avg(probe_success{job="services-health"}) * 100
```

**Использование памяти в гигабайтах:**
```promql
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024 / 1024
```

**Свободное место на диске в гигабайтах:**
```promql
node_filesystem_avail_bytes{mountpoint="/"} / 1024 / 1024 / 1024
```

## 🎯 Примеры готовых графиков

### 1. Загрузка CPU и памяти
```promql
# CPU
100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Память
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### 2. Доступность всех сервисов
```promql
probe_success{job="services-health"}
```

### 3. Время ответа сервисов
```promql
probe_http_duration_seconds{job="services-health"}
```

### 4. Использование диска
```promql
100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)
```

### 5. Сетевой трафик
```promql
# Входящий
rate(node_network_receive_bytes_total{device!="lo"}[5m])

# Исходящий
rate(node_network_transmit_bytes_total{device!="lo"}[5m])
```

### 6. Метрики PostgreSQL
```promql
# Подключения
pg_stat_database_numbackends

# Cache Hit Ratio
pg_stat_database_blks_hit / (pg_stat_database_blks_hit + pg_stat_database_blks_read) * 100
```

### 7. Метрики Redis
```promql
# Использование памяти
redis_memory_used_bytes

# Cache Hit Ratio
redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100
```

### 8. Очереди BullMQ
```promql
# Задания в очереди
bullmq_queue_waiting_total

# Скорость обработки
rate(bullmq_queue_completed_total[5m])
```

## 💡 Советы по использованию

1. **Временные диапазоны:**
   - `[5m]` - за последние 5 минут
   - `[1h]` - за последний час
   - `[1d]` - за последний день

2. **Функции агрегации:**
   - `avg()` - среднее значение
   - `sum()` - сумма
   - `max()` - максимальное значение
   - `min()` - минимальное значение
   - `rate()` - скорость изменения
   - `irate()` - мгновенная скорость

3. **Фильтрация:**
   - `{service="web-app"}` - фильтр по метке
   - `{mountpoint="/"}` - фильтр по точке монтирования
   - `{device!="lo"}` - исключить устройство

4. **Форматирование:**
   - Для байт → гигабайты: `/ 1024 / 1024 / 1024`
   - Для процентов: `* 100`
   - Для секунд → минуты: `/ 60`

