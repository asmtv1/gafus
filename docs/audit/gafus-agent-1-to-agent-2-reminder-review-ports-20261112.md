# Передача A1 → A2: AG1 Reminder Review — транзакционные порты

Дата: 12.11.2026, main, HEAD `0dcd18c13c8d`. Без merge, commit, push, deployment и включения review-маршрута.

## Результат

- Текущий сканер: **40 → 39 Core → server** в этой группе; в frozen ratchet 41: **2 resolved / 0 new**. Исторически 142 → 39, устранено 103.
- В Core `g1ReminderCreateIdempotency.review.ts` сохранены строгая валидация ключа, canonical fingerprint, cap-5, owner isolation, replay и отказ при неизвестной квитанции. БД и транзакционный клиент в Core больше не импортируются.
- `createReminderCreateReviewUseCase` инжектирует SQL-порты; `withAG1ReminderCreateTx` сохраняет owner-advisory-lock и одну транзакцию для reminder+receipt. Серверная композиция находится в `apps/api/src/modules/reminders/composition/create-receipt-review.ts`.
- Review Hono lookup по-прежнему немонтированный. AG4 review и его миграции/гейты не изменены.

## Контрольные суммы и исходники

Состояние `до` — реальный незакоммиченный рабочий каталог перед данной пачкой, **не Git HEAD**. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/reminder-review-port-prechange`. Полные SHA-256 находятся в JSON-манифесте рядом с отчётом.

| Статус | Путь | До SHA-256 | После SHA-256 | Изменение |
|---|---|---|---|---|
| M | `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.ts` | `566ec6b46ef5` | `073fff926ff6` | Core policy factory accepts six explicit persistence ports; no server imports |
| M | `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.test.ts` | `91a757c1f050` | `f175ddfef016` | Original transactional SQL mock connected via use-case factory |
| A | `apps/api/src/modules/reminders/composition/create-receipt-review.ts` | `—` | `94da00991d2c` | Review-only API composition binds original owner-locked server transaction |
| M | `apps/api/src/routes/v1/g1-reminder-create-lookup.review.ts` | `21a1885ec2c8` | `55b197d4d3a7` | Review Hono owner receipt lookup uses API composition |
| M | `apps/api/src/routes/v1/g1-reminder-create-lookup.review.test.ts` | `70ecd853fb5f` | `4dc6b659b3cd` | Owner, Origin, privacy and error mocks target composition |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `1787fcd40e50` | `db3557d6d795` | Central inventory: 39 remaining / 103 historically retired, AG1 edge retired |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `d6832baf16a2` | `899de9459a8d` | Append AG1 review transfer and open acceptance gates |

## Проверки

| Проверка | Итог | Журнал |
|---|---|---|
| core types | PASS | `/tmp/a1-reminder-review-core-ts.log` |
| core build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reminder-review-core-build.log` |
| api types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reminder-review-api-typecheck.log` |
| core tests 11 | PASS | `/tmp/a1-reminder-review-core-test.log` |
| api and architecture tests 91 | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reminder-review-api-tests.log` |
| architecture boundaries | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reminder-review-boundaries.log` |
| core-server facade AST inventory | 39 remaining, 2 resolved, 0 new | `node scripts/check-core-server-facades.mjs` |

Полный regression, chaos и изолированный PG в данной пачке **не проводились**. Pass адресных mocks/HTTP не подтверждает работу незавершённой AG4 миграции.

## Открытые гейты и нужные доступы

- **AG1_SCHEMA_PG** — Explicit disposable PostgreSQL, original AG1 receipt schema migration/unique owner-key DDL and AG4 approval; replay under concurrent processes, rollback and lost ACK not yet verified on real PG.
- **AG4_REVIEW** — AG4 source review has its own separate ReminderMutationReceipt contract and package-build gates; do not silently combine or mount AG1 into live reminder routes.
- **ACTIVATION** — Permission to enable only on isolated API with authenticated owner, CSRF/Origin and rate-limit verification; current candidate is not mounted.
- **FULL_CANDIDATE** — Joint A1/A2/A3 finalized worktree plus full 33-stage architecture and 5-stage chaos, Worker/Web/Mobile/panels, before changing baseline or deployment.

## Интеграция A2

Проверить все `sha256_after` из JSON. При расхождении с новыми изменениями A2/A3 не перезаписывать файлы. Переносить Core factory, API composition, review-route, соответствующие tests и central inventory как **одну группу**. Frozen `core-server-facade-baseline.json` не изменять до общей зелёной регрессии. Live route не активировать без AG4.
