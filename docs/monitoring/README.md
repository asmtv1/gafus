# Мониторинг GAFUS

## Обзор

В проекте используются:

- **Seq** — централизованное хранение логов (Vector → Seq). См. [архитектура логирования](../architecture/logging-architecture.md) и [проверка Seq](../troubleshooting/CHECK_SEQ.md).
- **Error Dashboard** — просмотр ошибок, очередей, статуса сервисов. См. [Error Dashboard](../apps/error-dashboard.md).
- **Grafana** и **Prometheus** — метрики и дашборды (если развёрнуты).

## Документация

- [Grafana](./GRAFANA.md) — настройка и дашборды
- [Prometheus-запросы](./PROMETHEUS_QUERIES.md) — примеры запросов для графиков

Логирование приложений: [@gafus/logger](../packages/logger.md), [архитектура логирования](../architecture/logging-architecture.md).
