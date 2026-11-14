# A1 → A2: Gafus Wallet Ledger SQL Port

**12.11.2026, main HEAD `0dcd18c13c8d`, без merge/commit/push/deploy.**

## Подтверждённый итог

- **22 → 21** Core→server, frozen 41 **20 resolved / 0 new**, исторически 142 **121 retired**. Frozen baseline JSON не изменён.
- `GafusLedgerRowsPort` даёт 6 типизированных методов ledger/wallet. Prisma SQL остаётся в `gafus-server/wallet-records`; Core хранит атомарную бизнес-логику signed delta, credit cap, idempotency, недостатка средств; подключение — API startup до Hono routes.
- Списания выполняются в прежней транзакции с advisory lock; SQL проверяет достаточность баланса в `updateMany` и удерживает уникальный idempotency key. Результаты owner-scoped истории и публичные ошибки сохраняются.
- Отсутствующий порт отказывает `GAFUS_LEDGER_PORT_UNBOUND`, hot-swap запрещён. Тесты используют реальные SQL функции на контролируемом моковом Prisma Tx.

## Файлы

Все `sha256_before` получены из снимка **непосредственно перед этой группой**, а `sha256_after_current` пересчитаны сейчас, не из прежних shared снимков A2. Полные хеши и пути backup — JSON.

| Тип | Путь | До SHA256 | После SHA256 |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `c05e895faae2` | `77731cac58ed` |
| A | `apps/api/src/modules/gafus/composition/install-ledger-rows.contract.test.ts` | `—` | `0db471e83f7b` |
| A | `apps/api/src/modules/gafus/composition/install-ledger-rows.ts` | `—` | `2ce02780b6b7` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `6c94d8f3e49b` | `4ba238eaa552` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `14a8f4431d4b` | `ba6b07c36fd8` |
| M | `packages/core/src/services/gafus/admin2GafusConcurrency.postgres.test.ts` | `93a8c5ecf553` | `72aee7eb673d` |
| M | `packages/core/src/services/gafus/g1-offline-training-reward-boundary.test.ts` | `ce089a407098` | `6003c962bbbc` |
| M | `packages/core/src/services/gafus/g1-wallet-readonly-status-history.audit.test.ts` | `eead5c6d518b` | `87bc3a58580d` |
| M | `packages/core/src/services/gafus/gafus-content-parity.isolatedpg.test.ts` | `ab291c4f2557` | `e013a2c28e74` |
| M | `packages/core/src/services/gafus/gafus.postgres.test.ts` | `7b9dc2087c35` | `9888bbd6d199` |
| A | `packages/core/src/services/gafus/gafusLedgerPort.test.ts` | `—` | `39252a2392ff` |
| A | `packages/core/src/services/gafus/gafusLedgerPort.ts` | `—` | `a4b2ec914d1f` |
| M | `packages/core/src/services/gafus/index.ts` | `2c46363cc451` | `bd3f1375bab0` |
| M | `packages/core/src/services/gafus/rewardService.test.ts` | `b925340bcc8e` | `409f95b9be48` |
| M | `packages/core/src/services/gafus/walletService.test.ts` | `d21bf6ac5cec` | `d11f7caeab20` |
| M | `packages/core/src/services/gafus/walletService.ts` | `531d4303af98` | `ce73dc3dc8aa` |
| M | `scripts/check-core-server-boundary.mjs` | `8dd475ca00cb` | `e6958593913e` |

**Всего 17 файлов:** 13 M, 4 A.

## Подтверждённые проверки

| Этап | Результат | Лог |
|---|---|---|
| Core existing wallet/reward/status+history | PASS 20 passed | `/tmp/a1-gafus-ledger-core-target.log` |
| Core new ledger port invariants | PASS 3 passed | `/tmp/a1-gafus-ledger-new-core-tests.log` |
| API owner-scoped wallet SQL composition | PASS 1 passed | `/tmp/a1-gafus-ledger-api-contract.log` |
| Full Core | PASS 2121 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-ledger-core-full.log` |
| Full API | PASS 2757 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-ledger-api-full.log` |
| Core TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-ledger-core-types-final.log` |
| Core build | PASS | `/tmp/a1-gafus-ledger-core-build.log` |
| API TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-ledger-api-types-final.log` |
| Gafus server TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-ledger-server-types.log` |
| Architecture boundary | PASS | `/tmp/a1-gafus-ledger-boundaries.log` |

## Внешние гейты

- **WALLET_LEDGER_REAL_PG** — Disposable full-schema local PostgreSQL, concurrent independent transactions for same user grant/spend, advisory lock receipt and balance>=debit CAS, replay of idempotency key with same and changed amount, rollback on insert failure. No production DB.
- **HISTORY_OWNER_STAGING** — Staging API with authenticated owner A/B, history pagination and cursor/expires, ensure no cross-owner userId rows or additional fields on public 9-field JSON.
- **FINAL_ARCH** — 21 remaining Core→server edges, combined A1/A2/A3 33-stage architecture regression + 5-stage chaos + Web/Mobile/Worker/panels/PG/Redis integration before touching frozen baseline.

Агент 2: сверить все `sha256_after_current`, SQL port + API installer + Core/tests интегрировать атомарно; общие файлы `app.ts`, архитектурный guard, аудит — только семантический merge. A1 не выполнял merge/push.
