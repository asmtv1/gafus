# A1 → A2: Atomic Gafus Content Unlock Port

**12.11.2026, main HEAD `0dcd18c13c8d`, no merge/commit/push/deploy.**

## Результат

- **21 → 20** Core→server; frozen 41 **21 resolved / 0 new**, historical 142 **122 retired**. Frozen baseline не изменён.
- Core больше не импортирует server `unlock-records`. `GafusUnlockRowsPort` передаёт одну PG wallet advisory transaction, replay и atomic grant. API adapter установлен до Hono routes. Core по-прежнему проверяет exact occurrence, owner, idempotency, стоимость/eligibility, expiry.
- Original PostgreSQL timeout/maxWait/lock/key unchanged; fail closed when unbound. Отдельная реальная PostgreSQL конкурентная приёмка pending.

## Файлы и SHA256

Все `sha256_before` сняты непосредственно перед этой группой на актуальном дереве; `sha256_after_current` пересчитаны сейчас. Full hashes in JSON.

| Статус | Файл | SHA до | SHA после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `77731cac58ed` | `7f8108b385e1` |
| A | `apps/api/src/modules/gafus/composition/install-unlock-rows.contract.test.ts` | `—` | `593815c82450` |
| A | `apps/api/src/modules/gafus/composition/install-unlock-rows.ts` | `—` | `f6b99676835a` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `4ba238eaa552` | `e343be163499` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `ba6b07c36fd8` | `09fa7612a8e7` |
| M | `packages/core/src/services/gafus/accessGrantService.test.ts` | `5eb6d654f5d3` | `1f129a479702` |
| M | `packages/core/src/services/gafus/accessGrantService.ts` | `a2e6e3998416` | `6e294f0019c0` |
| M | `packages/core/src/services/gafus/gafus-content-parity.isolatedpg.test.ts` | `e013a2c28e74` | `388070f409ef` |
| A | `packages/core/src/services/gafus/gafusUnlockPort.test.ts` | `—` | `062b9705dba4` |
| A | `packages/core/src/services/gafus/gafusUnlockPort.ts` | `—` | `6bc6361f3d1a` |
| M | `packages/core/src/services/gafus/index.ts` | `bd3f1375bab0` | `45f427efe5bd` |
| M | `scripts/check-core-server-boundary.mjs` | `e6958593913e` | `cad038aa50f6` |

**Всего 12 файлов:** 8 M, 4 A.

## Тесты

| Этап | Результат | Лог |
|---|---|---|
| Core existing Gafus unlock replay+expiry | PASS 8 tests | `/tmp/a1-gafus-unlock-existing-target.log` |
| Core fail-closed and same Tx target unlock | PASS 3 tests | `/tmp/a1-gafus-unlock-port-core.log` |
| API server SQL unlock composition | PASS 1 tests | `/tmp/a1-gafus-unlock-api-contract-v2.log` |
| Core full | PASS 2124 tests / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-unlock-core-full-v2.log` |
| API full | PASS 2758 tests / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-unlock-api-full-v2.log` |
| Core types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-unlock-core-types.log` |
| Core build | PASS | `/tmp/a1-gafus-unlock-core-build-v2.log` |
| API types | PASS | `/tmp/a1-gafus-unlock-api-types-v2.log` |
| Gafus SQL adapter types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-gafus-unlock-server-types-v2.log` |
| Architecture boundaries | PASS | `/tmp/a1-gafus-unlock-boundaries-v2.log` |

## Внешние гейты

- **PG_UNLOCK_RACE** — Disposable full-schema localhost PostgreSQL, concurrent same-key and different-key Gafus requests under actual advisory user lock; assert debit+grant one transaction, rollback both on failure, idempotency not renewed after expiration.
- **CROSS_CLIENT_ENTITLEMENT** — Staging API/Web/Mobile user with private vs paid and unassigned step, trial vs 7-day Gafus grant, two course occurrences for same Step; verify exact owner and target ACL before media play.
- **FINAL_ARCH** — 20 remaining Core→server edges, combined A1/A2/A3 33-stage architecture final and five-stage chaos plus PG/Redis/Worker/panels/Web/Mobile gates before frozen baseline update.

A2: verify all fresh SHA256 values, port/installer/tests/guard atomically, semantically merge shared files, never overwrite concurrent work. A1 does no merge/push.
