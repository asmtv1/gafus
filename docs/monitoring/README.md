# Мониторинг GAFUS

## Обзор

В проекте используются:

- **Tracer** — клиентские и серверные ошибки. См. [Tracer](./tracer.md). Логи — docker logs.
- **Bull Board** — управление очередями.
- **Grafana** и **Prometheus** — метрики и дашборды (если развёрнуты).

## Документация

- [Tracer](./tracer.md) — клиентские и серверные ошибки
- [Grafana](./GRAFANA.md) — настройка и дашборды
- [Prometheus-запросы](./PROMETHEUS_QUERIES.md) — примеры запросов для графиков

Логирование приложений: [@gafus/logger](../packages/logger.md), [архитектура логирования](../architecture/logging-architecture.md).
