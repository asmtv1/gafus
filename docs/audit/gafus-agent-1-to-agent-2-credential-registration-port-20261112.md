# A1 → A2: Credential Registration Single Transaction Port

**12.11.2026, main HEAD `0dcd18c13c8d`. Никаких merge/commit/push/deploy.**

## Результат

- Core→server **31 → 30**. Frozen baseline 41: **11 resolved / 0 new**; historical 142: **112 retired**.
- `registerUserWithCredentials.ts` больше не импортирует серверные registration contract rows; вместо этого `CredentialRegistrationPort`, регистрируемый API до Hono routes.
- В одной и той же прежней серверной SQL-транзакции выполняются idempotency receipt / email-password / consent COMPLETED / referral. Повтор проверяет fingerprint и bcrypt пароль, stale другой попытки не возвращает успех.
- Core публичные коды `VALIDATION_ERROR`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `PROMO_INVALID`, `ATTEMPT_MISMATCH` и русские сообщения не менялись. P2002 target classifier остаётся server-owned. Unbound port fails closed, hot rebind запрещён.

## Файлы и SHA-256

Исходное `до` — реальные байты незакоммиченного дерева перед этой группой, не HEAD. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/credential-registration-port-prechange`. Полные SHA-256 в JSON.

| Статус | Путь | До | После |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `320a085004a4` | `b8604e5fa98b` |
| A | `apps/api/src/modules/auth/composition/install-credential-registration.contract.test.ts` | `—` | `6634abdc768f` |
| A | `apps/api/src/modules/auth/composition/install-credential-registration.ts` | `—` | `8763e9ceb24e` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `1d41c4a6224d` | `6c5a848c04a3` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `4e1bbe8579c9` | `227f395c384e` |
| A | `packages/core/src/services/auth/credentialRegistrationPort.test.ts` | `—` | `93bc284d3502` |
| M | `packages/core/src/services/auth/registerUserWithCredentials.integration.test.ts` | `aa43e0c8857c` | `da17d6a921f4` |
| M | `packages/core/src/services/auth/registerUserWithCredentials.test.ts` | `4bc346621da7` | `f77f61a7c9b6` |
| M | `packages/core/src/services/auth/registerUserWithCredentials.ts` | `78ef098366bf` | `5706a152695c` |
| M | `scripts/check-core-server-boundary.mjs` | `ecbd7ab2cbc5` | `d892d284e727` |

**Всего:** 10 файлов: 7 обновлено, 3 добавлено.

## Проверки

| Название | Статус | Лог |
|---|---|---|
| Core original registration scenarios | PASS, 8 тестов, 2 skip | `/tmp/a1-credential-core-target.log` |
| Core transactional port and public errors | PASS, 12 тестов | `/tmp/a1-credential-port-core-tests.log` |
| API registration transaction composition | PASS, 1 тестов | `/tmp/a1-credential-api-contract.log` |
| Full Core | PASS, 2086 тестов, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-core-full.log` |
| Full API | PASS, 2748 тестов, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-credential-core-ts.log` |
| Core build | PASS | `/tmp/a1-credential-core-build.log` |
| API typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-api-types.log` |
| Persistence typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-persistence-types.log` |
| Worker typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-worker-types.log` |
| Workspace DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-graph.log` |
| Architecture boundaries | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-boundaries.log` |
| AST scanner | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-credential-ratchet.log` |

## Открытые external/интеграционные проверки

- **POSTGRES_ATOMICITY** — Disposable full schema PostgreSQL; concurrently replay identical tempSessionId and different fingerprint, consent/partner FK, test P2002 email/username and failed nested transaction rollback; gated 2 real-PG scenarios were skipped.
- **DNS/CONSENT_EXTERNAL** — Approved nonproduction DNS sandbox/email domain cases, real accepted consent versions and partner-code staging; no production user creation.
- **FINAL_ARCHITECTURE** — 30 remaining Core→server edges must be moved, then 33-stage architecture +5-stage chaos, Web/Mobile/Worker/panels/PG/Redis integration on A1/A2/A3 candidate. Frozen ratchet still 41.

A2: сверять каждый `sha256_after`, переносить порт, API installer, тесты и guard вместе; не перетирать параллельные A2/A3. Frozen baseline JSON не менять до всего итогового прогона. A1 не выполнял merge или push.
