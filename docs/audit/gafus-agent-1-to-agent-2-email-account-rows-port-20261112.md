# Агент 1 → агент 2: Email Account SQL + Delivery Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без commit/merge/push/deploy.**

## Результат

- Core→server **33 → 32**; frozen 41: **9 resolved / 0 new**, historical 142: **110 removed**.
- Core `emailAccountFlows.ts`: 10 SQL-методов заменены на `EmailAccountRowsPort`, а API подключает `@gafus/identity-write-server/email-account-rows` до маршрутов.
- Сохранены антиэнумерация неизвестного email, SHA-256 reset token, 2-минутный throttle, неизменные сроки ссылок и публичные тексты ошибок.
- Сохранены atomically claimed throttle, owner row-lock, compare-and-set rollback и принцип **не инвалидировать старую ссылку до provider ACK новой**. На ошибке provider откатывается только свой токен, а не запрос другого клиента.
- `EMAIL_ACCOUNT_ROWS_PORT_UNBOUND` вызывает отказ до SQL/mail; заменять установленный adapter на другой нельзя. Persistence SQL исходник не менялся.

## Файлы и точные SHA-256

До = реальные байты незакоммиченного дерева перед этой группой, не Git HEAD. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/email-account-rows-port-prechange`. Полные хеши каждого файла в JSON-манифесте.

| Статус | Путь | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `4a3ec033beea` | `8406323dd59f` |
| A | `apps/api/src/modules/auth/composition/install-email-account-rows.contract.test.ts` | `—` | `588535f09d88` |
| A | `apps/api/src/modules/auth/composition/install-email-account-rows.ts` | `—` | `4538a063a22f` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `4a0175b992e5` | `e9be94d7ba9e` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `f8e9fd0dbe30` | `bb0ad0265096` |
| M | `packages/core/src/services/auth/emailAccountFlows.test.ts` | `0f2e124d863b` | `db70ab820d2e` |
| M | `packages/core/src/services/auth/emailAccountFlows.ts` | `e20348f7dda3` | `1ae9cf8beaf5` |
| A | `packages/core/src/services/auth/emailAccountRowsPort.test.ts` | `—` | `ee69b15e5abb` |
| M | `packages/core/src/services/auth/g1-w1-email-change.core.scoped.test.ts` | `48b35602423d` | `a3318940c337` |
| M | `packages/core/src/services/auth/g1-w1-email-change.realdb.test.ts` | `7dd840b64977` | `c68ef455ba8e` |
| M | `scripts/check-core-server-boundary.mjs` | `234ad9fea807` | `07cc7166c4f5` |

**Всего:** 11 файлов: 8 обновлено, 3 добавлено.

## Завершённые проверки

| Проверка | Статус | Журнал |
|---|---|---|
| Core email source + port | PASS, 21 tests | `/tmp/a1-email-rows-port-target-tests.log` |
| API email SQL composition | PASS, 1 tests | `/tmp/a1-email-rows-api-port-test.log` |
| Core + isolated W1 PG opt-in source | PASS, 17 tests, 7 skipped | `/tmp/a1-email-rows-core-regressions.log` |
| Full Core | PASS, 2078 tests, 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-core-full.log` |
| Full API | PASS, 2746 tests, 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-api-full.log` |
| Core TypeScript | PASS | `/tmp/a1-email-rows-core-types.log` |
| Core production build | PASS | `/tmp/a1-email-rows-core-build.log` |
| API TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-api-types.log` |
| Identity SQL adapter TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-persistence-types.log` |
| Worker TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-worker-types.log` |
| Workspace dependency DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-graph.log` |
| Architecture guard | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-boundaries.log` |
| Core→server ratchet | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-email-rows-ratchet.log` |

## Отдельные непроведённые приёмки

- **W1_EMAIL_REAL_PG** — Guarded disposable local PostgreSQL, exact nonproduction W1 URL/role/DB and approved fixture users; run W1 gated 7 tests including owner-lock, concurrent token delivery and rollback. Do not point to production.
- **MAIL_DELIVERY_SANDBOX** — Approved mail sandbox account with deterministic provider ACK/failure/lost-ACK, avoid external recipient delivery; test 120-second throttle, 24-hour email-change links and 1-hour password reset links.
- **FINAL_INTEGRATION** — Eliminate 32 remaining backwards edges, run integrated A1/A2/A3 33-stage regression and 5-stage chaos and every mobile/web/panel/worker PG/Redis contract before frozen baseline moves.

Агенту 2: сверять SHA-256 после по всем путям, совместить Core policy, API installer, guard и тесты единой пачкой, не перетирать параллельные изменения A2/A3. Frozen ratchet не обновлять до всех интеграционных проверок. **Merge/commit/push A1 не выполнял.**
