# A1 → A2: Owner-scoped Paid/Video Rewarded Access SQL Reads

**12.11.2026 · main HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Итог

- Core→server **19 → 18**; frozen baseline 41: **23 resolved / 0 new**; исторически **124/142** устранено. Baseline JSON не тронут.
- Десять typed owner-scoped SQL SELECT перенесены из Core в `RewardedAccessReadPort` и API composition до Hono.
- Core сохраняет платные/приватные курсы, private assignment, точные day/step/URL occurrences, роль, подписку и Gafus-грант без global media обхода.
- Unbound port `REWARDED_ACCESS_READ_PORT_UNBOUND` отказывает, hot-swap `REWARDED_ACCESS_READ_PORT_ALREADY_BOUND` запрещён. Nullable notification URL соответствует реальному Prisma SELECT.

## Файлы и SHA-256

До — байты общего *незакоммиченного* дерева непосредственно перед этим кластером; после — текущие байты. Полные контрольные суммы в JSON.

| Тип | Файл | До SHA256 | После SHA256 |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `964aaa01f1a6` | `906430c29923` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-access-reads.contract.test.ts` | `—` | `891eaa76ac8b` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-access-reads.ts` | `—` | `9709ae3ec376` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `3b9497b5bd80` | `f2ecdfdb968d` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `6a6f02c29106` | `982e591d7489` |
| M | `packages/core/src/services/rewardedCredits/accessService.test.ts` | `12286b3af6b5` | `7a5349193777` |
| M | `packages/core/src/services/rewardedCredits/accessService.ts` | `14a16ba97252` | `16c51390b3ee` |
| M | `packages/core/src/services/rewardedCredits/index.ts` | `8e0680b5ce91` | `cbe0aa6ed529` |
| A | `packages/core/src/services/rewardedCredits/rewardedAccessReadPort.test.ts` | `—` | `3cd23e27acc4` |
| A | `packages/core/src/services/rewardedCredits/rewardedAccessReadPort.ts` | `—` | `38e13523ba3a` |
| M | `scripts/check-core-server-boundary.mjs` | `d1184ab171c9` | `a961a014a8af` |

**Всего 11 файлов:** 7 M, 4 A.

## Подтверждённые проверки

| Проверка | Результат | Журнал |
|---|---|---|
| Existing Core owner/paid/video policies | PASS 16 passed | `/tmp/a1-rewarded-access-existing-tests.log` |
| Core missing SQL port, target scope and rebind | PASS 3 passed | `/tmp/a1-rewarded-access-new-core-tests.log` |
| API owner SQL composition | PASS 1 passed | `/tmp/a1-rewarded-access-api-contract.log` |
| Full Core | PASS 2130 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-access-core-full.log` |
| Full API | PASS 2760 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-access-api-full.log` |
| Core typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-access-core-types.log` |
| Core build | PASS | `/tmp/a1-rewarded-access-core-build-v3.log` |
| API typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-access-api-types.log` |
| Entitlements adapter typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-access-server-types.log` |
| Architecture boundaries | PASS | `/tmp/a1-rewarded-access-boundaries.log` |

## Непройденные внешние acceptance-гейты

- Disposable PG with owner/outsider UserTraining, private CourseAccess revoked, paid video tied to two day occurrences, expired Gafus grant; prove no cross-owner access.
- Web/Mobile staging paid video and step notifications with real JWT, role and subscription; no production credentials.
- Remove 18 remaining reverse edges; combined A1/A2/A3 33-stage architecture final + 5-stage chaos, Worker/panels/PG/Redis client gates before frozen ratchet.

A2: сверять текущие `sha256_after_current`, переносить Core-port + API-composition + тесты вместе; общие файлы объединять семантически. A1 не выполнял merge/push/deploy.
