# A1 → A2: VK Completion Context-Locked Port

12.11.2026 · main · HEAD `0dcd18c13c8d` · никаких merge/commit/push/deploy.

## Завершённая группа

- **32 → 31** Core → server; baseline 41: **10 resolved / 0 new**, historical 142: **111 retired**. Baseline JSON заморожен.
- Core `vkRegistrationCompletion.ts` больше не импортирует серверные rows, но сохраняет назначение REGISTER, проверку срока жизни и fingerprint, WEB-only LOGIN grant и публичные ошибки.
- API composition содержит исходный `identity-write-server/vk-completion-rows` port; внутри контекстной advisory lock той же транзакции сохраняются consent COMPLETED, реферальная атрибуция, registrationPending CAS, completedAt marker, revoke/reissue LOGIN grant. Ни OAuth, ни новые транзакции не добавлялись.
- Без binding ошибка `VK_COMPLETION_PORT_UNBOUND`; hot rebind запрещён. Контрактные тесты подтверждают отсутствие DB-вызова при невалидном consent/transport и отказ от контекста другого владельца.

## Файлы и SHA-256

Основа «до» — байты рабочего дерева непосредственно перед группой, не Git HEAD. Backups: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/vk-completion-port-prechange`; полные хеши в JSON.

| Тип | Путь | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `8406323dd59f` | `320a085004a4` |
| A | `apps/api/src/modules/auth/composition/install-vk-completion.contract.test.ts` | `—` | `f7c224f6cf89` |
| A | `apps/api/src/modules/auth/composition/install-vk-completion.ts` | `—` | `341230b51bb6` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `e9be94d7ba9e` | `1d41c4a6224d` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `bb0ad0265096` | `4e1bbe8579c9` |
| A | `packages/core/src/services/auth/vkCompletionPort.test.ts` | `—` | `20a7d9ceb1e7` |
| M | `packages/core/src/services/auth/vkRegistrationCompletion.test.ts` | `3cd4efe9574e` | `6f9cb8d84614` |
| M | `packages/core/src/services/auth/vkRegistrationCompletion.ts` | `984f05bf38c1` | `876d8619ed7b` |
| M | `scripts/check-core-server-boundary.mjs` | `07cc7166c4f5` | `ecbd7ab2cbc5` |

Всего **9 файлов**: 6 M и 3 A.

## Проверки

| Проверка | Итог | Лог |
|---|---|---|
| Core policy, replay and fail-closed port | PASS (6 passed) | `/tmp/a1-vk-completion-core-ports-tests.log` |
| API VK context-locked composition | PASS (1 passed) | `/tmp/a1-vk-completion-api-contract.log` |
| Full Core | PASS (2082 passed, 136 skip) | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-core-full.log` |
| Full API | PASS (2747 passed, 266 skip) | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-api-full.log` |
| Core types | PASS | `/tmp/a1-vk-completion-core-types.log` |
| Core build | PASS | `/tmp/a1-vk-completion-core-build.log` |
| API types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-api-types.log` |
| Persistence types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-persistence-types.log` |
| Worker types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-worker-types.log` |
| Workspace graph | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-graph.log` |
| Boundaries | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-boundaries.log` |
| Frozen AST ratchet | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-vk-completion-ratchet.log` |

## Отдельно не выполненные внешние acceptance-гейты

- **VK_REAL_PG_CONCURRENCY** — Disposable current-schema PostgreSQL and exact test owner/foreign/pending context; prove advisory lock and one transaction for consent/referral/CAS/login grant under racing requests and lost response. No production DB.
- **VK_ID_SANDBOX** — Approved isolated VK OAuth PKCE test client and nonproduction callback; check WEB/MOBILE replay and expiring login grant; no bearer token leaks.
- **FINAL_ARCHITECTURE** — Remove remaining 31 Core→server, then run integrated A1/A2/A3 33-stage regression, 5-stage chaos, Web/Mobile/Worker/panels/PG/Redis gates. Baseline remains frozen at 41 until verified.

Агенту 2: проверять все после-хеши, не перетирать параллельные изменения A2/A3, сохранять Core error contracts и невключённые маршруты. Frozen baseline не менять до общего 33+5-stage acceptance; **A1 не делал merge/push**.
