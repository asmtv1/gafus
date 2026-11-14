# GAFUS — четыре коммита A2: будущий локальный перенос и откат

**Статус: PLAN ONLY / WAIT FINAL A1.** Не выполнено ни одного cherry-pick, merge, patch application, создания ветки, stage, commit, push или deploy. Все Git-команды ниже — **только инструкция для будущей отдельно разрешённой чистой интеграционной ветки**. Не выполнять в рабочих деревьях A1/A2/A3.

## 1. Обязательная последовательность

| Этап | Полный SHA A2 | Путей | Назначение |
|---|---|---:|---|
| 1 | `751a435ec5096211b4325d80821cdfff271edd8d` | 23 | Базовые OTLP/Prisma/logger, Grafana, Prometheus, тесты и lockfile |
| 2 | `b05ca9c4e1c767fd4f10ea55531048f434a52527` | 20 | Pool wait, privacy/trace, Prisma metrics preview, two-instance recovery |
| 3 | `fbd89d62a977726828d4df132db5a848cb96c851` | 11 | Worker metric reset, log rotation, staging preflight, overhead |
| 4 | `bd93aef2234e228191c1e112655d0c5c1b2a711e` | 2 | Финальные audit-дополнения; не функциональная фича |

Цепь линейна от `0dcd18c13c8d567d543d1981b18d3caa52b16503`, A2 HEAD `bd93aef2234e228191c1e112655d0c5c1b2a711e`. **56 изменений, 39 уникальных путей, 6 P0 A2, 0 прямых совпадений с 39 путями финального A3 handoff.** Все пути, SHA-256 и риски в `gafus-a2-four-commits-transfer-preflight-20261112.json`; полный пофайловый перечень — `gafus-a2-four-commits-transfer-preflight-20261112.md`.

## 2. Предварительная оценка конфликтов на нынешнем, НЕ финальном A1

| Этап | Совпадает с этим коммитом | Base совпадает / путь свободен | Потенциальный add/add | Расходится по содержимому | Модифицирует файл, который даст предыдущий коммит |
|---|---:|---:|---:|---:|---:|
| 1 | 5 | 8 | **6** | **4** | 0 |
| 2 | 0 | 9 | 0 | **7** | 4 |
| 3 | 0 | 6 | 0 | **1** | 4 |
| 4 | 0 | 0 | 0 | 0 | 2 |

Сравнение каждого отдельного коммита проводилось с одной и той же **незавершённой** A1 копией, а не накапливалось. Следовательно поздние `MISSING_A1_MODIFIED_PATH` — в первую очередь зависимость от предыдущих A2 коммитов, а не прогноз гарантированного merge-конфликта. Отдельный **read-only `git apply --check`** на копии 39 затронутых путей A1 вернул exit 1 на каждом патче, что подтвердило невозможность объявить прямое применение безопасным; **ни один патч не применялся**. Логи: `~/Library/Logs/gafus-refactor-regression/a2-four-commits-readonly-preflight-20261112-0648/`.

### Шесть P0: решение до фиксации интеграционных коммитов

| Файл | Этапы | Решение |
|---|---|---|
| `pnpm-lock.yaml` | 1 | **Не копировать старый A2**. Сохранить финальные 70 workspace importers A1, Expo/RN patches и пять OTel logger deps, затем регенерировать pnpm lock в отдельной integration copy. Предварительный SHA `f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e` относится только к старому A1-снимку; новое A1-финальное состояние может дать новый SHA. |
| `packages/prisma/schema.prisma` | 2 | Основа — **полная финальная схема A1**, добавить только `previewFeatures=["metrics"]` (если отсутствует), сохранить `QuestionLegacyPhotoDeletion`, Chat2 lease/fencing/trace и платежные модели. `prisma validate`; при generator-only изменении DDL diff должен быть пуст. |
| `apps/api/src/lib/operation-observability.ts` | 1, 2 | Согласовать A1 `operationId`/requestId и API middleware с последним A2 OTLP wrapper; fail-open, redaction; API contracts. |
| `packages/logger/src/serverTelemetry.ts` | 1, 2, 3 | Согласовать A1 runtime с **финальной** реализацией A2, безопасные labels, отсутствие SQL/JWS/token/PII, Worker/API telemetry. |
| `ci-cd/docker/prometheus/config.alloy` | 1, 2 | Сохранить текущие A1 scrape/routing/авторизацию, добавить A2 collector и ограничение cardinality. |
| `ci-cd/docker/prometheus/gafus-alerts.yml` | 1 | Объединить существующие A1 правила с A2 Worker/API/360p/DLQ; исключить дубли; проверки Prometheus. |

**Дополнительные ручные:** `ci-cd/docker/prometheus/health-monitoring.contract.test.mjs`, `ci-cd/docker/grafana/dashboards/gafus-api-latency.json`, `packages/prisma/src/client.ts`, A2 audit. `packages/logger/package.json` на нынешнем A1 уже содержит A2 OTel deps/exports; это может оказаться no-op, но SHA/зависимости необходимо сверить после финального A1. Документы коммита 4 нельзя трактовать как новый результат общей регрессии.

## 3. Будущий перенос: только после финального манифеста A1

**Все четыре условия обязательны:** (а) A1 опубликовал проверенный **финальный** архитектурный реестр с SHA, 0 новых forbidden, перечнем всех изменённых/удалённых/новых файлов и тестовыми квитанциями; (б) отдельно согласованы A3 и владельцы всех shared paths; (в) пользователь разрешил локальную интеграцию; (г) в **отдельной** интеграционной ветке существует чистый коммит-основание полного финального A1. Нельзя пытаться cherry-pick поверх общего dirty `main` или поверх A2/A3 рабочих деревьев. Ни один из этих шагов сейчас не выполнялся.

**В будущем, уже на существующей, отдельно разрешённой ветке:**

```bash
export INTEGRATION_DIR=/ABSOLUTE/PATH/TO/APPROVED/INTEGRATION_WORKTREE
export EXPECTED_BRANCH=integration/a1-a2-a3-final
cd "$INTEGRATION_DIR"
test "$(pwd -P)" != /Users/asmtv1/Desktop/gafus-refactor
test "$(pwd -P)" != /Users/asmtv1/Desktop/gafus-agent2-observability
test "$(pwd -P)" != /Users/asmtv1/Desktop/gafus-agent3-worker
test "$(git branch --show-current)" = "$EXPECTED_BRANCH"
test -z "$(git status --porcelain)" || { echo 'CANDIDATE DIRTY'; exit 2; }

# Только после верификации отдельного, финального A1 source/sha manifest
# и разрешённой, замороженной candidate preflight-policy с кодом выхода 0:
A1_FROZEN_BASE=$(git rev-parse HEAD)
git merge-base --is-ancestor 0dcd18c13c8d567d543d1981b18d3caa52b16503 "$A1_FROZEN_BASE"
printf 'ROLLBACK_ANCHOR=%s\n' "$A1_FROZEN_BASE"

A2_1=751a435ec5096211b4325d80821cdfff271edd8d
A2_2=b05ca9c4e1c767fd4f10ea55531048f434a52527
A2_3=fbd89d62a977726828d4df132db5a848cb96c851
A2_4=bd93aef2234e228191c1e112655d0c5c1b2a711e
```

Порядок применения **строго 1 → 2 → 3 → 4**, без автоматического разрешения всех конфликтов `-X ours`/`-X theirs`:

```bash
# 1/4: базовая наблюдаемость. --no-commit оставляет возможность
# проверить/исправить staged result перед его фиксацией.
git cherry-pick --no-commit "$A2_1"  # если nonzero — СТОП, ручной разбор
git status --short
git diff --name-only --diff-filter=U
# Даже если Git частично слил lock, вернуть только этот файл к финальному A1:
git restore --source="$A1_FROZEN_BASE" --staged --worktree -- pnpm-lock.yaml
# Согласовать вручную API/lib, logger telemetry, alerts, Alloy, Grafana,
# сохранить A1 middleware/DB owner permissions. Для конфликтов добавить
# только конкретные согласованные файлы через git add -- <PATH>.
test -z "$(git ls-files -u)" || { echo 'UNRESOLVED'; exit 2; }
git diff --cached --check
# Перед commit — обязательно проверить git diff --cached --stat / -U3.
git commit -C "$A2_1"
INTEGRATED_1=$(git rev-parse HEAD)

# 2/4: private trace/pool wait; только после подтверждённого этапа 1.
git cherry-pick --no-commit "$A2_2"  # nonzero => СТОП
git status --short
git diff --name-only --diff-filter=U
# ОСНОВА Prisma = финальная A1 schema; вернуть её, затем вручную добавить
# лишь previewFeatures metrics в generator client, если ещё нет.
git restore --source="$A1_FROZEN_BASE" --staged --worktree -- packages/prisma/schema.prisma
# Проверить все A1 models/Chat2 outbox indexes; при уже имеющихся previewFeatures
# объединить список, не создавать второй generator/feature entry.
# git add -- packages/prisma/schema.prisma <КОНКРЕТНЫЕ_РАЗРЕШЁННЫЕ_PATHS>
test -z "$(git ls-files -u)" || { echo 'UNRESOLVED'; exit 2; }
git diff --cached --check
git commit -C "$A2_2"
INTEGRATED_2=$(git rev-parse HEAD)

# 3/4: logger final adjustments, log rotation, staging preflight.
git cherry-pick --no-commit "$A2_3"  # nonzero => СТОП
# Убедиться, что logger использует последнюю безопасную реализацию A2.
# git add -- <КОНКРЕТНЫЕ_РАЗРЕШЁННЫЕ_PATHS>
test -z "$(git ls-files -u)" || { echo 'UNRESOLVED'; exit 2; }
git diff --cached --check
git commit -C "$A2_3"
INTEGRATED_3=$(git rev-parse HEAD)

# 4/4: только актуализированные исторические квитанции.
git cherry-pick --no-commit "$A2_4"  # nonzero => СТОП
# Старые Web FAIL / staging PENDING не переименовывать в PASS.
test -z "$(git ls-files -u)" || { echo 'UNRESOLVED'; exit 2; }
git diff --cached --check
git commit -C "$A2_4"
INTEGRATED_4=$(git rev-parse HEAD)

printf 'APPLIED_1=%s\nAPPLIED_2=%s\nAPPLIED_3=%s\nAPPLIED_4=%s\n' \
  "$INTEGRATED_1" "$INTEGRATED_2" "$INTEGRATED_3" "$INTEGRATED_4"
```

**Ограничения инструкций:** после `cherry-pick --no-commit`, если есть конфликт, `git status`/`git ls-files -u` и явное разрешение всех файлов обязательны. Не выполнять приведённый `git commit -C` при неполной резолюции или пустом staged diff. Если изменение конкретного исходного коммита уже идентично интегрированной A1-семантике и staged diff пуст — зафиксировать пропуск в handoff как `already included`, **не создавать пустой коммит**; последующие операции используют реально полученные `INTEGRATED_N` SHA. Не выбирать whole-file ours/theirs для Prisma, logger, API tracing, alerts и Alloy.

## 4. Минимальная единая регрессия после согласования 4 коммитов

**Не запускать её сейчас.** После объединения всех package manifests и shared source файлов на одном замороженном SHA, локально в разрешённой копии:

```bash
cd "$INTEGRATION_DIR"
# Lock генерируется заново ПОСЛЕ manifests — никаких старых файлов A2:
pnpm install --lockfile-only --offline --ignore-scripts
pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts
node scripts/check-workspace-graph.mjs
pnpm check:core-boundaries
pnpm --filter @gafus/logger build
pnpm --filter @gafus/prisma prisma:generate
pnpm --filter @gafus/prisma typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
node --test scripts/qa/otel-local-collector.test.mjs \
  ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
pnpm --filter @gafus/api exec vitest run --config vitest.config.ts \
  src/lib/operation-observability.test.ts
node --test scripts/qa/observability-multi-instance.test.mjs \
  scripts/qa/observability-load-median.test.mjs \
  scripts/qa/observability-staging-preflight.test.mjs
# Synthetic Prometheus rules / Grafana dashboards, if tooling available.
# При явном разрешении disposable PG/Redis: локальные A2 gates + real multi.
# Затем одна полная интегрированная 33-stage + 5-chaos + 18 acceptance suite.
```

**Prisma DDL без БД:** отдельной командой сохранить финальную frozen A1 schema (`git show "$A1_FROZEN_BASE:packages/prisma/schema.prisma"`) во временный файл **вне интеграционной ветки** и сравнить через `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script`. При одном generator-флаге `metrics` должно получиться `-- This is an empty migration.`; нельзя автоматически делать deploy миграций. Lock SHA может измениться после финальных A1/A3 manifests — сравнить с новым зафиксированным кандидатом, а не принудительно возвращать предварительный `f131a5960b...`.

После зелёных адресных проверок вручную записать новый lock SHA, integrated 1–4 SHA, проверенные schema/contract manifests, исключения и полную матрицу. Результат A2 local ≠ проверка реального Alertmanager recipient, production/Cloudru Jobs/CDN или staging. Никаких внешних вызовов без отдельного разрешения.

## 5. Команды отката на БУДУЩЕЙ интеграционной ветке

**A. Конфликт и ещё не сделан интеграционный коммит.** На отдельной разрешённой ветке, не в A1/A2/A3:

```bash
cd "$INTEGRATION_DIR"
test "$(git branch --show-current)" = "$EXPECTED_BRANCH"
git status --short
git ls-files -u
# Если активен cherry-pick sequencer:
git cherry-pick --abort
# После -n sequencer может отсутствовать; тогда если виден staged/unstaged
# частичный результат, переходить к B ТОЛЬКО после проверки disposable status.
git status --short
```

**B. Полный отказ от всех локальных интеграционных изменений.** ТОЛЬКО если ветка disposable, чистая frozen A1 база сохранена, и **нет ценных чужих изменений**. `reset --hard` удаляет несохранённые изменения интеграционной копии, поэтому запрашивается отдельное явное разрешение перед выполнением:

```bash
cd "$INTEGRATION_DIR"
test "$(git branch --show-current)" = "$EXPECTED_BRANCH"
test -n "${A1_FROZEN_BASE:?baseline SHA must be saved}"
git status --short
# DESTRUCTIVE ONLY IN EXPLICITLY APPROVED DISPOSABLE INTEGRATION WORKTREE:
git reset --hard "$A1_FROZEN_BASE"
git clean -nd          # preview untracked only; no automatic removal
test "$(git rev-parse HEAD)" = "$A1_FROZEN_BASE"
```

**C. Ветка общая с другими интеграторами, историю переписывать нельзя.** Вместо reset — `git revert` **новых фактических** интеграционных SHA, в обратном порядке. Если часть исходных изменений была пропущена как already included, исключить соответствующий пустой шаг:

```bash
cd "$INTEGRATION_DIR"
test "$(git branch --show-current)" = "$EXPECTED_BRANCH"
# Использовать реально записанные INTEGRATED_N, НЕ исходные A2 SHA!
git revert --no-edit "$INTEGRATED_4" "$INTEGRATED_3" "$INTEGRATED_2" "$INTEGRATED_1"
# При конфликте revert: немедленно остановиться, проверить source owners,
# разрешить вручную или git revert --abort. Никаких force pushes.
```

Варианты B и C **взаимоисключающие**; ни `git clean -fd`, ни reset текущих A1/A2/A3 worktree, ни `git stash` как обходной путь, ни автоматический merge в `main` недопустимы.

## 6. Что остаётся открытым

Последняя запись A1 в `core-server-bulk-progress-20261111.md` на момент проверки — **30 remaining**, финального manifest A1 нет. Поэтому все классификации носят характер **прогноза на текущем A1**, а не подтверждённой совместимости с будущим frozen SHA. После публикации A1 final owner обязан обновить 39 source SHA, проверить 6 P0 и подготовить новую версию preflight/matrix. В текущем A2 эти документы — только untracked evidence, история Git нетронута. Ни staging, ни production не вызывались.

### Повторная read-only классификация после финального A1

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
python3 scripts/qa/architecture-integration-a2-commits-preflight.py \
  --tag a1-final-NEW_DATE
python3 scripts/qa/architecture-integration-a2-commits-preflight.test.py
```

Флаг `--tag` создаёт **новые** JSON и Markdown в A2, ничего не перезаписывает. При новом A1 snapshot исторические `git apply --check` из 06:48 помечаются как `NOT_RUN_FOR_THIS_SNAPSHOT`, а не повторно выдаются за свежие результаты. Для проверки будущего A1 нужны новый dry-run и согласование вручную до любого cherry-pick.
