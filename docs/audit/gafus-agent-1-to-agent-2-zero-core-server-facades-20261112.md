# A1 → A2: финальный checkpoint Core → server = 0 (12.11.2026)

Текущий HEAD: `0dcd18c13c8d567d543d1981b18d3caa52b16503`. Контрольный ratchet: **0 / 41** оставшихся (41 устранены, новых 0). Исторический инвентарь: **142 / 142** устранены.

**Выполнено:** последние 12 AST-связей перенесены в девять port/composition-контуров: Auth/VK, Offline Mutation Journal, Pets/Prevention/Vet, rewarded ad sessions, trainer step, training service, Gafus transaction contract. Настоящие SQL-адаптеры и транзакционные CAS/lock остаются на стороне Server/Persistence; Core не импортирует Prisma и `*-server`. Прямые вызовы Core fail-closed, без молчаливого fallback.

**Подтверждены проверки:** `pnpm check:core-boundaries` (26/26); `pnpm -r --workspace-concurrency 5 typecheck`; `pnpm --filter @gafus/core build`; `pnpm --filter @gafus/api build`; Core Vitest **2159 passed / 136 skipped**; API Vitest **2767 passed / 266 skipped**; новые 8 тестов strict-port bind/rebind — PASS; graph 69 проектов, циклов 0.

**Не подменять финальной интеграцией:** disposable Postgres/Redis проверки, A1/A2/A3 интеграционный preflight, 33-stage regression и 5-stage chaos пока не запускались этим агентом. Замороженные baseline **не перезаписаны**. Merge, push, коммит, деплой **не выполнялись**.

**Защита параллельных агентов:** SHA-256 (78 явно перечисленных путей, в том числе тестовые fixtures) и SHA двух baseline лежат в парном `docs/audit/gafus-agent-1-to-agent-2-zero-core-server-facades-20261112.json`; до наложения A2/A3 сверить совпадения в общем `apps/api/src/app.ts` и всех общих модулях.
