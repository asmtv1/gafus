# GAFUS — механически проверяемый preflight перед будущей локальной интеграцией

**Статус: `BLOCKED_A1_FINAL_ARCHITECTURE_REGISTRY`**. Исходный платёжный манифест A1 (18 файлов) и финальный набор A3 (39 файлов) имеют закреплённые SHA. Это **не** финальный архитектурный реестр A1: пользователь отдельно запретил перенос, merge и изменение Git-истории до его завершения. Preflight не заменяет согласование конфликта, 33 регрессионных этапа, 5 chaos и 18 сценариев.

## Файлы

- Политика с закреплёнными fingerprint: `docs/audit/gafus-agents-integration-preflight-policy-20261112.json`. Для изменений политики нужно **новое явно утверждённое имя файла**, генератор не перезаписывает старый.
- Read-only валидатор: `scripts/qa/architecture-integration-preflight.mjs`.
- Создание очередного **чернового**, не утверждённого policy-снимка (только в новом файле): `python3 scripts/qa/architecture-integration-preflight-policy.py --output docs/audit/gafus-agents-integration-preflight-policy-next.json`. Само получение нового SHA не означает разрешения переносить код.
- 17 негативных и позитивных тестов на временной изолированной копии: `node --test scripts/qa/architecture-integration-preflight.test.mjs`; тестовый «финальный манифест» **искусственный** и не подтверждает завершение A1.
- Единый будущий runner `scripts/qa/architecture-integration-regression.sh` дополнен **обязательным preflight первым gate**, до build, Prisma generate и тестов.

## Проверяемый контракт

| Условие | Механическое доказательство | Отказ |
|---|---|---|
| Источники | SHA-256 `gafus-agent-1-to-agent-2-payment-composition-20261112.json` + `gafus-agent-3-final-local-handoff-20261112.json`, ожидаемые `kind/schema` и 18/39 уникальных файлов | Несовпадение SHA, путей или количества → `FAIL` |
| A1 финальный архитектурный реестр | Отдельный `finalArchitecture.manifestPath` + **утверждённый** SHA, строгий `FINAL_VERIFIED`, frozen sourceFingerprint, 0 новых forbidden dependencies, архитектурный PASS | Пока нет → `BLOCKED` |
| Копия | `--candidate /absolute/path` — существующая папка **вне** A1/A2/A3 рабочих деревьев. Никаких symlink-путей, не применяется ни один diff | Исходный worktree или опасный путь → `FAIL`; нет копии → `BLOCKED` |
| Платежи | 18 точных `sha256_after`, отдельная проверка отсутствия удалённого `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts` | Любое несовпадение или возврат старого Core-фасада → `FAIL` |
| A3 | Все 39 итоговых файлов по `sha256` final manifest, включая shared/owned/readonly, без массовой подмены старыми версиями отдельного worktree A3 | Любой файл отсутствует или изменён без переутверждения → `FAIL` |
| A2 P0 | Ровно 6 именованных путей: `schema.prisma`, `pnpm-lock.yaml`, `operation-observability.ts`, `serverTelemetry.ts`, `config.alloy`, `gafus-alerts.yml`. Четыре интегрируемые telemetry/monitoring files сверяются по отдельным **утверждённым** SHA (первоначально SHA committed A2) | Отсутствие или неподтверждённый reconciliation hash → `FAIL` |
| Prisma | В `generator client` единожды задан `previewFeatures = ["metrics"]`; при его исключении SHA схемы равен зафиксированной **полной A1 модели**, проверены AppSubscription*/Refund, `QuestionLegacyPhotoDeletion`, пять полей Chat2 outbox и `deadLetteredAt` index | Потеря metrics/модели/index/изменение исходной схемы A1 → `FAIL`. Репин только после нового финального реестра A1 |
| Lockfile | Запрет **известных старых** SHA `pnpm-lock.yaml` A2; отдельное одобрение SHA будущего целевого lock; YAML-parse, `lockfileVersion: '9.0'`, обязательные importers, workspace `@gafus/subscription-payment-server` для API/Worker, сверка объявленных workspace specs с `package.json`, три жизненно важных patch paths и их raw SHA-256 | Старый A2 lock, утраченные workspace links/patches или изменённый после pin SHA → `FAIL`; отсутствие одобренного нового hash → `BLOCKED` |

**Техническое ограничение:** внешние specifier могут быть переписаны pnpm `overrides`. Preflight проверяет их наличие в импортерах, а для `@gafus/*` — точные workspace specs. Полную корректность внешних резолюций после создания итогового lock доказывает только `pnpm install --frozen-lockfile` в **отдельно разрешённом** кандидате. Валидатор этот `pnpm install` сам не запускает.

## Запуск без изменений исходников и Git-истории

В текущем A2 worktree (без `--candidate`) команда должна завершаться **кодом 2**:

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
node scripts/qa/architecture-integration-preflight.mjs \
  --policy docs/audit/gafus-agents-integration-preflight-policy-20261112.json
node --test scripts/qa/architecture-integration-preflight.test.mjs
```

В будущем, **только когда архитектурный реестр A1 финализирован, созданы независимые источники/копия и получено разрешение на локальный перенос**:

```bash
# Это БУДУЩИЕ команды, сейчас не выполнять.
cd /Users/asmtv1/Desktop/gafus-agent2-observability
node scripts/qa/architecture-integration-preflight.mjs \
  --policy /ABSOLUTE/PATH/TO/REVIEWED/preflight-policy.json \
  --candidate /ABSOLUTE/PATH/TO/APPROVED/FROZEN/INTEGRATION/COPY
```

Утверждающий должен отдельно вписать в **новую, проверенную политику** `finalArchitecture.manifestPath`, `finalArchitecture.approvedManifestSha256`, согласованные SHA четырёх telemetry P0, SHA исходной схемы A1 после финального freeze и **одобренный после регенерации lockfile** SHA в `lockfile.approvedCandidateSha256`. Нельзя автоматически подставлять промежуточный платёжный документ или существующие `33/33` логи вместо реестра A1. Кандидат не должен быть самим каталогом работающего агента.

Коды возврата: **0** — `PREFLIGHT_PASS_NOT_INTEGRATION_OR_RELEASE_ACCEPTANCE`; **1** — `FAIL`, обнаружен конкретный контрактный дефект; **2** — `BLOCKED`, ожидаются финальный A1 manifest/замороженная копия/одобренный lock SHA. Для каждой проверки JSON содержит `id`, `status`, `detail`; output можно архивировать в журнале будущего кандидата без перезаписи чужих evidence.

**Текущий pinned source:** payment manifest SHA `87d0fbedf7ab2692637cbeed6fcf819b865f23c70f92094e4f5dd905a728a362`, A3 final SHA `b98783d54906caeb0e0f9c86861863a9b38b464cc0cb39bed29a5da5166fe3d7`. Действующая политика **не содержит** финальный A1 manifest и **не содержит** разрешённых candidate lock SHA; эти пустые поля намеренно блокируют интеграцию.

**Применение запрещено до отдельного разрешения:** никаких Git `add/commit/merge/cherry-pick/push/reset/stash`, переноса файлов, production/deploy, Cloud.ru/Beget или реальных платёжных провайдеров. Тесты создают временные минимальные копии и удаляют их после завершения; позитивный mock-final fixture не является реальным A1 receipt.

## Обновление A1 до 37 remaining — pinned r37 policy (12.11.2026)

**Действующая политика перед следующей интеграцией:** `docs/audit/gafus-agents-integration-preflight-policy-20261112-r37.json`. Предыдущий файл без суффикса `r37` намеренно НЕ изменён — он описывает старый payment-only snapshot. Все команды и будущий runner должны использовать политику `r37`, иначе два новых A1 кластера могут быть незаметно потеряны.

Три source-манифеста теперь проверяются по SHA-256 и схеме: payment — 18 записей, reminder-review — 7, feature-flags + subscription-access — 26. Итого **51 запись → 49 уникальных файлов**; audit inventory и audit progress имеют исторические SHA в reminder-манифесте, позднее заменённые документированными SHA из feature-flags-манифеста. Текущий after-SHA проверяется по последнему источнику, а оба старых SHA сохраняются для аудита. У трёх JSON и трёх MD companion manifests отдельные source SHA и пометка `EXCLUDE_AUDIT_ONLY`.

По 49 файлам: **46 `SHA_REQUIRED`**, **1 `REGENERATE_APPROVED_LOCK`**, **2 `EXCLUDE_AUDIT_ONLY`**. Все source SHA проверяются; для будущей копии два audit-файла не переносятся как runtime. Неизвестный путь после предыдущего frozen inventory вызывает `A1_NEW_FILES_ACCOUNTED=FAIL`, а изменение множества dirty paths вызывает `A1_DIRTY_PATH_SET_SHA=FAIL`. При последнем согласованном срезе появилось **19 новых путей, классифицированы все 19, пропусков 0**.

Сравнение с A2/A3: **1 прямой P0 A2 — `pnpm-lock.yaml`**, **0 прямых пересечений с финальными 39 файлами A3**. Дополнительный риск по семантике A2/A3 лежит в `apps/api/src/app.ts` (два install Core порта до подключения маршрутов, а также A2 telemetry), `packages/core/package.json`, `packages/types/src/index.ts`, `scripts/check-core-server-boundary.mjs`; не допускается бездумный whole-file overwrite. Шесть P0 A2 сохраняются в общей политике; Prisma `previewFeatures = ["metrics"]`, `QuestionLegacyPhotoDeletion`, Chat2 lease/fencing и payment модели остаются обязательными приёмочными гейтами.

**Read-only вызов для текущего r37 с проверкой всех SHA и явным `BLOCKED`:**

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
node scripts/qa/architecture-integration-preflight.mjs \
  --policy docs/audit/gafus-agents-integration-preflight-policy-20261112-r37.json
node --test scripts/qa/architecture-integration-preflight.test.mjs
```

**Текущая квитанция:** `docs/audit/gafus-agents-integration-preflight-source-status-20261112-r37.json` — **123 PASS, 0 FAIL, 3 BLOCKED**. Блокеры: `A1_R37_EXPLICIT_INTEGRATION_APPROVAL`, `A1_FINAL_REGISTRY_PIN`, `CANDIDATE_COPY`. Код выхода **2**. Это нормальный результат до завершения A1 и утверждения интеграции. Проверены **29/29** позитивных и негативных тестов, включая отбрасывание потерянного flags-installer, подменённого source SHA, скрытого нового A1 файла, повреждённого shared `app.ts` и устаревшего lock.

**Для будущей копии** после финального A1 manifest нужен новый отдельный policy с утверждёнными SHA всего integration candidate, финальной схемы A1 и regenerate/frozen lock, `readyForIntegration=true` только по явному разрешению. Одна лишь цифра 37 или файл с тестовыми логами не могут заменить `FINAL_VERIFIED` архитектурный реестр. Даже положительный `PREFLIGHT_PASS` не означает full regression 33/5/18 или staging/production accept.


## A1 recovery checkpoint 17 — новая строгая политика (12.11.2026)

**Использовать для нового снимка** `docs/audit/gafus-agents-integration-preflight-policy-20261112-r17.json`; не старый payment/r37. Полный реестр 23 исторических handoffs с SHA всего JSON, 276 file entries → 183 unique latest-after SHA + 47 companion audit SHA; 16 recovery AG4 исходников проверяются отдельно. `SHA_REQUIRED` = 180, `REGENERATE_APPROVED_LOCK` = 1, `EXCLUDE_AUDIT_ONLY` = 2. `A2` four committed path overlap — `pnpm-lock.yaml` (один, совместить генерированием), `A3` final-39 overlap — 0. Ratchet 41→17 / 24 resolved / 0 new. Recovery AG4 оставляет существующий keyed POST и unmounted review endpoint, SQL advisory lock и idempotency.

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
node scripts/qa/architecture-integration-preflight.mjs \
  --policy docs/audit/gafus-agents-integration-preflight-policy-20261112-r17.json
node --test scripts/qa/architecture-integration-preflight-r17.test.mjs
```

Snapshot source-only при создании политики: **568 PASS / 0 FAIL / 3 BLOCKED** (нет финального A1 registry, explicit approval, frozen candidate). Актуальный A1 уже начал следующее изменение offline-video; появление новых непокрытых dirty-paths должно переводить status в FAIL до обновления финального manifest — это ожидаемая защита, а не повод отключать inventory gate. В частности `A1_R17_SOURCE_DIRTY_SET_SHA` и `A1_R17_NEW_DIRTY_PATHS_ACCOUNTED` обязаны быть строгими. `readyForIntegration=false`; решение не переносить и не merge/push сохраняется.

**Проверка динамического A1 после закрепления r17:** A1 уже добавил recovery-следующую группу `offline-video-v3`. Текущий read-only r17 preflight **565 PASS / 5 FAIL / 3 BLOCKED**, где 5 FAIL — 3 ожидаемых drift SHA shared audit/guard файлов и два строгих fingerprint/coverage gate нового рабочего дерева. AG4 recovery 16-source handoff не был изменён, A2/A3 новых прямых пересечений нет. Выделенная пофайловая квитанция: `gafus-agents-integration-a1-r17-postsnapshot-drift-20261112.json`. Это точка контроля «проверка будущего A1 против старого r17 pin», а не повод переписать r17 pin без нового финального A1 манифеста.
