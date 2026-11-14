# A1 → A2: RegistrationContracts Opaque Tx + SQL Rows Port

**12.11.2026, main, HEAD `0dcd18c13c8d` — никаких merge/commit/push/deploy.**

## Подтверждённый результат

- **30 → 29** Core→server, frozen 41: **12 resolved / 0 new**, historical 142: **113 retired**. Frozen baseline JSON не изменён.
- Core `registrationContracts.ts`: SQL import от `identity-write-server/registration-contract-rows` полностью убран; новые `registrationContractRowsPort.ts`, API composition до маршрутов.
- Прежняя `Prisma.TransactionClient` находится только в Persistence/API composition, Core имеет opaque `unknown` и специализированные методы, без новых DB соединений.
- Public VK grant/registration errors, purpose REGISTER/LOGIN, SHA256, TTL, fingerprint, advisory-lock-first порядок и repeat-idempotency неизменны.
- Если порт не подключён, нельзя создать registration/VK token или выдать LOGIN grant. Возникает `REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND`. Hot rebind запрещён.

## Файлы и SHA-256

Контрольная точка «до» — реальные байты уже незакоммиченного дерева перед этой группой, НЕ Git HEAD. Backup root: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/registration-contracts-sql-port-prechange`. Полные хеши хранятся в JSON.

| Статус | Путь | До SHA-256 | После SHA-256 |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `b8604e5fa98b` | `3dfd3e790d67` |
| A | `apps/api/src/modules/auth/composition/install-registration-contract-rows.contract.test.ts` | `—` | `34283cb662b1` |
| A | `apps/api/src/modules/auth/composition/install-registration-contract-rows.ts` | `—` | `1402a9c1de67` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `6c5a848c04a3` | `76fd0ae7732a` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `227f395c384e` | `e62ac9fae8ab` |
| M | `packages/core/src/services/auth/registerUserWithCredentials.integration.test.ts` | `da17d6a921f4` | `dd2599ff93ea` |
| A | `packages/core/src/services/auth/registrationContractRowsPort.test.ts` | `—` | `e58e0ae37eb5` |
| A | `packages/core/src/services/auth/registrationContractRowsPort.ts` | `—` | `d8bb91126f72` |
| M | `packages/core/src/services/auth/registrationContracts.ts` | `4518c5faf91d` | `f61afdd0f31c` |
| M | `packages/core/src/services/auth/vkRegistrationCompletion.test.ts` | `6f9cb8d84614` | `636520e841de` |
| M | `scripts/check-core-server-boundary.mjs` | `d892d284e727` | `16481b4336f9` |

**Итого 11 файлов:** 7 изменено, 4 добавлено.

## Приёмка и журнал

| Этап | Результат | Квитанция |
|---|---|---|
| Existing credential+VK replay and registration context | PASS, 14 tests, 2 skipped | `/tmp/a1-reg-contracts-test-adapted.log` |
| Core registration SQL port, advisory-lock and replay | PASS, 7 tests | `/tmp/a1-reg-contract-rows-target-tests.log` |
| API opaque transaction installer | PASS, 1 tests | `/tmp/a1-reg-contract-rows-api-target.log` |
| Full Core suite | PASS, 2091 tests, 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-contract-rows-core-full.log` |
| Full API suite | PASS, 2749 tests, 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-contract-rows-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-reg-contract-rows-core-ts-final.log` |
| Core build | PASS | `/tmp/a1-reg-contract-rows-core-build-final.log` |
| API typecheck | PASS | `/tmp/a1-reg-contract-rows-api-ts.log` |
| Worker typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-contract-rows-worker-types.log` |
| Workspace graph | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-registration-contract-rows-graph.log` |
| Core server boundaries | PASS | `/tmp/a1-reg-contract-rows-boundaries.log` |

## Точно не пройденные внешние acceptance

- **REGISTER_CONTRACT_REAL_PG** — Dedicated disposable loopback PostgreSQL with production-equivalent schema + fixture users/promo/VK contexts and consent, with concurrency for advisory-lock/replay, short-lived LOGIN grant race and rollback; do not use prod DB.
- **VK_OAUTH_EXTERNAL** — Approved VK test client and nonproduction OAuth/PKCE callbacks; validate LOGIN vs REGISTER consent and fingerprint without production credentials.
- **FINAL_ARCHITECTURE** — Eliminate 29 remaining Core→server edges, then combined A1/A2/A3 33-stage architecture final + 5-stage chaos and Web/Mobile/Worker/panels/PG/Redis gates. Frozen baseline must not advance earlier.

Агенту 2: сверить все `sha256_after` перед переносом; не перезаписывать shared `app.ts`, guard, аудит из параллельных потоков A2/A3. Переносить Core port, API composition и тесты атомарно. Никаких merge/push со стороны A1.
