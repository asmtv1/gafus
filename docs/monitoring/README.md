# Мониторинг GAFUS

Технические ошибки, логи, трассы и метрики направляются в **Uptrace Cloud**.

- API/Worker: OTLP traces и структурированные диагностические события.
- Web/admin/trainer/Bull Board: анонимная client telemetry через API → PostgreSQL → Worker → Uptrace.
- Mobile: анонимные JS-события в очереди GAFUS; native iOS/Android crash через `expo-observe` → GAFUS API → PostgreSQL → Worker → Uptrace. Нужен **новый нативный бинарник** и отдельное подтверждение на устройствах; см. [нативные падения](./uptrace-native-crashes.md).
- Метрики инфраструктуры: Grafana Alloy → Uptrace, без второго cloud sink.
- Очереди: Bull Board. Локальные Docker logs остаются для отладки.

См. [Prometheus-запросы](./PROMETHEUS_QUERIES.md) и [переход на Uptrace](../../ci-cd/observability/uptrace/README.md).

**AppMetrica и Яндекс Метрика относятся к продуктовой аналитике** и не являются системой технического мониторинга. Резервные копии и хранилища Яндекса также не затрагиваются.
