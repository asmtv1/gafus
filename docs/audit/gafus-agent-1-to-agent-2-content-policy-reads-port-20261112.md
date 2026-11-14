# A1 → A2: ContentPolicy Owner-Scoped Reads Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без commit/merge/push/deploy.**

## Результат

- **29 → 28** Core→server, frozen 41: **13 resolved / 0 new**, historical 142: **114 retired**. JSON baseline не менялся.
- Core `contentAccess/policy.ts` больше не импортирует `entitlements-server/policy-reads`; четыре SQL-метода переданы через `ContentPolicyReadPort` в API composition.
- Сохранены точные источники разрешения FREE, PRIVATE_ASSIGNMENT, SUBSCRIPTION, ROLE, GATING_DISABLED, GAFUS, DENIED; private assignment не обходит даже ADMIN.
- Paid subscription проверяет текущий период с `now`, article grant — только owner/article/expiresAt; роль берётся из БД, не из JWT. Нет порта — `CONTENT_POLICY_READ_PORT_UNBOUND` вместо allow; hot rebind запрещён.

## Файлы и полные контрольные суммы

«До» означает реальные байты уже незакоммиченного дерева перед группой, НЕ Git HEAD. Backup: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/content-policy-read-port-prechange`. Полные SHA-256 в JSON.

| Статус | Путь | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `3dfd3e790d67` | `c0ca1131b049` |
| A | `apps/api/src/modules/content-access/composition/install-policy-reads.contract.test.ts` | `—` | `c02cdfeda9a0` |
| A | `apps/api/src/modules/content-access/composition/install-policy-reads.ts` | `—` | `340d923ebba5` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `76fd0ae7732a` | `edab522d7d13` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `e62ac9fae8ab` | `78314583baee` |
| A | `packages/core/src/services/contentAccess/contentPolicyPort.test.ts` | `—` | `204ffa66a301` |
| M | `packages/core/src/services/contentAccess/index.ts` | `57a71ab39477` | `cbc212afa95b` |
| M | `packages/core/src/services/contentAccess/policy.test.ts` | `e9682744416a` | `4ca9c2fe4b23` |
| M | `packages/core/src/services/contentAccess/policy.ts` | `b17dee3e2949` | `b2ff3d23cbb6` |
| M | `scripts/check-core-server-boundary.mjs` | `16481b4336f9` | `fe4a70fc9cfb` |

**Всего:** 10 файлов: 7 M, 3 A.

## Проверки

| Название | Результат | Журнал |
|---|---|---|
| Core original policy & occurrence access | PASS, 15 тестов | `/tmp/a1-content-policy-core-target.log` |
| Core fail-closed owner/paid access port | PASS, 13 тестов | `/tmp/a1-content-policy-port-tests.log` |
| API private-course SQL composition | PASS, 1 тестов | `/tmp/a1-content-policy-api-port-test.log` |
| Full Core | PASS, 2096 тестов, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-policy-core-full.log` |
| Full API | PASS, 2750 тестов, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-policy-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-content-policy-core-ts.log` |
| Core build | PASS | `/tmp/a1-content-policy-core-build.log` |
| API typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-policy-api-types.log` |
| Entitlements adapter typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-policy-server-types.log` |
| Architecture boundary | PASS | `/tmp/a1-content-policy-boundaries.log` |

## Внешние acceptance блокеры

- **OWNER_SCOPED_REAL_PG** — Disposable current-schema PostgreSQL, test users with ADMIN, ordinary paid expired/current subscription, trial, private assignment revoked while session still valid, per-article Gafus grant expiry; no production DB.
- **CROSS_CLIENT_VIDEO** — Staging API/Web/Mobile with video occurrence route and user without any current paid entitlement; verify server policy owns private/paid decisions, no stale JWT role bypass.
- **FINAL_ARCHITECTURE** — Remove remaining 28 backwards Core→server edges, run joint 33-stage regression/5-stage chaos and all Web, Mobile, panels, Worker, PostgreSQL, Redis gates on integrated A1/A2/A3. Frozen baseline stays 41 until full pass.

Агенту 2: сверить `sha256_after`; не перезаписывать работы A2/A3 в `app.ts`/guard/Core index. Port + installer + contracts переносить одной группой. Нет merge/push от A1.
