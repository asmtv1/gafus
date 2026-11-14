# A1 → A2: Gafus Wallet Advisory Lock Port

**12.11.2026, main, HEAD `0dcd18c13c8d`, никаких commit/merge/push/deploy.**

## Результат

- **27 → 26** Core→server; frozen baseline 41: **15 resolved / 0 new**, historical 142: **116 retired**.
- Core `gafus/locking.ts` больше не реэкспортирует server wallet-lock; `GafusLockPort` инжектируется API до routes из неизменённого серверного адаптера `gafus-wallet:<userId>` advisory lock в одной транзакции.
- Публичная `GAFUS_WALLET_OWNER_REQUIRED` и **асинхронное** Promise rejection сохранены. Fail-closed при отсутствии порта; замена adapter запрещена.
- В первом полном Core прогоне тестовый OFF021 memory Tx не имел порта, 4 ошибки. Реальный серверный lock был инжектирован в его фикстуру; после исправления **8/8** OFF021 и полный Core **2103/2103**, API **2752/2752** прошли. Исходный провал не засчитан как PASS.

## Файлы и SHA-256

«До» — байты рабочего дерева перед группой (не HEAD), backup `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/gafus-wallet-lock-port-prechange`. Полные SHA-256 в JSON.

| Тип | Файл | До | После |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `a1d4f8f349b6` | `77ddad6519c0` |
| A | `apps/api/src/modules/gafus/composition/install-wallet-lock.contract.test.ts` | `—` | `3390754179c2` |
| A | `apps/api/src/modules/gafus/composition/install-wallet-lock.ts` | `—` | `45775b452f85` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `9a55bc59e0c9` | `edd2eae00d12` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `785561bc3ffe` | `dce082ee123f` |
| M | `packages/core/src/services/gafus/admin2GafusConcurrency.postgres.test.ts` | `e4259b55f164` | `93a8c5ecf553` |
| M | `packages/core/src/services/gafus/g1-offline-training-reward-boundary.test.ts` | `e387c345bb35` | `ce089a407098` |
| M | `packages/core/src/services/gafus/gafus-content-parity.isolatedpg.test.ts` | `ad7bc7beb707` | `ab291c4f2557` |
| M | `packages/core/src/services/gafus/gafus.postgres.test.ts` | `5d2ae22eb514` | `7b9dc2087c35` |
| A | `packages/core/src/services/gafus/gafusLockPort.test.ts` | `—` | `eea0f2ceb7b5` |
| M | `packages/core/src/services/gafus/locking.ts` | `01e0e6f4e806` | `6506694bd40c` |
| M | `packages/core/src/services/gafus/rewardService.test.ts` | `0bec2f9cbe94` | `b925340bcc8e` |
| M | `scripts/check-core-server-boundary.mjs` | `a75473d081e5` | `9b92737c06b1` |

**Всего 13 файлов**, 10 изменено, 3 добавлено.

## Проверки

| Название | Результат | Лог |
|---|---|---|
| Core port, Promise owner error, 2 reward scenarios | PASS, 6 tests | `/tmp/a1-gafus-lock-port-core-tests-v2.log` |
| Core training/reward replay boundary, fixed test injection | PASS, 8 tests | `/tmp/a1-gafus-wallet-lock-offline-target.log` |
| API lock SQL composition | PASS, 1 tests | `/tmp/a1-gafus-lock-api-contract.log` |
| Final full Core | PASS, 2103 tests, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-lock-core-full-v2.log` |
| Final full API | PASS, 2752 tests, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-lock-api-full-v2.log` |
| Core types | PASS | `/tmp/a1-wallet-lock-core-ts.log` |
| Core build | PASS | `/tmp/a1-gafus-lock-core-build.log` |
| API types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-lock-api-types.log` |
| Gafus server types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-lock-server-types.log` |
| Architecture boundary | PASS | `/tmp/a1-gafus-wallet-lock-boundaries.log` |

## Внешние гейты

- **WALLET_REAL_PG_RACE** — Dedicated disposable localhost PostgreSQL with current schema, owner A/B, concurrent grants/spends, account deletion race, advisory lock same Pg connection; specific test URLs must satisfy hard-gated checks; no production DB.
- **GAFUS_EXTERNAL_BOOT** — Approved integrated API/Worker staging startup that binds the lock before reward writes; Worker currently shows no direct Gafus economy port reads, recheck after shared integration.
- **FINAL_ARCH** — Remove remaining 26 Core→server links, then A1/A2/A3 33-stage regression, 5-stage chaos and all Web/Mobile/Worker/panels/PG/Redis gates; frozen baseline 41 until full pass.

A2: сравнить каждый `sha256_after` с общим деревом; объединять семантически shared `app.ts`, guard и тесты Gafus. Сохранять transactional advisory lock, не подменять JS-мьютексом. Frozen baseline обновлять только после финальной интеграции.
