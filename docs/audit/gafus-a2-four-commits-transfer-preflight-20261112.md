# GAFUS — четыре коммита A2, план будущего локального переноса

**Только подготовка. Ни один cherry-pick / merge / patch не применён. A1 final manifest отсутствует.**

Основа A1/A3 `0dcd18c13`; A2 HEAD `bd93aef2234e228191c1e112655d0c5c1b2a711e`. Уникальных путей A2: **39**, изменений по отдельным коммитам: **56**. Прямые пересечения с A3 final 39: **0**; P0 A2: **6**.

## Линейная зависимость (обязательный порядок)

| Этап | Коммит | Затронуто | Прямые ожидаемые препятствия на текущем A1 |
|---|---|---:|---|
| 1 | `751a435ec509` | 23 | ALREADY_EXACT_AT_THIS_COMMIT: 5, POTENTIAL_ADD_ADD: 6, BASE_MATCH_OR_NEW_PATH: 8, POTENTIAL_CONTENT_CONFLICT: 4 |
| 2 | `b05ca9c4e1c7` | 20 | BASE_MATCH_OR_NEW_PATH: 9, POTENTIAL_CONTENT_CONFLICT: 7, MISSING_A1_MODIFIED_PATH: 4 |
| 3 | `fbd89d62a977` | 11 | BASE_MATCH_OR_NEW_PATH: 6, MISSING_A1_MODIFIED_PATH: 4, POTENTIAL_CONTENT_CONFLICT: 1 |
| 4 | `bd93aef2234e` | 2 | MISSING_A1_MODIFIED_PATH: 2 |

Важно: сравнение каждого коммита выполнено **отдельно с незавершённым A1**, а не поверх уже перенесённых коммитов. Поэтому `MISSING_A1_MODIFIED_PATH` в этапах 2–4 обычно означает зависимость от этапа 1/2, а не реальный будущий конфликт. 3-way merge после финального A1 может давать другую классификацию.

## Пофайловые рекомендации P0 и ручное согласование

| Файл | Коммиты | Взаимодействие с A1 | Обязательное решение |
|---|---|---|---|
| `apps/api/src/lib/operation-observability.ts` | 1,2 | не совпадает с финальным A2 | P0_API_TRACING_REVIEW: Preserve A1 API operationId/requestId boundaries and existing middleware; reconcile A2 latest wrappers and privacy-safe OTLP exporter; local API contract test. |
| `ci-cd/docker/grafana/dashboards/gafus-api-latency.json` | 1 | не совпадает с финальным A2 | P1_GRAFANA_PANEL_REVIEW: A1 may have newer dashboard layout and metric families; merge panel IDs/queries without blind whole-file replacement. |
| `ci-cd/docker/prometheus/config.alloy` | 1,2 | не совпадает с финальным A2 | P0_ALLOY_PIPELINES_REVIEW: Merge A1 existing scrape/routing and A2 OTLP/metrics guards and bounded labels; no secret exposure. |
| `ci-cd/docker/prometheus/gafus-alerts.yml` | 1 | не совпадает с финальным A2 | P0_ALERT_RULES_REVIEW: Union A1 existing rules and A2 new reliability families; avoid duplicate alert names, keep DLQ/360p rules; run local rules tests. |
| `ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` | 1,2 | не совпадает с финальным A2 | P1_MONITORING_CONTRACT_RECONCILE: Preserve A1 existing test coverage + A2 data labels/Prisma metrics, 12 local OTLP/monitor tests. |
| `packages/logger/package.json` | 1 | уже совпадает с финальным A2 | P0_LOGGER_PACKAGE_PRESERVE_OR_VERIFY: A1 already contains committed A2 five OTel dependencies and ./server-telemetry exports; require matching SHA or approved reconciled package manifest. |
| `packages/logger/src/serverTelemetry.ts` | 1,2,3 | не совпадает с финальным A2 | P0_LOGGER_PRIVACY_REVIEW: Use latest A2 committed tracing implementation reconciled with A1 query labels; no SQL, JWS, tokens, PII; emit bounded metrics and fail-open OTLP. |
| `packages/prisma/src/client.ts` | 1 | не совпадает с финальным A2 | P1_PRISMA_CLIENT_WRAP_REVIEW: Preserve A1 client lifecycle/reuse and A2 query duration; ensure metrics preview and no duplicated PrismaClient. |
| `pnpm-lock.yaml` | 1 | не совпадает с финальным A2 | P0_LOCK_REGENERATE_FROM_FINAL_A1_MANIFESTS: Preserve A1 70 workspace importer graph and 7 patches; A1 already has 5 A2 OTel deps. Never use old A2 whole lock. Regenerate once offline on isolated candidate after package reconciliation. |
| `packages/prisma/schema.prisma` | 2 | не совпадает с финальным A2 | P0_PRISMA_METRICS_HUNK_ONLY: Preserve all A1 models, migrations, QuestionLegacyPhotoDeletion and Chat2 outbox fields/index; add only Prisma client previewFeatures metrics if absent. Verify prisma validate + empty DDL diff for flag. |

## Результат dry-run `git apply --check` (никаких изменений)

Проверка выполнена отдельно на временной копии **39 затронутых файлов A1** (`~/Library/Logs/gafus-refactor-regression/a2-four-commits-readonly-preflight-20261112-0648`), патчи не применялись. Каждый коммит проверялся против *того же исходного состояния*, а не после предыдущего.

| Коммит | Результат | Строк ошибок |
|---|---|---:|
| `751a435ec509` | FAIL | 21 |
| `b05ca9c4e1c7` | FAIL | 16 |
| `fbd89d62a977` | FAIL | 6 |
| `bd93aef2234e` | FAIL | 2 |

## Все 39 уникальных затронутых путей (SHA и статус — в JSON)

| Файл | Этапы | A1 = финальный A2? | Прямой A3 final | Категория |
|---|---|---|---|---|
| `apps/api/src/lib/operation-observability.test.ts` | 1 | да | нет | `A2_RUNTIME_OR_CONTRACT` |
| `apps/api/src/lib/operation-observability.ts` | 1,2 | нет | нет | `P0_API_TRACING_REVIEW` |
| `ci-cd/docker/grafana/dashboards/gafus-a2-storage-dependencies.json` | 1,2 | нет | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/grafana/dashboards/gafus-api-latency.json` | 1 | нет | нет | `P1_GRAFANA_PANEL_REVIEW` |
| `ci-cd/docker/grafana/dashboards/gafus-media-chat.json` | 1 | да | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/grafana/dashboards/gafus-operations-reliability.json` | 1 | да | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/prometheus/config.alloy` | 1,2 | нет | нет | `P0_ALLOY_PIPELINES_REVIEW` |
| `ci-cd/docker/prometheus/gafus-alerts-agent2.promtool.test.yml` | 1,2 | нет | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml` | 1 | да | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/prometheus/gafus-alerts.yml` | 1 | нет | нет | `P0_ALERT_RULES_REVIEW` |
| `ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` | 1,2 | нет | нет | `P1_MONITORING_CONTRACT_RECONCILE` |
| `docs/audit/gafus-agent-2-observability-20261111.md` | 1,2 | нет | нет | `DOC_VERIFY_HISTORICAL_ONLY` |
| `packages/logger/package.json` | 1 | да | нет | `P0_LOGGER_PACKAGE_PRESERVE_OR_VERIFY` |
| `packages/logger/src/serverTelemetry.ts` | 1,2,3 | нет | нет | `P0_LOGGER_PRIVACY_REVIEW` |
| `packages/prisma/scripts/a2-query-duration-isolated.ts` | 1,2 | нет | нет | `A2_RUNTIME_OR_CONTRACT` |
| `packages/prisma/src/client.ts` | 1 | нет | нет | `P1_PRISMA_CLIENT_WRAP_REVIEW` |
| `pnpm-lock.yaml` | 1 | нет | нет | `P0_LOCK_REGENERATE_FROM_FINAL_A1_MANIFESTS` |
| `scripts/qa/observability-agent2-local-gates.sh` | 1,2,3 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-multi-instance.mjs` | 1 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-multi-instance.test.mjs` | 1 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-restore-rpo-rto.sh` | 1 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/otel-local-collector.test.mjs` | 1,2 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/prometheus-alertmanager-isolated.sh` | 1 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `apps/api/src/a2-observability-private-server.ts` | 2 | нет | нет | `A2_RUNTIME_OR_CONTRACT` |
| `docs/audit/gafus-agent-2-followup-20261112.md` | 2,3,4 | нет | нет | `DOC_VERIFY_HISTORICAL_ONLY` |
| `docs/audit/gafus-agent-2-observability-local-receipt-20261112.json` | 2,3,4 | нет | нет | `DOC_VERIFY_HISTORICAL_ONLY` |
| `packages/prisma/schema.prisma` | 2 | нет | нет | `P0_PRISMA_METRICS_HUNK_ONLY` |
| `packages/worker/src/a2-observability-private-worker.ts` | 2 | нет | нет | `A2_RUNTIME_OR_CONTRACT` |
| `scripts/qa/observability-load-median.mjs` | 2 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-load-median.test.mjs` | 2 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-local-trace-sink.mjs` | 2 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-promtool-rules.sh` | 2 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-real-multi-instance-isolated.sh` | 2,3 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `ci-cd/docker/docker-compose.observability-logs.yml` | 3 | нет | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `ci-cd/docker/observability-log-rotation.contract.test.mjs` | 3 | нет | нет | `DOCKER_MONITORING_TEST_OR_DASHBOARD` |
| `docs/audit/gafus-agent-2-staging-evidence-template.json` | 3 | нет | нет | `DOC_VERIFY_HISTORICAL_ONLY` |
| `scripts/qa/observability-otel-overhead.mjs` | 3 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-staging-preflight.mjs` | 3 | нет | нет | `A2_QA_GATE_SEQUENCE` |
| `scripts/qa/observability-staging-preflight.test.mjs` | 3 | нет | нет | `A2_QA_GATE_SEQUENCE` |
