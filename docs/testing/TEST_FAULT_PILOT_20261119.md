# GAFUS — локальные изолированные fault-пилоты: платежи и Worker (19.11.2026)

**Статус: `PASS` только для двух информационных SQL fault-пилотов, не release-ready.** Команда `pnpm test:faults` зарегистрирована в `plan/run/report` отдельным профилем `faults`. Пилоты **не входят** в `ci`, `integration`, `full` и release gates; ни один GitHub workflow не был активирован или изменён этим этапом.

## Выполнение и воспроизведение

```bash
pnpm test:faults
pnpm test:faults --scenario payment.failures
pnpm test:faults --scenario worker.failures
node scripts/qa/test-system.mjs report --run-id qa-02a144de-ad44-41e9-91d2-a8c9bc5b52c0
```

Полный локальный запуск: `.qa/testing/qa-02a144de-ad44-41e9-91d2-a8c9bc5b52c0/summary.md` и `summary.json`, **REPORT 0**. План фиксирует `2` проверки, `5` обязательных именованных кейсов; JSON проверен повторно валидатором `tests/support/fault-report.mjs`: **2/2 checks, 5/5 named cases, 23 passed assertions (включая 18 существующих), 0 failed, 0 skipped, 4 валидных test source files**. Каждый исход связан с точным именем реального Vitest assertion. Отдельный smoke до подключения в `plan/run/report` также прошёл для каждого скрипта.

| Каталог / реализация | Новые проверенные случаи |
| --- | --- |
| `payment.failures.pg`, `packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts` | `provider timeout before first entitlement is retried without duplicate grant or receipt`: при отказе чтения состояния YooKassa нет grant, payment остаётся PENDING; повтор и конкурирующий webhook создают один ACTIVE subscription и один event |
| `payment.failures.pg` | `refund verification outage preserves access until one verified refund is committed`: при недоступной верификации возврата не происходит ложного отзыва доступа; после подтверждения и повтора появляется один finance refund и один event, подписка CANCELED |
| `worker.failures.pg`, `packages/worker/src/media-cdn-purge-worker.real-pg.test.ts` | `worker provider failure keeps durable job pending without acknowledgement or leaking details`: после сбоя локальной Beget-заглушки не происходит ACK, raw provider error не попадает в SQL; повтор восстанавливает один завершённый job |
| `worker.failures.pg` | `worker crash after SQL checkpoint reclaims lease without submitting a duplicate provider operation`: после записи operation ID в PostgreSQL **симулирован** обрыв до ACK и истечение lease, новый claim использует тот же checkpoint и не повторяет отправку; устаревший токен не может подтвердить job |
| `worker.failures.pg` | `two concurrent worker passes have one SQL lease and one irreversible provider submission`: два параллельных прохода одного реального SQL outbox выполняют один begin и один ACK; дополнительный проход не создаёт побочный эффект |

**Границы:** обе проверки работают на свежих **локальных PostgreSQL 18**, поднятых через `initdb`/`pg_ctl` на случайном loopback-порту, с отдельным случайным именем БД и состоянием только в `/tmp/gafus-payment-archqa-pg.*` или `/tmp/gafus-media-purge-pg.*`; используется **`prisma db push`**, а не проверка миграций. Provider HTTP и Beget операции строго синтетические/мокированные; настоящие YooKassa, Beget CDN, Redis queue, отдельный Worker-процесс с `SIGKILL`, реальные внешние транзакции и полный end-to-end не испытывались. Название «worker crash» означает модель потери процесса **между сохранённым SQL checkpoint и ACK**, без реального убийства процесса. Ограничения не должны скрываться за `REPORT 0`.

Запускающие shell-скрипты удаляют собственные PID/каталоги через `pg_ctl stop` и `trap` с удалением точного пути. После успешного `pnpm test:faults`: **0** подходящих PG18 процессов и **0** временных директорий. Дополнительно проверен **fail-closed** режим с запрещённым `GAFUS_TEST_REPORT_PATH=/tmp/qa-unsafe-result-should-not-exist.json`: оба скрипта завершились кодом `2`, не создали файл, очистили свои БД. Из окружения скриптов очищаются переменные YooKassa/Apple/AWS/S3/Cloud.ru/Redis/PG credentials, реальные учётные записи не использовались. Незнакомые процессы/пользовательские БД не останавливались.

## Что остаётся для полного fault-coverage / релиза

- Настоящий restart/`SIGKILL` Worker-процесса при зависании, восстановление Redis/BullMQ и подтверждение отсутствия дубликатов **провайдерских** действий между процессами и после сетевого timeout; тестовый Beget канал вместо mock. Реальный POST к платежному тестовому провайдеру, sandbox возвраты/отмена, поздние provider webhooks и replay с проверкой сетевого ACK.
- Строгая миграционная цепочка на чистой БД всё ещё **BLOCKED**: `P3018 / 42P01`, `20241108120000_exam_result_trainer_review`, `ExamResult` отсутствует. Functional `db push` не заменяет миграционный baseline.
- Эти проверки **не включать в release gate**, пока не получены повторный чистый checkout/commit, GitHub Actions execution, согласованная fault-матрица и реальные provider/Worker restart receipts. Другие незакоммиченные изменения в рабочем дереве не включать в будущий test-only commit без отдельного ревью.
