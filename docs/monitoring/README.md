# Мониторинг GAFUS

## Обзор

В проекте используются:

- **Seq** — централизованное хранение серверных логов (Vector → Seq). См. [архитектура логирования](../architecture/logging-architecture.md) и [проверка Seq](../troubleshooting/CHECK_SEQ.md).
- **Tracer** — мониторинг клиентских ошибок (web, trainer-panel, mobile). См. [Tracer](./tracer.md).
- **Bull Board** — управление очередями.
- **Grafana** и **Prometheus** — метрики и дашборды (если развёрнуты).

## Документация

- [Tracer](./tracer.md) — клиентские ошибки
- [Grafana](./GRAFANA.md) — настройка и дашборды
- [Prometheus-запросы](./PROMETHEUS_QUERIES.md) — примеры запросов для графиков

Логирование приложений: [@gafus/logger](../packages/logger.md), [архитектура логирования](../architecture/logging-architecture.md).
