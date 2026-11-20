# Payment + Worker: измеряемый coverage-пилот (19.11.2026)

**Historical baseline (before targeted transition/webhook tests).** For the measured improvement and current baseline see [`TEST_RISK_COVERAGE_TARGETED_20261119.md`](./TEST_RISK_COVERAGE_TARGETED_20261119.md). The old counts below are preserved as a comparison point, not current release coverage.

**Решение:** `MEASURED / INFORMATIONAL`, **не release-ready**. Только отдельный профиль `coverage-risk`; ни в `ci`, ни в `full`, ни в обязательные release gates он не включён. Тесты выполняются на свежих локальных PostgreSQL 18 c `prisma db push`, случайными loopback-портами и синтетическими провайдерами. Реальные YooKassa/Apple/Beget, Worker process restart/`SIGKILL` и чистая цепочка `prisma migrate deploy` этим не подтверждены.

## Команда и квитанции

```bash
pnpm test:coverage-risk
pnpm test:coverage-risk --scenario coverage.payment
pnpm test:coverage-risk --scenario coverage.worker
node scripts/qa/test-system.mjs report --run-id qa-49f61b0e-2326-4d8a-b5d9-c7240e0762f3
```

Уже выполненный исходный SQL-прогон: `.qa/testing/qa-49f61b0e-2326-4d8a-b5d9-c7240e0762f3/summary.json` / `summary.md`, `REPORT 0`, **2/2** измеренных задач, **4/4** исходных файла, **23/23** реальных Vitest-assertions (15 payment + 8 Worker), без failed/skipped. Финальная квитанция повторно проверена командой `report --run-id` на текущих V8/Istanbul JSON и исходных TS-файлах.

Baseline зафиксирован в [`tests/catalog/coverage-risk-baseline.json`](../../tests/catalog/coverage-risk-baseline.json) как **локальный снимок грязного рабочего дерева** на `04052d616`, а не как порог принятия релиза. В этом baseline V8 source maps и Istanbul JSON измерены согласованными `vitest 4.1.0` + `@vitest/coverage-v8 4.1.0` и зафиксирован SHA-256 каждого исходного файла.

## Измеренный baseline: строки и ветви

| Область / точно измеряемый TS-источник | Строки | Ветви | Что реально упражнялось |
| --- | ---: | ---: | --- |
| `packages/subscription-payment-server/src/paymentService.ts` | **86/547** (~15,7%) | **72/539** (~13,4%) | Реальная платёжная обработка через coverage-only адаптер исходного TS: конкурентные webhook, отказ верификации, retry, grant, refund |
| `packages/subscription-payment-server/src/appleSubscriptionState.ts` | **17/20** (85%) | **41/53** (~77,4%) | Запись и ревизии верифицированного Apple subscription state, конкурентные/запаздывающие уведомления в одноразовой БД |
| `packages/subscription-payment-server/src/subscriptionTransitions.ts` | **2/19** (~10,5%) | **0/27** (0%) | Источник попал в счётчики V8, но ветви не покрыты в этой инструментированной конфигурации; не засчитывать поведение переходов как source-coverage |
| `packages/worker/src/media-cdn-purge-worker.ts` | **21/37** (~56,8%) | **20/35** (~57,1%) | Обработка purge jobs: claim, retry, failure, checkpoint, idempotent recovery; реальные SQL fixtures и мокированный CDN |

**Сумма только этих четырёх непересекающихся исходников:** **126/623 строк (~20,22%)**, **133/654 ветви (~20,34%)**. Числители/знаменатели сложены по исходным файлам, проценты пакетов не усредняются. Это **не покрытие всех платежей, всего Worker или монорепозитория**. Ноль ветвей для `subscriptionTransitions.ts` остаётся нулём, а не «100% из нулевого знаменателя».

## Что не измерено

- `packages/media-server/src/mediaCdnPurgeRepository.ts`: SQL-репозиторий задействован через пакетный `dist`, но **не входит в валидный TS-source coverage** этого профиля. Его экспериментальные 100% из предыдущего пробного прохода **исключены** из итогового baseline.
- `packages/subscription-payment-server/src/yookassaProvider.ts`, `appleProvider.ts`, `paymentFinanceService.ts` и `apps/api/src/routes/v1/payment-provider-webhooks.ts`: внешняя верификация, HTTP-маршруты и финансовые адаптеры вне выбранного набора.
- `packages/worker/src/chat2-outbox-worker.ts`, `accountCleanupWorker.ts`, `feed-worker.ts`, Redis/BullMQ lifecycle, настоящий restart/SIGKILL, реальные CDN-операции и другие worker entrypoints.
- Инструментированная проверка не доказывает соответствие скомпилированного `dist` текущему TS, полную матрицу поведения и реальный платежный sandbox. Полные release acceptance / GitHub Actions execution остаются открытыми.

## Защита от ложного зелёного результата

`tests/support/coverage-risk-report.mjs` **не использует отображаемый Vitest процент как источник истины**: пересчитывает уникальные исполняемые строки по `statementMap`/`s` и ветви по `branchMap`/`b` из реального `coverage-final.json`; сверяет их с `coverage-summary.json` и `lcov.info`. Требует точных путей **всех** файлов списка, ненулевых знаменателей строк и ветвей каждого файла, корректного источника source map и текущего SHA-256. Читает baseline и проверяет пару версий `vitest/@vitest/coverage-v8`. Пустой JSON, неизвестный файл, пропущенный источник, подменённый процент 100, порча raw counters, изменение TS после прогона или дублирующийся named case переводят результат в `incomplete`/`REPORT 2`. Отрицательные фикстуры проверяются командой `pnpm test:system:contract`. Отдельно проверена подмена **реального** `coverage-summary.json`: установка `paymentService.ts.lines.pct=100` при прежних 86/547 дала `REPORT 2`; после точного восстановления файла снова `REPORT 0`, исходные доказательства сохранены.

Сырые evidence-файлы лежат только внутри `.qa/testing/qa-*/tasks/*/`: `tests.json`, `coverage/{core,subscriptions,worker}/coverage-summary.json`, `coverage-final.json`, `lcov.info`, `coverage-risk.json` и итоговый `summary.json`. Артефакты `.qa` не индексируются Git. Квитанции `report --run-id` заново сверяют сырые счётчики с текущими исходниками: подмена одного успешного exit code не может засчитать измерение. Любое отсутствие условий **не** повышает информационный профиль до релизного.

Изолированные wrapper-скрипты удаляют временные PG data dirs и останавливают принадлежащие им PostgreSQL процессы на успешном завершении и типовых ошибках. Профиль **не** заменяет миграционный gate: `prisma migrate deploy` на чистой PG15 по-прежнему блокируется `P3018/42P01` на `20241108120000_exam_result_trainer_review` (`ExamResult`). Для будущей приёмки нужны чистый checkout одного SHA, CI на GitHub, реальный provider sandbox и полноценные Worker/Redis recovery тесты.
