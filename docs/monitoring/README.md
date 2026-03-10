# Мониторинг GAFUS

## Обзор

В проекте используются:

- **Tracer** — клиентские и серверные ошибки. См. [Tracer](./tracer.md). Логи — docker logs.
- **Bull Board** — управление очередями.
- **Yandex Cloud Monitoring** — метрики и дашборды (через Grafana Alloy → remote_write).

## Документация

- [Tracer](./tracer.md) — клиентские и серверные ошибки
- [Yandex Monitoring](./yandex-monitoring.md) — настройка, дашборды, troubleshooting
- [Prometheus-запросы](./PROMETHEUS_QUERIES.md) — примеры запросов для графиков

Логирование приложений: [@gafus/logger](../packages/logger.md), [архитектура логирования](../architecture/logging-architecture.md).
