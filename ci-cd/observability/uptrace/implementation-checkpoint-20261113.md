# Uptrace Cloud migration — локальный checkpoint 2026-11-13

Источник требований: `docs/audit/gafus-uptrace-cloud-migration-plan-20261113.md`.
Срез сделан в общей рабочей папке `/Users/asmtv1/Desktop/gafus-refactor`,
исходный HEAD `0dcd18c13c8d567d543d1981b18d3caa52b16503`.
При старте было 1 777 изменённых/неотслеживаемых путей разных задач,
поэтому **не выполнять git reset/checkout/clean и не коммитить чужие пути**.

## Выполнено локально (ещё не production acceptance)

- Создан read-only Viewer API инструмент `scripts/observability/uptrace-read.mjs`
  и 5 тестов. Внешний проект 9378 показал 2 старые синтетические трассы
  в окне 7 дней. За последние 15 минут ни spans, ни groups, ни
  Prometheus `up` данных не было.
- Защита публичной трассировки: public `traceparent` не становится
  trusted server parent и не диктует sampling. Вместо этого создаётся
  новая серверная трасса; валидный W3C context — только SpanLink.
  Legacy outbox source trace ID сохраняется безопасным атрибутом.
  Актуальный X-Trace-Id берётся из SDK; когда SDK отключён — fresh UUID.
  Файлы `packages/logger/src/serverTelemetry.ts`,
  `apps/api/src/lib/operation-observability.ts` и адресный тест.
- Улучшение экспортера мобильных ошибок: terminal status удаляет JSON
  payload из PostgreSQL spool, оставляя eventId для дедупликации;
  periodic TTL cleanup выполняется и при failed exporter tick;
  некорректный JSON в подтверждении OTLP классифицируется
  `OTLP_UNKNOWN_ACK`, а не как успешная выгрузка.
- Создан **неактивный** Nonprod-кандидат Alloy
  `ci-cd/docker/prometheus/config.uptrace-canary.alloy` и 3
  структурных теста, production `config.alloy` не изменён.

## Проверки

- `node --test scripts/observability/uptrace-read.test.mjs`: 5/5 PASS.
- `pnpm --filter @gafus/logger build`: PASS.
- `pnpm --filter @gafus/api exec vitest run --config vitest.config.ts src/lib/operation-observability.test.ts`: 6/6 PASS.
- `pnpm --filter @gafus/worker exec vitest run --config vitest.config.ts src/mobile-telemetry-export.test.ts`: 5/5 PASS.
- `pnpm --filter @gafus/api typecheck`: PASS.
- `pnpm --filter @gafus/worker typecheck`: PASS.
- `node --test scripts/qa/uptrace-alloy-candidate.test.mjs`: 3/3 PASS.
- `docker compose ... config --quiet`: BLOCKED; обязательные
  production environment secrets отсутствуют (например
  VOXIMPLANT_ACCOUNT_ID); не подставлять ложные credentials.
- Локальный Docker daemon не запущен: Alloy syntax/digest/restart
  validation не проводилась, структурный тест не заменяет `alloy validate`.

## Непройденные обязательные ворота

- **A/B:** browser via McpGo-Playwright невозможен: tunnel controlplane
  возвращает 403 `unsupported_country_region_territory`. ChatTerminalHub
  и локальные Playwright services активны, переподключение не помогает.
  Не проверены Cloud Billing/Usage/ACL, отдельный Nonprod project,
  billing/retention, источники Cloud.ru/Beget.
- **B/C:** не подтверждена доставка logs/traces/metrics в отдельный
  Nonprod project, нет production privacy scrub, Alloy WAL и durable
  log queue, неподтверждён server/native unsampled terminal error.
- **D/E/F/G:** Web RUM/Observe 57/native collectors и полная
  символизация не готовы, требуется реальная физическая QA
  на iOS/Android и private release artifacts.
- **H/I:** 14-дневный parity Yandex Monitoring, 12 панелей,
  alerts, on-call recovery и внешний watchdog не проверены.
- **J/K/L/M:** staging/prod canary, release/rollback drills,
  14+7 дней наблюдения, legacy history и отключение AppTracer/YC
  не выполнялись. **Ничего из legacy не отключать до gates.**

## Продолжение

1. Возобновить browser access обычным разрешённым путём, проверить
   Nonprod ACL/план и назначить отдельные scoped ingest credentials.
2. Получить isolated Docker/Alloy runner и валидировать candidate.
   Важное условие: перед любым запуском кандидата добавить независимые
   source-level privacy filters, persisted queues/WAL, private network и
   Nonprod-only source routing. Кандидат сейчас НЕГОТОВ к деплою.
3. Продолжить ingress/Observe/Web/native по очереди согласно разделу 15
   плана; собирать метрики, QA evidence и staged rollout.
4. Не удалять AppTracer, YC Monitoring, Yandex business analytics,
   AppMetrica и производственные секреты до закрытия L.

## Дополнительная регрессия границ

`pnpm check:core-boundaries` сейчас **FAIL** на существующих
прямых Prisma imports из модуля API mobile telemetry:
`ingest.realpg.test.ts`, `observe.realpg.test.ts`,
`observe-repository.ts`, `prisma-repository.ts`.
Сохранить нарушение как отдельный блокер E/C; не расширять frozen
exceptions и не обходить checker. После переноса DB implementation
в разрешённый Core server adapter нужен повторный полный прогон.
