# A1 → A2: Legacy Rewarded Credit Wallet — Advisory-Locked Transaction SQL Port

**12.11.2026 · main HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Итог

- Core→server **16 → 15**; frozen baseline 41: **26 resolved / 0 new**; исторически **127/142** устранено. Baseline JSON не тронут.
- Core rewardedCredits/walletService.ts no longer imports gafus-server/rewarded-wallet-rows. All seven SQL methods are behind RewardedWalletPort; Core receives a branded opaque transaction token, not a Prisma API.
- Same server PostgreSQL advisory transaction lock `rewarded:${userId}` gates EARN, SPEND and REFUND; original UNIQUE idempotencyKey and wallet row updates remain in server, no nested transaction.
- Core preserves Moscow daily reset, wallet cap, pendingRefundCredits reconciliation, Premium bypass, reward provider/session ownership and original RewardedBalanceFullError/RewardedCreditsRequiredError contracts.
- Unavailable SQL binding fails closed REWARDED_WALLET_PORT_UNBOUND and hot rebind is rejected REWARDED_WALLET_PORT_ALREADY_BOUND; API composer installed before routes.

## Файлы и SHA-256

До — байты общего *незакоммиченного* дерева непосредственно перед этим кластером; после — текущие байты. Полные контрольные суммы в JSON.

| Тип | Файл | До SHA256 | После SHA256 |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `906430c29923` | `abd3f91b7bd2` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-wallet-rows.contract.test.ts` | `—` | `cfc66e5cd32f` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-wallet-rows.ts` | `—` | `aea1387446be` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `048505b33e4e` | `584ee7ac7154` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `29c01ce931b7` | `673c7e40f76e` |
| M | `packages/core/src/services/rewardedCredits/index.ts` | `cbe0aa6ed529` | `2906689565a2` |
| A | `packages/core/src/services/rewardedCredits/rewardedWalletPort.test.ts` | `—` | `3d8f6b5fdf61` |
| A | `packages/core/src/services/rewardedCredits/rewardedWalletPort.ts` | `—` | `e9cd63c34a80` |
| M | `packages/core/src/services/rewardedCredits/walletService.test.ts` | `d092ca12b284` | `6f971ac78825` |
| M | `packages/core/src/services/rewardedCredits/walletService.ts` | `8cd3e9515d50` | `c72b792d4aed` |
| M | `scripts/check-core-server-boundary.mjs` | `60692f051477` | `d75c23378953` |

**Всего 11 файлов:** 7 M, 4 A.

## Подтверждённые проверки

| Проверка | Результат | Журнал |
|---|---|---|
| Core nine existing and four new wallet/lock/replay tests | PASS 13 passed | `/tmp/a1-rewarded-wallet-core-target.log` |
| API owner advisory SQL composition | PASS 1 passed | `/tmp/a1-rewarded-wallet-api-contract-v2.log` |
| Full Core | PASS 2143 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-core-full.log` |
| Full API | PASS 2764 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-api-full.log` |
| Core TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-core-types-final.log` |
| Core build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-core-build-final.log` |
| API TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-api-types-final.log` |
| Gafus server SQL TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-wallet-server-types-final.log` |
| Architecture guard and no new Prisma reachability | PASS | `/tmp/a1-rewarded-wallet-boundaries.log` |

## Непройденные внешние acceptance-гейты

- Disposable real PostgreSQL concurrency: same-owner EARN and SPEND race, double idempotency key, immediate balance cap/negative spend, deferred refund overflow and release lock validation.
- Staging real subscription Premium switch during ad completion and receipt/replay; verify no double grant or debit, no production provider calls.
- Eliminate 15 remaining Core→server dependencies; then combined A1/A2/A3 33-stage architecture full regression and five-stage chaos plus Worker/panels/Web/Mobile/PG/Redis acceptance before baseline update.

A2: сверять текущие `sha256_after_current`, переносить Core-port + API-composition + тесты вместе; общие файлы объединять семантически. A1 не выполнял merge/push/deploy.
