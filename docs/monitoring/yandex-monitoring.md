# Yandex Cloud Monitoring

Метрики собираются через Grafana Alloy и отправляются в Yandex Cloud Monitoring (remote_write).

## Доступ

- **Консоль:** [Yandex Cloud Monitoring](https://console.cloud.yandex.ru/monitoring)
- **Workspace ID:** значение из `YC_MONITORING_WORKSPACE_ID`

## Архитектура

```
[node-exporter]      →
[postgres-exporter]  → [Grafana Alloy] → remote_write → [Yandex Monitoring]
[blackbox-exporter]  →
[bull-board /metrics] →
```

Redis-exporter не используется. Метрики node-exporter фильтруются (relabel): исключаются `node_disk_io_*`, `node_netstat_*`, `node_sockstat_*`.

Alloy — headless сервис (без UI). Не экспонирует порты наружу. Healthcheck: `http://localhost:12345/-/ready` (внутренний).

## Конфигурация

- **Конфиг Alloy:** `ci-cd/docker/prometheus/config.alloy`
- **Scrape targets:** node-exporter (с relabel-фильтром), postgres-exporter, blackbox (services-health: web-app, api, trainer-panel, admin-panel, worker, bull-board), bullmq-queues
- **remote_write:** Yandex Monitoring, аутентификация через `YC_MONITORING_API_KEY` (env var → sys.env)

## Импорт дашбордов

Скрипт: `scripts/import-dashboards-to-yandex.sh`

Требования: Python 3, yc CLI (настроен), grpcurl, jq, cloudapi (git clone в /tmp/cloudapi).

Переменные (можно задать в env):
- `FOLDER_ID` — папка Yandex Cloud (по умолчанию b1g0vbm2pvav4oqc4ds9)
- `PROMETHEUS_DS_ID` — ID Managed Service for Prometheus (по умолчанию fbe681839dit4q6504um)
- `WORKSPACE_ID` — workspace ID (по умолчанию monn9k9fdti7o4qa45m1)

```bash
./scripts/import-dashboards-to-yandex.sh
```

Исходные дашборды: `ci-cd/docker/grafana/dashboards/` (overview, system-metrics, postgres-metrics, services-availability, bullmq-queues). Overview — консолидированный дашборд (сервисы, DB, ресурсы, push queue).

## PromQL в Explore

В Yandex Monitoring → Explore доступен PromQL. Примеры из [PROMETHEUS_QUERIES.md](./PROMETHEUS_QUERIES.md) работают без изменений.

## Troubleshooting

- **Метрики не появляются:** `docker logs gafus-alloy`, проверить `YC_MONITORING_API_KEY`, сетевая доступность `monitoring.api.cloud.yandex.net`
- **401 Unauthorized:** Невалидный API-ключ. Проверить сервис-аккаунт и ключ в Yandex Cloud.
- **403 Forbidden:** У сервис-аккаунта нет роли `monitoring.editor` на папку.
- **Ошибки remote_write:** queue_config, metadata_config — см. [prometheus.remote_write](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/)
- **Alloy ready check:** `docker exec gafus-alloy wget -qO- http://localhost:12345/-/ready`
