# GAFUS Refactor — G0 file ownership и запрет конфликтующих изменений

**Статус:** G0 зафиксирован 2026-10-16; **ветка:** `vite`; **Git HEAD:** `5fc78081b499862d48e8e90b0f92d08bbfc2e251`.
**Машинный источник истины:** `docs/refactor/coordination/OWNERSHIP.json`. Этот документ описывает правила; JSON определяет эксклюзивного владельца каждого префикса/файла. Нельзя менять его в ходе параллельной работы без согласованного AG4 checkpoint.

## Абсолютная изоляция
**ВСЕ агенты действуют только в `/Users/asmtv1/Desktop/gafus-refactor`.** Читать, изменять, тестировать, собирать, вести Git, создавать логи/временные файлы разрешено только в этой директории. Запрещён любой доступ к GAFUS Main и к любой другой локальной директории; не переходить по symlink, не запускать команды из чужих проектов. Только **AI Commander**. В начале каждой сессии: точный `git -C ... rev-parse --show-toplevel`, ветка `vite`, `git status --short`, физический `pwd -P`, non-following проверка каждого пути. При несоответствии — STOP.

## Владение исходниками
| Владелец | Единоличная запись | Только чтение |
|---|---|---|
| **AG1 Backend** | `apps/api/**`, `apps/feed-cloud/**`, `apps/gallery-cloud/**`; **25 серверных** `packages/**` из OWNERSHIP.json, включая `types`, `core`, `prisma`, `worker`, `auth` | Web/Mobile/Trainer/Admin legacy pages, actions, adapters |
| **AG2 Web** | `apps/web/**`, `apps/web-vite/**`, `packages/react-query/**`, `packages/ui-components/**`, `packages/metadata/**` | Hono/Core, Expo, обе панели, root config |
| **AG3 Mobile** | `apps/mobile/**` | Hono/Core/Types, Web, панели, root config |
| **AG4 Panels + integration** | `apps/trainer-panel/**`, `apps/admin-panel/**`, `apps/bull-board/**`, `ci-cd/**`, `infra/**`, `docker/**`, `tests/**`, `.github/workflows/**`, `scripts/refactor/**`, coordination docs | Backend, Web, Mobile исходники |
| **Общие корневые файлы** | **AG4, только в выделенном эксклюзивном checkpoint**: `pnpm-lock.yaml`, root package/workspace/tsconfig/Turbo/ESLint/Vitest, остальные явно перечисленные в JSON | Все прочие агенты — только чтение |
| **Журналы** | Каждый агент — только `docs/refactor/agents/AGENT_N_PLAN.md` своего номера; общие `docs/refactor/*.md` и `docs/refactor/coordination/**` — только AG4 | Другие журналы read-only |

Любой **неуказанный путь — HOLD/read-only**. Новые `packages/api-contracts/**` и `packages/api-client/**` не существуют как автоматически разрешённая запись: AG1 предлагает их в запросе, AG4 закрепляет префикс JSON, только после этого создание. Любой `app.json`, `eas.json`, `ios/**` вне `apps/mobile`, произвольные `scripts/**`, файлы за границами — не считать разрешёнными по аналогии. Точные списки префиксов в OWNERSHIP.json имеют приоритет над сокращённой таблицей.

## Две принципиально разные границы
**Владение исходником ≠ владение переносимой операцией.** Например, AG2 владеет старым Next `apps/web/src/app/api/**`, но **не пишет** новый Hono: AG1 реализует соответствующий endpoint. AG4 владеет Next Server Actions панели, но AG1 переносит бизнес-правила и RBAC в API. AG3 владеет mobile adapters, но не серверными DTO.

**Право записи ≠ разрешение удалять/разрушать.** Даже владелец не удаляет legacy файлы до parity/rollback gate, не трогает существующие dirty изменения без diff-review, не запускает production-подобные команды. `packages/prisma` и media/storage/worker требуют отдельного non-prod gate; external symlink не разыменовывать.

## Конкурентность: что можно одновременно
**Параллельно:** независимые правки в `apps/api` (AG1), `apps/web-vite` (AG2), `apps/mobile` (AG3), `apps/trainer-panel` и `apps/admin-panel` (AG4); локальные scoped тесты без общей базы/генерации и без внешних путей; личные журналы.

**Строго по очереди:** `pnpm install`, lockfile и root config, Prisma generate/migrate, общие DB/Redis/S3 fixture mutations, root Turbo, общие Git commit/checkout/stash/merge/rebase, Docker/CI, shared docs, изменения API contracts с нарушением совместимости. AG4 объявляет окно в `PROGRESS.md`; все остальные останавливают эти операции. Нельзя одновременно делать даже два независимых коммита в одном Git working tree.

## Запрос на изменение чужой области
Записать в **свой** `AGENT_N_PLAN.md`:
```text
CHANGE-REQUEST ID: CR-YYYYMMDD-AGn-001
Requester / Owner: AGn / AGm
File / function / proposed contract:
Reason / existing behavior / affected clients:
Request DTO / response DTO / errors / auth / RBAC:
Compatibility: Web, Trainer, Admin, Expo old and new:
Tests: positive / negative / contract / integration:
Urgency / blocked task / rollback:
Decision: PENDING (до ответа AG4 + владельца)
```
AG4 копирует согласованное решение в `DECISIONS.md` и общий журнал, указывает revision и время эксклюзивного окна. **Не считать молчание согласием.** AG1 может добавлять новый endpoint лишь после согласования потребителей; изменение существующего успешного Mobile JSON требует теста старого клиента.

## Формальный тест эксклюзивности
```sh
cd /Users/asmtv1/Desktop/gafus-refactor
node scripts/refactor/verify_parallel_freeze.mjs
python3 scripts/refactor/parallel_baseline.py --verify
# --compare показывает ожидаемый drift ПОСЛЕ начала рефактора, не изменяет baseline.
python3 scripts/refactor/parallel_baseline.py --compare
```
Проверка не должна обращаться к сети, БД, production, внешним symlink и не создаёт артефактов. Перед запуском каждого агента убедиться, что все три файла `OWNERSHIP.json`, `BASELINE.json`, `CONTRACT_FREEZE.md` доступны в разрешённой папке.

