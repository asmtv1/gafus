# Агент 1 → агент 2: Password Reset Receipt Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Результат

- **34 → 33** Core → server; frozen 41: **8 resolved / 0 new**; historical 142: **109 removed**.
- Core `passwordReset.ts` не импортирует `@gafus/identity-write-server/password-reset`: singleton `PasswordResetPorts` fail-closed по умолчанию, composition API binds server consumer and exact `ResetReceiptUnavailableError` classifier.
- Транзакционная SQL-операция **не изменена**: токен SELECT FOR UPDATE, password, sessions revoked, token delete в одной транзакции. Core сохраняет SHA256 токена, bcrypt cost 12, narrow legacy 43-char fallback.
- Публичный `InvalidPasswordResetTokenError` и `Код недействителен или устарел` не менялись. Уведомление отправляется только после commit; email delivery failure не отменяет reset.
- Неподключённый port вызывает `PASSWORD_RESET_PORT_UNBOUND` и не хеширует пароль; rebind запрещён. API composition устанавливается до route startup.

## Файлы и SHA-256

Контрольная точка до — реальные байты незакоммиченного дерева перед группой, не HEAD. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/password-reset-port-prechange`. Полные SHA-256 в JSON.

| Статус | Файл | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `fe269bbd5da0` | `4a3ec033beea` |
| A | `apps/api/src/modules/auth/composition/install-password-reset.contract.test.ts` | `—` | `bddc34d3159c` |
| A | `apps/api/src/modules/auth/composition/install-password-reset.ts` | `—` | `55d17e14c919` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `4f80858c0d02` | `4a0175b992e5` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `4ac505d3841d` | `f8e9fd0dbe30` |
| M | `packages/core/src/services/auth/passwordReset.notice.test.ts` | `575b19bc0bb4` | `3432f90f41ae` |
| M | `packages/core/src/services/auth/passwordReset.ts` | `2d7f1906b273` | `4a8abb82185d` |
| A | `packages/core/src/services/auth/passwordResetPort.test.ts` | `—` | `6fe90161c385` |
| M | `scripts/check-core-server-boundary.mjs` | `e6d5263108e4` | `234ad9fea807` |

**Всего:** 9 файлов, 6 изменено, 3 добавлено.

## Проверки и результаты

| Этап | Статус | Журнал |
|---|---|---|
| Core password-reset token/short-code/message tests | PASS, 10 tests | `/tmp/a1-password-reset-core-ports.log` |
| API server-classifier identity contract | PASS, 1 tests | `/tmp/a1-password-reset-api-port.log` |
| Full Core regression | PASS, 2074 tests, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-core-full.log` |
| Full API regression | PASS, 2745 tests, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-password-reset-core-ts.log` |
| Core build | PASS | `/tmp/a1-password-reset-core-build.log` |
| API typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-api-types.log` |
| Identity Persistence typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-persistence-types.log` |
| Worker typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-worker-types.log` |
| Workspace DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-graph.log` |
| Architecture boundary | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-boundaries.log` |
| AST facade scanner | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-password-reset-ratchet.log` |

## Открытые блокеры

- **PASSWORD_TOKEN_REAL_PG_RACE** — Dedicated disposable localhost PostgreSQL with production-equivalent schema and users; verify SELECT FOR UPDATE single-consumer, concurrent token/short-code attempts, one password mutation, all refresh sessions revoked and rollback on failure. Never use prod DB.
- **PUBLIC_AUTH_STAGE** — Approved isolated API environment with Web/Mobile reset links, exact 43-character legacy fallback, rate limits and email provider sandbox. Confirm public error code/text, no token or email leakage. No real delivery.
- **FULL_ARCHITECTURE** — Eliminate 33 remaining Core→server imports; then run 33-stage final regression, 5-stage chaos and all Web/Mobile/Worker/panels/PG/Redis gates on integrated A1/A2/A3. Frozen baseline untouched until green.

Агенту A2: сравнить SHA-256 current с `sha256_after`; переносить вместе Core/API и tests, не перезаписывать параллельные A2/A3; frozen baseline менять только после полного общего acceptance. **A1 не делал merge/push.**
