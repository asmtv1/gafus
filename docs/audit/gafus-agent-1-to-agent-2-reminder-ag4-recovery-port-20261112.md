# A1 → A2: AG4 Existing Keyed Reminder Transaction SQL Port — Recovery

**12.11.2026 · main HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Итог

- Core→server **18 → 17**; frozen baseline 41: **24 resolved / 0 new**; исторически **125/142** устранено. Baseline JSON не тронут.
- `g1ReminderMutationReceiptAG4.review.ts` больше не импортирует SQL: owner lock, receipt, cap=5, reminder create и commit сохраняются в одном PostgreSQL Tx через `ReminderAG4ReviewRowsPort`.
- Существующий keyed `POST /api/v1/reminders` уже использовал AG4; его `reminders.ts` регистрирует порт через опубликованный `@gafus/core/services/reminders`. Ранее был 500 из-за несовпадения source Core / dist Core; исправлено без изменения бизнес-логики.
- Новый кандидат `g1-reminders-v2-unmounted.review.ts` остаётся немонтированным, новые маршруты и миграции отсутствуют.
- Три устаревших исходных asserts обновлены с прямого Core→server импорта на проверку порта и SQL composition; три runtime failures исправлены настоящим подключением compiled Core.
- Незарегистрированный порт отказывает `REMINDER_AG4_REVIEW_PORT_UNBOUND`, горячая подмена запрещена; PII не попадает в неожиданные 500.

## Файлы и SHA-256

До — байты общего *незакоммиченного* дерева непосредственно перед этим кластером; после — текущие байты. Полные контрольные суммы в JSON.

| Тип | Файл | До SHA256 | После SHA256 |
|---|---|---|---|
| A | `apps/api/src/modules/reminders/composition/install-ag4-review-rows.review.contract.test.ts` | `—` | `96b8705fc2d9` |
| A | `apps/api/src/modules/reminders/composition/install-ag4-review-rows.review.ts` | `—` | `4c5485e52884` |
| M | `apps/api/src/routes/v1/g1-reminder-mixed-core-source-boundary.contract.test.ts` | `d400f5e3e8b1` | `47112812bb62` |
| M | `apps/api/src/routes/v1/g1-reminder-packaged-core-review-gate.contract.test.ts` | `574e94869f05` | `b39f12f68f5a` |
| M | `apps/api/src/routes/v1/g1-reminder-receipt-migration-history.review.test.ts` | `a3a194aa15b1` | `336dc35d179f` |
| M | `apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts` | `9ae2f4ab5eaf` | `af6cbb08b310` |
| M | `apps/api/src/routes/v1/reminders.ts` | `14df238ff93e` | `02d7e8d4fea2` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `f2ecdfdb968d` | `e8d7d4fdc797` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `982e591d7489` | `313bf69627a4` |
| M | `packages/core/src/services/reminders/g1ReminderExpiryPIIRedaction.review.test.ts` | `fa0a16fc41db` | `3471bd30246d` |
| M | `packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.test.ts` | `893b79a55a81` | `fe2150353f3e` |
| M | `packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts` | `5e7146e2d9da` | `afcb063c06a0` |
| M | `packages/core/src/services/reminders/index.ts` | `6a4690f159bb` | `73444884e719` |
| A | `packages/core/src/services/reminders/reminderAG4ReviewPort.test.ts` | `—` | `eeb8b63a5ee8` |
| A | `packages/core/src/services/reminders/reminderAG4ReviewPort.ts` | `—` | `28d0b5b64c66` |
| M | `scripts/check-core-server-boundary.mjs` | `a961a014a8af` | `38900d5710ff` |

**Всего 16 файлов:** 12 M, 4 A.

## Подтверждённые проверки

| Проверка | Результат | Журнал |
|---|---|---|
| AG4 37 preexisting Core review and expiry/PII | PASS 37 passed | `/tmp/a1-ag4-existing-target.log` |
| AG4 3 new Core receipt transaction port tests | PASS 3 passed | `/tmp/a1-ag4-new-core-tests.log` |
| AG4 18 targeted API source/compiled route and SQL composer tests | PASS 18 passed | `/tmp/a1-ag4-recovered-api-target.log` |
| Full Core after recovery | PASS 2133 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-core-full.log` |
| Full API after recovery | PASS 2761 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-api-full.log` |
| Core TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-core-types.log` |
| Core rebuilt package | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-core-build.log` |
| API TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-api-types.log` |
| Identity-write adapter TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ag4-recovered-identity-types.log` |
| Architecture boundaries and no route activation | PASS | `/tmp/a1-ag4-recovered-boundaries.log` |

## Непройденные внешние acceptance-гейты

- Real disposable PostgreSQL: competing keyed/keyless owner reminder CREATE cap 5, rollback on insert failure, idempotency replay after expiry, receipt privacy & TTL. Mock-only checks do not prove this gate.
- Integration of existing reminder route API under the real QA auth/session; separate unmounted AG4 candidate must not be exposed before authorization.
- Remove 17 remaining Core→server dependencies, then run combined A1/A2/A3 33-stage architecture and 5-stage chaos, Worker/panels/Web/Mobile/PG/Redis acceptance before editing frozen baseline JSON.

A2: сверять текущие `sha256_after_current`, переносить Core-port + API-composition + тесты вместе; общие файлы объединять семантически. A1 не выполнял merge/push/deploy.
