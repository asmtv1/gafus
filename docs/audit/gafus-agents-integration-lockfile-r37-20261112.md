# GAFUS — локальная безопасная репетиция pnpm-lock.yaml для A1 + A2

**Решение для проверенного снимка 12.11.2026:** текущий `pnpm-lock.yaml` A1 уже содержит committed-A2 OpenTelemetry-зависимости `@gafus/logger` и сохраняет новые A1 workspace/patches. Поэтому **не требуется ни `ours/theirs`, ни посимвольное ручное объединение lockfile, ни копирование старого lock A2**. В **отдельной минимальной копии** (root + 69 package manifests, patch files, workspace config, Prisma schema, graph scripts; 88 скопированных файлов) `pnpm@10.12.4` выполнил `pnpm install --lockfile-only --offline --ignore-scripts`, затем `--frozen-lockfile`. После регенерации итоговый lock оказался побайтно идентичен A1: **diff = 0 строк**.

## Закреплённый ожидаемый SHA-256

```
A1 lock в момент snapshot:  f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e
Regenerated candidate lock:  f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e
Старый committed A2 lock:   8bd2ad9028d5361daefa25846e2ac402287270d7fa161c8396a77c170f30ef0c
```

**Этот SHA трижды воспроизведён — предварительное ожидание для существующего A1 snapshot, а не approval финального A1/A2/A3 кандидата.** Если Agent1 изменит любые `package.json`, `.npmrc`, pnpm-workspace, патчи или lockfile после snapshot, создать **новую копию и повторить регенерацию**, а не насильно возвращать старый hash. Запрет на использование старого A2 lock действует всегда. Нельзя использовать `pnpm install` с `--fix-lockfile` в общем дереве, устанавливать зависимости, изменять A1/A3 файлы, делать `git add/commit/merge/cherry-pick/push` или deploy.

## Что сравнивалось — фактические проверки

| Группа | Результат на изолированном кандидате |
|---|---|
| Источник | 88 файлов скопированы из A1 по SHA; после тестов source input drift = 0 |
| Повторная регенерация | **Три независимых прогона** из новых директорий дали одинаковый lock SHA, diff A1-vs-regenerated = 0 |
| A2 telemetry | 5 `@opentelemetry/*` зависимостей `packages/logger` сохранены, точные `specifier/version` совпадают с A2 committed lock; exports `./server-telemetry` присутствуют в A1 logger package.json |
| A1 workspace | 70 importers (69 package/apps + root), локальные `@gafus/*` link-цели, идентичность множеств имён зависимостей с package manifests, checkout/Worker `subscription-payment-server` |
| A1 patches | Проверены 7 entries; **expo-modules-core@55.0.27**, **react-native-reanimated@4.2.1**, **react-native-compressor@1.16.0** имеют реальные patch SHA равные lock hash. Старый A2 не содержит первых двух и имеет другое содержимое compressor patch |
| pnpm | `--lockfile-only --offline --ignore-scripts`: PASS; отдельно `--lockfile-only --frozen-lockfile --offline --ignore-scripts`: PASS. **Не было полноценной установки node_modules и build** |
| Workspace graph | `node scripts/check-workspace-graph.mjs` на копии: **69 проектов, 0 существующих циклов, 0 новых** |
| Prisma | В копию A1 `schema.prisma` добавлена **только** строка `previewFeatures = ["metrics"]`; `prisma validate --schema ...` через уже установленный Prisma CLI: PASS с placeholder `DATABASE_URL`, без подключения к БД. Сохранены `QuestionLegacyPhotoDeletion`, `Chat2OutboxEvent` lease/fencing и платёжные модели. SHA проверенной копии Prisma схемы `409d03078b161b9bdd8f5b073dbc24d76de4d8eb294706e6834477db86faa9df` |
| Prisma DDL diff | `prisma migrate diff --from-schema-datamodel A1 --to-schema-datamodel candidate --script` на копии: `-- This is an empty migration.` (код 0); никаких миграций к БД не применяли |
| Telemetry | **12/12** локальных OTLP / metrics / alert контрактов A2 PASS, без prod; запуск на A2 текущей реализации, не на полном интеграционном кандидате |
| Глубокая декларативная сверка | `architecture-integration-lockfile-validate.mjs`: **1292/1292 PASS** (5 OTel, packages/importers, patches, overrides, schema flags/models) |
| Защита от порчи | `architecture-integration-lockfile-validate.test.mjs`: **7/7 PASS** (включая old A2 lock, missing OTel, patch tamper, missing payment workspace, missing Prisma metrics, wrong Worker link) |

## Воспроизводимая команда, без изменений рабочего дерева

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
GAFUS_EXPECTED_LOCK_SHA=f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e \
  bash scripts/qa/architecture-integration-lockfile-reproduce.sh <НОВЫЙ_УНИКАЛЬНЫЙ_RUN_ID>
node --test scripts/qa/architecture-integration-lockfile-validate.test.mjs
```

Скрипт создаёт **новую папку только в** `~/Library/Logs/gafus-refactor-regression/a2-lockfile-proof-<RUN_ID>/candidate`, отказывается перезаписывать чужую папку и сохраняет `input-snapshot.json`, журналы pnpm, Prisma, telemetry, workspace, `lock-validation.json`, `receipt.json`. Подтверждённые прогоны: `.../a2-lockfile-r37-20261112-0549` (первый), `.../a2-lockfile-proof-r37-final-0600` (второй, 1292 проверок), `.../a2-lockfile-proof-r37-ddl-final-0610` (третий, 1292 проверок + Prisma пустая миграция). A1 и A2 рабочие lock-файлы не изменялись.

Машинный pinned audit: `docs/audit/gafus-agents-integration-lockfile-reconciliation-r37-20261112-v2.json`. Подготовлена **новая** политика `docs/audit/gafus-agents-integration-preflight-policy-20261112-r37-lock-verified.json`: в ней `lockfile.isolatedRegeneratedSha256` закреплён, `lockfile.regenerationEvidenceSha256` закреплён, **`approvedCandidateSha256` пустой**, `readyForIntegration=false`. В будущей копии preflight отвергнет старый lock A2 и любой непроверенный SHA.

**Важное ограничение:** пока готовилась репетиция, A1 начал новые группы rewarded-settings и course-version. Поэтому старый r37 policy **целиком** уже несовместим с живым A1: соответствующие `A1_SOURCE_FINAL_SHA`, `A1_NEW_FILES_ACCOUNTED` и `A1_DIRTY_PATH_SET_SHA` обязаны возвращать `FAIL` до обновления всех A1 manifests и финального реестра. Это *не* ошибка замороженного lock доказательства: 88 исходных lock-input SHA сейчас совпали, и обе регенерации стабильны. Не подменять разблокировку всего A1 approval отдельным успешным lock-prove.

**Не проверено и не утверждено:** полный `pnpm install --frozen-lockfile` с node_modules, Prisma generate и PostgreSQL migration against disposable DB на общем кандидате, полноценная TypeScript/Worker/Web/Mobile регрессия, 33 gates + 5 chaos, production OTLP, Cloud.ru/Beget, Apple/YooKassa sandbox. После финального A1 и согласования пакетных изменений эти проверки остаются обязательными по отдельному разрешению.
