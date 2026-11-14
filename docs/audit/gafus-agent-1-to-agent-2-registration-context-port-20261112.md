# Агент 1 → агент 2: Registration Context Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

**Результат:** Core → server **35 → 34**, frozen ratchet 41: **7 resolved / 0 new**, historical 142: **108 retired**. Frozen baseline JSON не менялся.

## Контракт и инварианты

- В Core `registrationUseCases.ts` шесть серверных операций заменены типизированным `RegistrationContextPorts`; API регистрирует прежний `identity-write-server/registration-context-reads` до загрузки Hono routes.
- Сохранён **один** DB transaction callback для promo validation и VK context create/claim. Core сохраняет `REGISTER` purpose, хеширование opaque context/state и публичные результаты/ошибки.
- `isRegistrationCompleted` и owner/VK-context read всегда делегируются серверному SQL-адаптеру; без binding возникает `REGISTRATION_CONTEXT_PORT_UNBOUND`, а не разрешение доступа. Rebind даёт `REGISTRATION_CONTEXT_PORT_ALREADY_BOUND`.
- VK OAuth, SQL-предикаты и реальные DB-таблицы не изменялись; публичные HTTP/куки/VK contracts не переписывались.

## Точные файлы и SHA-256 (полные в JSON)

База `до` — реальные байты уже незакоммиченного дерева перед группой, не Git HEAD. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/registration-context-port-prechange`.

| Статус | Путь | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `bd13670c457e` | `fe269bbd5da0` |
| A | `apps/api/src/modules/auth/composition/install-registration-context.contract.test.ts` | `—` | `216e6386c651` |
| A | `apps/api/src/modules/auth/composition/install-registration-context.ts` | `—` | `009fa3b34a17` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `937e7d0cdbaa` | `4f80858c0d02` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `309d95bfdbc9` | `4ac505d3841d` |
| A | `packages/core/src/services/auth/registrationContextPort.test.ts` | `—` | `27a1c37d0f92` |
| M | `packages/core/src/services/auth/registrationUseCases.ts` | `17d1c3017373` | `201538f8ee6a` |
| M | `scripts/check-core-server-boundary.mjs` | `2152ba3fd961` | `e6d5263108e4` |

**Всего:** 8 файлов: 5 изменённых, 3 новых.

## Подтверждённые проверки

| Этап | Результат | Квитанция |
|---|---|---|
| Core registration policy/transaction/nonce contract | PASS, 4 tests | `/tmp/a1-registration-port-core-tests-v3.log` |
| API owner-status/nonce composition | PASS, 1 tests | `/tmp/a1-registration-port-api-test-v2.log` |
| Core full suite | PASS, 2070 tests, 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-core-full.log` |
| API full suite | PASS, 2744 tests, 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-registration-context-core-ts.log` |
| API typecheck | PASS | `/tmp/a1-registration-api-types-v2.log` |
| Core build | PASS | `/tmp/a1-registration-core-build.log` |
| Identity-write-server typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-persistence-types.log` |
| Worker typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-worker-types.log` |
| Workspace DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-workspace-graph.log` |
| Architecture boundaries | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-boundaries.log` |
| Frozen Core→server scanner | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-ratchet.log` |

## Открытые external / интеграционные приёмки

- **VK_INTEGRATION** — Approved isolated VK ID OAuth staging credentials, PKCE callback with server cookie context, stored opaque state and consent persistence; no prod VK or GAFUS Main auth modifications.
- **PG_ATOMICITY** — Disposable loopback PostgreSQL with production-equivalent migrations; concurrent promo/registration claims, expired/used state, owner mismatch and failed callback rollback; test against real transaction and TTL. No production DB.
- **FULL_ARCHITECTURE** — Eliminate remaining 34 Core→server links and complete integrated A1/A2/A3 33-stage final regression, 5-stage chaos, Web/Mobile/Worker/panels, PG/Redis acceptance before ratchet update.

Агенту 2: сверять все SHA-256, связывать Core port/API installer/guard/tests атомарно, не перетирать работу A2/A3, полный baseline обновлять только после общего финального прогона. **Никакого merge/push со стороны A1.**
