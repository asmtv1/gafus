# Grafana - Визуализация метрик

Grafana используется для визуализации метрик из Prometheus с возможностью сохранения дашбордов и запросов.

## Доступ

- **URL:** https://grafana.gafus.ru
- **Логин:** admin (или значение из `GRAFANA_ADMIN_USER`)
- **Пароль:** значение из переменной окружения `GRAFANA_ADMIN_PASSWORD`

## Предустановленные дашборды

После первого запуска Grafana автоматически загружает следующие дашборды:

### 1. Системные метрики
- Загрузка CPU (%)
- Использование памяти (%)
- Использование диска (%)
- Сетевой трафик (входящий/исходящий)
- Load Average (1, 5, 15 минут)

### 2. Доступность сервисов
- Статус доступности всех сервисов (Up/Down)
- Время ответа сервисов
- HTTP статус коды

### 3. PostgreSQL метрики
- Статус PostgreSQL
- Количество подключений
- Cache Hit Ratio
- Транзакции (commits/rollbacks)
- Запросы (SELECT, INSERT, UPDATE, DELETE)

### 4. Redis метрики
- Статус Redis
- Использование памяти
- Cache Hit Ratio
- Команды в секунду
- Количество ключей
- Активные подключения

### 5. Очереди BullMQ
- Задания в очереди (waiting/active)
- Завершенные задания (rate)
- Неудачные задания (rate)
- Время обработки заданий

## Создание собственных дашбордов

1. Войдите в Grafana
2. Перейдите в **Dashboards** → **New** → **New Dashboard**
3. Добавьте панели (panels) с метриками из Prometheus
4. Сохраните дашборд - он будет доступен при следующем входе

## Использование Prometheus запросов

Все запросы из [PROMETHEUS_QUERIES.md](./PROMETHEUS_QUERIES.md) можно использовать в Grafana:

1. Создайте новую панель
2. Выберите datasource **Prometheus**
3. Введите PromQL запрос
4. Настройте визуализацию (график, таблица, статистика)

## Примеры запросов

### Загрузка CPU
```promql
100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### Использование памяти
```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### Доступность сервисов
```promql
probe_success{job="services-health"}
```

## Настройка

### Переменные окружения

- `GRAFANA_ADMIN_USER` - имя администратора (по умолчанию: admin)
- `GRAFANA_ADMIN_PASSWORD` - пароль администратора (обязательно)
- `GRAFANA_SECRET_KEY` - секретный ключ для сессий (опционально)

### Конфигурация

Конфигурация Grafana находится в:
- `ci-cd/docker/grafana/grafana.ini` - основная конфигурация
- `ci-cd/docker/grafana/provisioning/` - автоматическая настройка datasources и dashboards

### Данные

Данные Grafana (дашборды, пользователи, настройки) хранятся в Docker volume `grafana_data` и сохраняются между перезапусками.

## Troubleshooting

### Grafana не подключается к Prometheus

1. Проверьте, что Prometheus запущен: `docker ps | grep prometheus`
2. Проверьте логи Grafana: `docker logs gafus-grafana`
3. Проверьте конфигурацию datasource в Grafana UI: **Configuration** → **Data Sources**

### Дашборды не загружаются

1. Проверьте права доступа к файлам дашбордов
2. Проверьте формат JSON файлов дашбордов
3. Проверьте логи Grafana на наличие ошибок парсинга

### Не могу войти в Grafana

1. Проверьте переменные окружения `GRAFANA_ADMIN_USER` и `GRAFANA_ADMIN_PASSWORD`
2. Проверьте логи Grafana для ошибок аутентификации
3. Попробуйте сбросить пароль через переменную окружения

## Полезные ссылки

- [Документация Grafana](https://grafana.com/docs/grafana/latest/)
- [Prometheus запросы](./PROMETHEUS_QUERIES.md)
- [Prometheus конфигурация](../ci-cd/docker/prometheus/prometheus.yml)

