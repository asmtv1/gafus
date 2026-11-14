# Агент 1 → агент 2: rewarded settings Persistence port

**Дата:** 12.11.2026, `main`, HEAD `0dcd18c13c8d`. **Не делались** commit, merge, push, deploy, изменение frozen baseline, активация новых routes.

## Атомарный перенос

- До переноса: **37 Core → server**. После: **36**, frozen 41: **5 resolved, 0 new**; исторически 142 → 36, устранено 106.
- Core `rewardedCredits/settingsService.ts` больше не импортирует `@gafus/gafus-server/rewarded-settings`, в нём остаётся доменная валидация и нормализация.
- API композиция `apps/api/src/modules/rewarded-credits/composition/install-core-settings.ts` связывает `readRewardedAdSettingsRow`/`writeRewardedAdSettingsRow` с Core через `registerRewardedSettingsPort`; вызов выполняется до загрузки Hono routes.
- Missing binding запрещает чтение и выдачу demo/test settings (`REWARDED_SETTINGS_PORT_UNBOUND`). Rebinding другим объектом запрещён (`REWARDED_SETTINGS_PORT_ALREADY_BOUND`). SQL-модуль и audit-семантика не менялись.
- Сохранены точные публичные ошибки **dailyAdLimit must be an integer between 0 and 100**, **placement id is required before enabling production rewarded ads**, **placement id is too long**; прежний DTO и перенос actorId подтверждены адресными тестами.

## Файлы и контрольные суммы

Источником `до` являются реальные байты общего незакоммиченного дерева **перед этой конкретной пачкой**, не Git HEAD. Дообновлённые файлы сохранены в `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/rewarded-settings-port-prechange`. Полные SHA-256 в JSON-манифесте.

| Статус | Файл | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `0cccaf1fdfb5` | `ce11980a7691` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-core-settings.contract.test.ts` | `—` | `c74b74439ac6` |
| A | `apps/api/src/modules/rewarded-credits/composition/install-core-settings.ts` | `—` | `95c7a4c428f6` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `6a03dd8ae9cc` | `0689e305ef8e` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `74ef2ce1ec72` | `0c5085349899` |
| A | `packages/core/src/services/rewardedCredits/settingsPort.test.ts` | `—` | `1619a5ab43f4` |
| M | `packages/core/src/services/rewardedCredits/settingsService.test.ts` | `f3815f7c4fcc` | `37e7f37ea955` |
| M | `packages/core/src/services/rewardedCredits/settingsService.ts` | `1eb26136cd7d` | `499b031f5c2a` |
| M | `scripts/check-core-server-boundary.mjs` | `c4a4f84c9f14` | `d85c6e3c810c` |

**Итого:** 9 файлов: 6 обновлены, 3 добавлены.

## Выполненные проверки

| Этап | Результат | Журнал |
|---|---|---|
| Full Core unit/contract suite | PASS, 2062 tests, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-settings-core-full.log` |
| Full API route/contract suite | PASS, 2742 tests, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-settings-api-full.log` |
| Core rewarded policy / ad / wallet regressions | PASS, 38 tests | `/tmp/a1-reward-settings-core-tests.log` |
| Core fail-closed port + public error regressions | PASS, 16 tests | `/tmp/a1-reward-settings-core-port-tests.log` |
| API composition preserves public DTO and actorId | PASS, 1 tests | `/tmp/a1-reward-settings-api-port-tests.log` |
| Architecture boundaries | PASS | `/tmp/a1-reward-settings-boundaries.log` |
| Core TS | PASS | `/tmp/a1-reward-settings-core-ts.log` |
| Core build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reward-settings-core-build.log` |
| API TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reward-settings-api-typecheck.log` |
| Gafus Persistence TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-reward-settings-server-typecheck.log` |
| Worker TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-settings-worker-typecheck.log` |
| Workspace graph | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-settings-workspace-graph.log` |
| AST facade ratchet | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-rewarded-settings-facades.log` |

## Незакрытые проверки — точные блокеры

- **PERSISTENCE_LIVE_POSTGRES** — Disposable PostgreSQL schema with RewardedAdSettings row, actor audit FK, failed write rollback and read-after-write; not production credentials.
- **APP_BOOT_INTEGRATION** — Shared A1/A2/A3 final application candidate with installed port before all Hono routes; check prod-style bundler startup and build after agent integration; NOT authorized now.
- **REWARD_AD_PROVIDER** — Staging-only reward ads provider placement IDs, approved platform/released-vs-review iOS sandbox and consent verification. No live ads or production provider calls.
- **FULL_ARCHITECTURE** — Remove remaining 36 Core→server imports, then run 33-stage final architecture regression and 5-stage chaos, all Web/Mobile/Worker/trainer/admin/PG/Redis gates on shared candidate. Baseline JSON remains frozen until full pass.

## Передача A2 и совмещение с A3

При интеграции сначала сверить все полные `sha256_after`. Файлы `apps/api/src/app.ts`, `scripts/check-core-server-boundary.mjs` и общие `docs/audit` менялись ранее A1 и могут пересекаться с работой других агентов: **только семантическое объединение**, без слепого копирования. Передавать Core settings port, API startup composition, guard и тесты единой атомарной группой. Не изменять frozen baseline до полной зелёной приёмки. Эти результаты не подтверждают весь архитектурный план: осталось 36 зависимостей.
