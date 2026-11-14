# Агент 1 — проверяемый локальный прогресс, 11.11.2026

## Контекст и границы

- Checkout: `gafus-refactor`, исходный `HEAD=0dcd18c13c8d567d543d1981b18d3caa52b16503` (`main`). Это **не** отдельная интеграционная ветка или коммит.
- Перед записью новых правок было **1276** путей `git status --porcelain` (720 M, 207 D и 349 `??` entries); развёрнутый список новых файлов — **716**. Эти изменения не сбрасывались, не индексировались и не коммитились.
- Сохранены исходный `tracked-prechange.patch`, `status-prechange.txt`, `untracked-prechange.txt` и SHA-256 каждого нового файла: `~/Library/Logs/gafus-refactor-regression/a1-arch-20261111/`.
- Изменения локальные. `gafus1`, production, миграции и Cloud.ru Jobs не изменялись. Изолированные БД создаются во временных `/tmp/...` с динамическими портами.
- Актуальный отслеживаемый долг в Core: **54** фактических связи `Core → *-server` против 55 в начале; замороженный baseline 77, из которых сейчас 23 отсутствуют; 0 новых. Исторический реестр из 142 — **88** устранено, 54 осталось. Baseline сознательно **не** обновлён до общего полного прогона.

## Изменено в данной пачке

1. `scripts/check-core-server-facades.mjs`, `.test.mjs`: полный TypeScript AST для `import`, `export`, `import type`, `import = require`, `require()`, `import()` и шаблонных литералов. Неразрешённые вычисляемые пути блокируются, включая обход через динамический импорт; отрицательная фикстура.
2. `scripts/check-architecture-layers.mjs`, `.test.mjs`: негативный контроль computed import и AST-поиск импортов в защищённых слоях; фикстуры `Prisma`, `hono`, `ioredis`, private subpath, цикл.
3. `packages/types/src/contracts/applicationError.ts` и тест: общий безопасный контракт кодов/статусов/сообщений + классификация transient для API и Worker. Экспорт только из `@gafus/types`.
4. `apps/api/src/middleware/error-handler.ts` + контрактные тесты: классификация `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `AUTHORIZATION_ERROR` (legacy), `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`. Неподходящие пары код/статус и `INTERNAL_ERROR` переходят в публичный безопасный 500; исходные ошибки, токены, URL-параметры не возвращаются клиентам.
5. `packages/types/src/gafus.ts`, `packages/core/src/services/gafus/{types,walletService}.ts`: схема JSON-метаданных ledger вынесена из `gafus-server` в браузеробезопасные общие типы; бизнес-операции и транзакционный Prisma-клиент не затронуты. Убрана **одна** обратная зависимость.

## Доказательства после изменения

| Проверка / окружение | Подтверждение | Статус |
| --- | --- | --- |
| `node --test scripts/check-core-server-facades.test.mjs` | 4/4, включая обходы динамическими импортами | PASS |
| `node --test scripts/check-architecture-layers.test.mjs` | 3/3, включая запрет ORM/SDK и цикла | PASS |
| `pnpm check:core-boundaries` | Все актуальные статические границы пройдены | PASS |
| `node scripts/check-workspace-graph.mjs` | Граф workspace проверен в том же успешном job | PASS |
| `pnpm --filter @gafus/types test` | 89/89 | PASS |
| `pnpm --filter @gafus/types build` | tsup + emit declarations + .js extensions | PASS |
| `pnpm --filter @gafus/core typecheck` | tsc --noEmit | PASS |
| `pnpm --filter @gafus/api typecheck` | tsc --noEmit | PASS |
| `pnpm --filter @gafus/api exec vitest run src/middleware/g1-error-handler-classification.contract.test.ts --config vitest.config.ts` | 20/20 | PASS |
| `pnpm --filter @gafus/core exec vitest run src/services/gafus/{walletService,rewardService,g1-offline-training-reward-boundary}.test.ts --config vitest.config.ts` | 14/14 | PASS |
| `bash scripts/qa/gafus-wallet-lock-isolated-pg.sh` | 8 competing debit attempts; 4 successful/4 denied, rollback and user isolation | PASS |
| `bash scripts/qa/gafus-unlock-isolated-pg.sh` | 12 concurrent same-key requests charge once; rollback, owner boundaries, seven-day replay | PASS |
| `bash scripts/qa/gafus-admin-rows-isolated-pg.sh` | 5 tests: RBAC, settings revision, audit, ledger idempotency, fraud CAS | PASS |

Повторный прогон **после** последнего переноса типов: `c7dd02d32b88849541950c2337ab16678eb9b06e0111d19e` (exit 0); квитанция `~/Library/Logs/gafus-refactor-regression/a1-arch-20261111/final-local-boundaries.log` — все актуальные сканеры, граф, Core/API typecheck, 54 текущих рёбра.

Durable task IDs: boundaries/types/API `ca56a4dc1a6e34a194e391ab9a9c179b332acba85491f872` (exit 0), isolated economics `40f485fb1eb269ffcffc71375951b11f2a8babe13ce1e546` (exit 0). Economy transcript: `~/Library/Logs/gafus-refactor-regression/a1-arch-20261111/economy-batch.log`.

## Неперенесённые разрешённые исключения

- `node scripts/check-app-prisma-boundary.mjs`: 125 существующих импортов Prisma в приложениях, из них 10 нетестовых и 115 тестовых; новых/устаревших исключений 0. Два нетестовых адаптера находятся в API `infrastructure`, остальные восемь — Chat2/Questions/media в зоне агента 3; это **не** доказательство полного разделения API/Persistence.
- `node scripts/check-domain-package-prisma-boundary.mjs`: 286 исходных файлов, 179 замороженных инфраструктурных исключений, новых 0. Каждый ещё предстоит сверить с разрешённой Persistence-зоной.
- `node scripts/check-worker-prisma-boundary.mjs`: 5 зафиксированных исключений, новых 0.
- `node scripts/check-core-client-boundary.mjs`: 868 модулей и транзитивный граф клиентов — PASS.
- `git diff --check` для ограниченного набора изменённых tracked файлов — PASS; полный рабочий diff **не проходит** из-за четырёх ранее существовавших пробельных строк в `patches/react-native-compressor@1.16.0.patch`. Этот сторонний патч не исправлялся.

## Обязательные сценарии исходного ТЗ — 18 строк

`PASS` относится к проверке в **этом** проходе. `PENDING` не означает провал ранее выполненных тестов; это отсутствие подтверждения полной приёмки на интеграционном кандидате в указанном окружении.

| # | Исходный сценарий | Статус | Ограничение |
| ---: | --- | --- | --- |
| 1 | HTTP передаёт работу Application, без прямого ORM | PENDING | Сканер границ пройден, но 54 Core→server рёбра и аудит всех mounted HTTP маршрутов открыты |
| 2 | Все доменные ошибки дают типизированный публичный HTTP | PENDING | Центральные 20 контрактов PASS, но локальные мапперы всех маршрутов и Worker ещё не объединены |
| 3 | CI запрещает запрещённый импорт/цикл | PENDING | Отрицательные локальные фикстуры и граф PASS; публикация PR и обязательность branch protection не подтверждены |
| 4 | Rollback не оставляет outbox | PENDING | Требует общей регрессии outbox по этому кандидату |
| 5 | Коммит включает запись outbox | PENDING | Требует общего интеграционного прогона |
| 6 | Два Worker не берут одну задачу | PENDING | Агент 3 / общий прогон |
| 7 | Crash после внешнего вызова не дублирует эффект | PENDING | Агент 3 / общий прогон |
| 8 | Истёкший lease безопасно перехватывается | PENDING | Агент 3 / общий прогон |
| 9 | Непереуспевающий job попадает в DLQ | PENDING | Агент 3 / общий прогон |
| 10 | Очередь восстанавливается после зависимости | PENDING | Агент 3 / общий прогон |
| 11 | 720p доступен до завершения 360p | PENDING | Cloud.ru staging не подтверждён |
| 12 | Медиа replay не конфликтует | PENDING | Cloud.ru callback/ACK на реальном staging не подтверждён |
| 13 | Reconciler находит зависшее 360p | PENDING | Агент 3 / общий прогон |
| 14 | Повторный Chat2 send не дублирует сообщение | PENDING | Агент 3 / общий прогон |
| 15 | Wallet replay не даёт повторное списание | PASS | Изолированная PostgreSQL: concurrency, rollback, owner scope, idempotency |
| 16 | Сквозная трассировка по `operationId` | PENDING | Агент 2 / реальный collector и облачные callbacks |
| 17 | Алерт о зависшем job доставлен | PENDING | Агент 2 / развёрнутый Alertmanager |
| 18 | CDN 403/404 не обходят ACL | PENDING | Агент 3 / edge Beget на staging |

## Следующая граница готовности

До `9–9,5/10` не хватает переноса 54 фактических Core→server зависимостей без разрыва транзакций и доступа, итоговой 33-этапной `architecture-final-regression.sh`, 5-этапной chaos-проверки на собранном интеграционном кандидате, проверки клиентских сборок, совместимых миграций и утверждённого изолированного staging для внешних отказов. Публикацию/развёртывание или обновление ratchet нельзя считать завершёнными только по зелёным адресным тестам.
