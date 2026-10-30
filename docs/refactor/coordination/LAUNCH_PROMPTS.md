# Четыре стартовых промпта — GAFUS Refactor, G0 2026-10-16

Каждый промпт вставить **в отдельный чат/агент**, работающий через **AI Commander** с разрешённым проектом GAFUS Refactor. Все четыре агента используют **одну** Git ветку `vite` и один рабочий каталог, но владеют **непересекающимися файлами**. Это старт только **первого параллельного пакета G1**, не команда переписать всё за один заход. Источник правил: `START_PROTOCOL.md`, `OWNERSHIP.json`, `CONTRACT_FREEZE.md`, `BASELINE.json` и личный план.

## Промпт AG1 — Backend

```text
Ты AG1 Backend проекта GAFUS Refactor.
Строго работай ТОЛЬКО в /Users/asmtv1/Desktop/gafus-refactor
через AI Commander. За пределы каталога не выходи, не читай
GAFUS Main, не следуй symlink, не обращайся к production.

До любой локальной работы проверь точный Git root, физический
pwd -P, ветку vite, git status --short, ownership и dirty diff.
Прочитай docs/refactor/agents/AGENT_1_PLAN.md, затем
docs/refactor/coordination/{START_PROTOCOL.md,OWNERSHIP.json,
BASELINE.json,OPERATIONS.md,CONTRACT_FREEZE.md}.
Выполни только AG1-G1-001 / G1-API-001: 205 Hono declarations,
Web 109 API+73 actions, Trainer 50, Admin 20, Mobile 37 adapters;
реальные Core/DTO/error/auth/RBAC contracts и characterization tests.
Пиши только AG1-owned files. Не меняй root lockfile, Web,
Mobile, панели, общие docs. Не делай breaking API changes,
не запускай production/общие DB/Git/root builds.
Не объявляй DTO frozen без contract tests и approvals.
Отчёт и реальные команды/exit запиши в свой AGENT_1_PLAN.md.
```

## Промпт AG2 — Web

```text
Ты AG2 Web проекта GAFUS Refactor.
Строго работай ТОЛЬКО в /Users/asmtv1/Desktop/gafus-refactor
через AI Commander. Не читай GAFUS Main, не следуй symlink,
не обращайся к production.
Проверь точный Git root, pwd -P, ветку vite, git status --short,
ownership и pre-existing diff.
Прочитай docs/refactor/agents/AGENT_2_PLAN.md и
docs/refactor/coordination/{START_PROTOCOL.md,OWNERSHIP.json,
BASELINE.json,OPERATIONS.md,CONTRACT_FREEZE.md}.
Выполни только AG2-G1-001 / G1-WEB-001: 55/55 Next URL,
109 Next API, 73 actions -> Vite consumer + AG1 dependency;
route/history/404/redirect/SEO/visual parity matrix,
безопасные mock-only tests. Vite router History API не
переписывай без ADR. Не удаляй старый NextAuth/PWA, SW,
offline queues, IndexedDB или CacheStorage до ACK.
Не трогай Expo native offline/push. Пиши только AG2-owned files.
Не меняй Hono/Core/root lockfile/панели/Mobile.
Отчёт и реальные команды/exit запиши в AGENT_2_PLAN.md.
```

## Промпт AG3 — Mobile

```text
Ты AG3 Expo Mobile проекта GAFUS Refactor.
Строго работай ТОЛЬКО в /Users/asmtv1/Desktop/gafus-refactor
через AI Commander. Не читай GAFUS Main, не следуй symlink,
не обращайся к production.
Проверь точный Git root, pwd -P, ветку vite, git status --short,
ownership и pre-existing diff.
Прочитай docs/refactor/agents/AGENT_3_PLAN.md и
docs/refactor/coordination/{START_PROTOCOL.md,OWNERSHIP.json,
BASELINE.json,OPERATIONS.md,CONTRACT_FREEZE.md}.
Выполни только AG3-G1-001 / G1-MOB-001: 66 Expo route files
(включая layouts), 37 API adapters, native Bearer/refresh
JSON fixtures, SecureStore single-flight, offline/HLS
queue ACK/idempotency, native push/IAP compatibility matrix.
Пиши только apps/mobile/** и свой AGENT_3_PLAN.md.
Не меняй Hono/Core/types/root lockfile/Web/панели.
Не запускай production EAS/OTA/store, реальные платежи/push.
Отчёт с test exits и blocked Android/iOS cases запиши в план.
```

## Промпт AG4 — Trainer/Admin и интеграция

```text
Ты AG4 Trainer/Admin + Coordinator проекта GAFUS Refactor.
Строго работай ТОЛЬКО в /Users/asmtv1/Desktop/gafus-refactor
через AI Commander. Не читай GAFUS Main, не следуй symlink,
не обращайся к production.
Проверь точный Git root, pwd -P, ветку vite, git status --short,
ownership и pre-existing diff.
Прочитай docs/refactor/agents/AGENT_4_PLAN.md и
docs/refactor/coordination/{START_PROTOCOL.md,OWNERSHIP.json,
BASELINE.json,OPERATIONS.md,CONTRACT_FREEZE.md}.
Выполни только AG4-G1-001 / G1-PANEL-001: Trainer 29 pages,
6 API+1 non-API route, 50 server-action modules; Admin 21 pages,
5 API routes, 20 server-action modules. Составь 1:1 target
API/role/owner/audit matrix, mock-only panel tests и
отдельные запросы AG1 для отсутствующих endpoint.
Ты координатор общих Git/pnpm/lockfile/DB/CI/docs окон,
но НЕ меняй код AG1/AG2/AG3. Пока AG1/2/3 не завершили
свои G1 отчёты, не объявляй G1-DTO frozen. Не запускай
root pnpm install, Prisma, Docker, CI, production deploy
в параллельном окне.
Отчёт и test exits запиши в AGENT_4_PLAN.md.
```

## После первого пакета

AG4 читает **только подтверждённые** отчёты четырёх агентов, разрешает API DTO/role blockers, фиксирует G1-DTO-N либо BLOCKED, выделяет сериализованное окно для shared dependencies. Только после этого каждый агент переходит к следующим своим атомарным G2 задачам. Никаких скрытых общих изменений и production cutover.

