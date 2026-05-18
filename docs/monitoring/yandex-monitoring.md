# Yandex Cloud Monitoring

Метрики собираются через Grafana Alloy и отправляются в Yandex Cloud Monitoring (remote_write).

## Доступ

- **Консоль:** [Yandex Cloud Monitoring](https://console.cloud.yandex.ru/monitoring)
- **Workspace ID:** значение из `YC_MONITORING_WORKSPACE_ID`

## Архитектура

```
[node-exporter]      →
[postgres-exporter]  → [Grafana Alloy] → relabel (allowlist) → remote_write → [Yandex Monitoring]
[blackbox-exporter]  →
```

Redis-exporter не используется. В Yandex уходят только `probe_success`, `pg_up` и метрики node-exporter для CPU/RAM/диска (остальное, включая BullMQ, не отправляется).

Alloy — headless сервис (без UI). Не экспонирует порты наружу. Healthcheck: `http://localhost:12345/-/ready` (внутренний).

## Конфигурация

- **Конфиг Alloy:** `ci-cd/docker/prometheus/config.alloy`
- **Scrape targets:** node-exporter, postgres-exporter, blackbox (services-health: web-app, api, trainer-panel, admin-panel, worker, bull-board). Перед remote_write — allowlist имён метрик (см. `config.alloy`).
- **remote_write:** Yandex Monitoring, аутентификация через `YC_MONITORING_API_KEY` (env var → sys.env)

## Импорт дашбордов

Скрипт: `scripts/import-dashboards-to-yandex.sh`

Требования: Python 3, yc CLI (настроен), grpcurl, jq, cloudapi (git clone в /tmp/cloudapi).

Переменные (можно задать в env):
- `FOLDER_ID` — папка Yandex Cloud (по умолчанию b1g0vbm2pvav4oqc4ds9)
- `PROMETHEUS_DS_ID` — ID Managed Service for Prometheus (по умолчанию fbe681839dit4q6504um)
- `WORKSPACE_ID` — workspace ID (по умолчанию monj8dpjri8u0bbqvq71)

```bash
./scripts/import-dashboards-to-yandex.sh
```

Исходные дашборды: `ci-cd/docker/grafana/dashboards/` (overview, system-metrics, postgres-metrics, services-availability, bullmq-queues). Overview — консолидированный дашборд (сервисы, DB, ресурсы, push queue).

## Алерты и push на телефон

Готовые запросы и настройка канала **Push** (приложение Yandex Cloud): [yandex-alerts-gafus.md](./yandex-alerts-gafus.md).

## PromQL в Explore

В Yandex Monitoring → Explore доступен PromQL. Примеры из [PROMETHEUS_QUERIES.md](./PROMETHEUS_QUERIES.md) работают без изменений.

## Troubleshooting

- **Метрики не появляются:** `docker logs gafus-alloy`, проверить `YC_MONITORING_API_KEY`, сетевая доступность `monitoring.api.cloud.yandex.net`
- **401 Unauthorized:** Невалидный API-ключ. Проверить сервис-аккаунт и ключ в Yandex Cloud.
- **403 Forbidden:** У сервис-аккаунта нет роли `monitoring.editor` на папку.
- **Ошибки remote_write:** queue_config, metadata_config — см. [prometheus.remote_write](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/)
- **Alloy ready check:** `docker exec gafus-alloy sh -lc "grep -q ':3039 .* 0A ' /proc/net/tcp /proc/net/tcp6"`
