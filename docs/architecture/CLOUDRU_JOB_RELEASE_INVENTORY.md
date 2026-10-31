# Cloud.ru Jobs: первая публикация Refactor main — только V2

Актуально: 2026-10-30. Все изменения в `/Users/asmtv1/Desktop/gafus-refactor`; локальный GAFUS Main не открывался. Продакшн-деплой/пуш не запускались.

## Latest GitHub secret readiness — 2026-10-30 23:23 +04:00

**UPDATE — all four user-provided Chat2 secrets now exist in GitHub Repository secrets** (verified via GitHub API, names only): `CHAT2_CLOUDRU_KEY_ID`, `CHAT2_CLOUDRU_KEY_SECRET`, `CHAT2_S3_ACCESS_KEY_ID`, `CHAT2_S3_SECRET_ACCESS_KEY`. GitHub Environment `production` does **not** define duplicate names; workflows using `secrets.*` in that environment therefore inherit these Repository secrets. The `production` Environment still contains `CHAT2_INTERNAL_HMAC_SECRET`, `CHAT2_CENTRIFUGO_TOKEN_SECRET`, `CHAT2_CENTRIFUGO_API_KEY`, `QUESTIONS_V2_INTERNAL_HMAC_SECRET`, `QUESTIONS_V2_S3_ACCESS_KEY_ID`, `QUESTIONS_V2_S3_SECRET_ACCESS_KEY`; `CHAT2_CLOUDRU_PROJECT_ID` remains configured as an Environment variable. **No missing secret names remain from this known inventory.** Secret *values*, IAM authorization and S3 bucket operations cannot be inferred from GitHub name metadata; first-release Cloud.ru GET + scoped S3 read-only preflight, actual image/HMAC cutover and independent QA are still outstanding.

**Security audit update:** zod 4.6.7 with v3-compatible imports and Hono validator 0.9.1 closes GHSA-mrhx-c7xc-m3w5 High on the installed dependency graph; fresh `pnpm audit --audit-level high` exit 0 (0 Critical / 0 High / 41 Moderate / 5 Low). Local source contract and API regression receipts are in `docs/qa/CURRENT_RELEASE_STATUS.md` and ignored `.local-pg-scratch/qa-logs/release-check-20261030/`.

The entries below are historical access-setup checkpoints from earlier on 2026-10-30. Statements that those four names were missing are **superseded by this latest readback**.

---

## Принятое правило

**Первый успешный push в `main` обязан закончиться подключением только новых обработчиков Gallery V2, Feed V2, Questions V2, Chat2.** Промежуточное использование предыдущего Gallery image на production не считается успешным релизом. Никаких новых Cloud.ru Docker builds/Registry pushes/Jobs в обычном CI/CD. Все образы уже опубликованы: workflow переключает **существующие** Jobs на неизменяемые digest и сверяет HMAC с новым Refactor Backend. Старый media fallback не допускается.

### Обязательный порядок для `ci-cd.yml` и `deploy-only.yml`

1. `cloudru-jobs-preflight` — Cloud.ru IAM двух организаций/проектов, GET всех **11** существующих Jobs, точные имена, роль и digest, корректные env/secret inputs, запрет staging/фиктивных Jobs; без облачных изменений. До переключения Gallery может иметь предыдущий digest **только как исходное состояние**.
2. `deploy-production` — развернуть новые GHCR образы Web/API/Worker и применить штатные миграции, проверить `/ready`. На этом кратком этапе `CLOUDRU_MEDIA_JOBS_ENABLED=false`, `QUESTIONS_V2_*READY=false`, `CHAT2_V2_*READY=false`: новый Backend не отправляет задания старым обработчикам.
3. `cloudru-jobs-cutover` — предварительно выполнить только read-only OCI manifest inspection трёх опубликованных основных образов через Docker Buildx `imagetools inspect` (**без Docker build/push**), затем при здоровом новом Backend удостовериться, что Gallery, Questions и Chat2 internal маршруты монтированы (GET → 405 либо 503, не 404). Сохранить прежнюю полную конфигурацию (включая image digest, ресурсы, env, retry, timeout) в приватный файл 0600 на runner для отката. Сделать `PATCH` **только существующих** Jobs без `runImmediately` и без изменения CPU/RAM/timeouts: Gallery оба на V2 digest, Feed оставить на текущем V2 digest, Questions включить и привязать к `api.gafus.ru`, Chat2 оставить текущие pinned-image refs; синхронизировать соответствующие HMAC с GitHub Secrets. Проверить GET каждой Jobs и `ready`, при частичном отказе попытаться вернуть прежнюю конфигурацию. Отказ → следующий этап не исполняется.
4. `cloudru-media-activate` — по SSH проверить точный Git SHA нового Backend, наличие всех секретов, здоровые API/Worker; сохранить `.env` с правами 0600; включить Cloudru Media, Questions V2, Chat2 V2 и новые chat-флаги, пересоздать **только** API и Worker, проверить health/ready. При любой ошибке восстановить состояние `CLOUDRU_MEDIA_JOBS_ENABLED=false` (не откатывая БД, новые образы и контент).
5. `cloudru-jobs-verify` — Cloud.ru GET сверяет **Gallery V2 digest, Feed V2, Questions V2 enabled + HMAC, Chat2 scoped Jobs**, запрашивает лишь имеющиеся образы. Старый Gallery digest в финальном verify **запрещён**; при ошибке workflow завершится неуспешно. Beget post-deploy smoke выполняется только после этого этапа.

Действующий режим `main` push запускает всё автоматически, без старого `GAFUS_REFACTOR_PRODUCTION_CUTOVER` gate. Остальные существующие проверки security, Chat2 QA, Beget, миграций и здоровья остаются блокирующими. Никаких тестовых заданий, способных изменять production данные, не запускаем.

## Целевой inventory из dispatcher

Cloud.ru primary project `4c590727-4133-475b-a4bc-564c90a9e686`, registry `gafus.cr.cloud.ru`:

| Job | Образ после первого успешного main | Ресурсы |
| --- | --- | --- |
| `gafus-gallery-process` | `gafus-gallery-worker@sha256:7f8d4325a712b3ba0a78b1d6750e4325cd66b07f5157a0d6e0bcb751b4f6693c` | 1 vCPU, 2 ГБ |
| `gafus-gallery-process-2` | тот же Gallery V2 digest | 1 vCPU, 2 ГБ |
| `gafus-feed-photo`, `gafus-feed-photo-2` | `gafus-feed-worker@sha256:0fdca7bea758c2469d639f3f9b3e3a78dfa71bcb787ab4218426e407027f9176` | 1 vCPU, 2 ГБ каждый |
| `gafus-feed-video`, `gafus-feed-video-2` | тот же Feed V2 digest | 2 vCPU, 8 ГБ каждый |
| `gafus-questions-photo` | `gafus-questions-worker@sha256:96f76942f9f12099353b131c61332502175f18a1ec94919bfcfd1f4cc04ab321` | 1 vCPU, 2 ГБ |

**Актуализация 2026-10-31:** четыре существующих Feed Jobs уже вручную переведены на указанный выше новый диагностический digest (один общий образ для 2 фото + 2 видео). Ссылка в `production-job-release.mjs` синхронизирована с фактическим Cloud.ru, чтобы CI не ожидал старый образ. Это обновление **не подтверждает исправление первопричины** зависшей публикации: сначала необходимы новые производственные логи и успешная проверка состояния `published`. Полный инцидент: `docs/operations/INCIDENT_2026-10-31_FEED_MEDIA_PENDING.md`.

Chat2 отдельный project `6777bd18-4ee9-4d15-bb1b-134f7a18ed3a`, registry `gafus-chat2-20261028.cr.cloud.ru`: четыре Jobs `gafus-chat-photo`, `gafus-chat-photo-2` (фото), `gafus-chat-video`, `gafus-chat-video-2` (видео). Используются уже опубликованные digest refs соответствующего registry (НЕ подставлять primary image/credentials). `CHAT2_CLOUDRU_PROJECT_VERIFIED=true` выставляется в app только после полного доступа и проверки этих четырёх Jobs.

**Первоначальное фактическое состояние Cloud.ru на 2026-10-30:** обе Gallery production Jobs ещё на digest `sha256:652b3ce4…`; Questions закреплён на V2 image, но временно `QUESTIONS_V2_JOB_ENABLED=false`, `QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED=false`, Backend `api.gafus.ru`. Это **состояние до main push**, не финальный целевой результат. Новый Gallery image `7f8d…` доступен в Cloud.ru Registry, 51 worker и 33 Gallery Server тестов и typechecks ранее прошли. API `api.gafus.ru` до релиза Refactor отвечал на `/internal/questions/media/jobs/claim` кодом 404 — поэтому CI переключает image/flags **только после** выкладки нового Hono API.

### Staging cleanup — выполнен

Через авторизованный Chrome (Cloud.ru Evolution UI) удалены `gafus-gallery-process-staging`, `gafus-feed-photo-staging`, `gafus-feed-video-staging`. После перезагрузки UI подтверждено ровно 7 production Jobs основного проекта и ни одного staging. Существующие Registry images не удалялись.

До удаления Gallery staging был сохранён приватный rollback snapshot `.local-pg-scratch/cloudru/gallery-v2-rollback-20261028/`; перед правкой Questions V2 сохранён UI config snapshot `.local-pg-scratch/cloudru/questions-v2-preedit-ui-20261030.json` (0600). Эти файлы содержат чувствительные данные и не входят в git.

## GitHub Actions: критичные prerequisites

**Основной Cloud.ru:** `CLOUDRU_PROJECT_ID`, `CLOUDRU_KEY_ID`, `CLOUDRU_KEY_SECRET` (GitHub Secrets). **Отдельный Chat2 project:** `CHAT2_CLOUDRU_PROJECT_ID` (variable, ровно `6777bd18-4ee9-4d15-bb1b-134f7a18ed3a`), `CHAT2_CLOUDRU_KEY_ID`, `CHAT2_CLOUDRU_KEY_SECRET` (Secrets). **HMAC:** `GALLERY_INTERNAL_HMAC_SECRET`, `FEED_INTERNAL_HMAC_SECRET`, `QUESTIONS_V2_INTERNAL_HMAC_SECRET`, `CHAT2_INTERNAL_HMAC_SECRET`. **S3:** `QUESTIONS_V2_S3_ACCESS_KEY_ID`, `QUESTIONS_V2_S3_SECRET_ACCESS_KEY`, `CHAT2_S3_ACCESS_KEY_ID`, `CHAT2_S3_SECRET_ACCESS_KEY`. Также исходные Chat2 QA/WS secrets и BEGET preflight inputs обязательны. Никогда не хранить значения секретов в git/логе.

**Фактический GitHub metadata audit 2026-10-30 (только имена, без значений):** уже присутствуют `CLOUDRU_PROJECT_ID`, `CLOUDRU_KEY_ID`, `CLOUDRU_KEY_SECRET`, `GALLERY_INTERNAL_HMAC_SECRET`, `FEED_INTERNAL_HMAC_SECRET`. Отсутствуют **6 новых HMAC/S3 Secrets**: `QUESTIONS_V2_INTERNAL_HMAC_SECRET`, `QUESTIONS_V2_S3_ACCESS_KEY_ID`, `QUESTIONS_V2_S3_SECRET_ACCESS_KEY`, `CHAT2_INTERNAL_HMAC_SECRET`, `CHAT2_S3_ACCESS_KEY_ID`, `CHAT2_S3_SECRET_ACCESS_KEY`; а также **2 Chat2 scoped IAM Secrets** (`CHAT2_CLOUDRU_KEY_ID`, `CHAT2_CLOUDRU_KEY_SECRET`) и **1 Chat2 Project ID Variable** (`CHAT2_CLOUDRU_PROJECT_ID`). Отдельно не найдены `CHAT2_CENTRIFUGO_TOKEN_SECRET`, `CHAT2_CENTRIFUGO_API_KEY`, а также Chat2 enable/WS vars (`CHAT2_LEGACY_RETIRE_ENABLED`, `CHAT2_API_ENABLED`, `CHAT2_WORKER_ENABLED`, `CHAT2_PRIVATE_MEDIA_ENABLED`, `CHAT2_PUBLIC_WS_URL`). Это реальные блокеры на текущем GitHub, а не предположение: **первый push до их заполнения завершится ошибкой до деплоя, а не запустит старые Jobs**. Нельзя утверждать, что первый push гарантированно завершится, пока эти параметры и права не готовы.

GitHub Secrets не генерировались, не перезаписывались и не синхронизировались из локальных тестовых туннелей. Имена нужны именно в `production` Environment или на уровне repository. Значения должны соответствовать настроенным Cloud.ru организациям и S3 policy. Без секретов/прав не обходить QA и IAM проверки.

## Локальные проверки

```sh
node infra/cloudru/production-job-release.mjs --plan
pnpm test:cloudru-media
node --test ci-cd/scripts/deploy-only-contract.test.mjs ci-cd/scripts/feed-poll-release-contract.test.mjs
```

Никаких production application deploy, Cloud.ru `PATCH` и запуска Cloud.ru Jobs текущей локальной подготовкой не проводилось. Подключение V2 будет выполнено только в будущем успешном release pipeline на `main`.

## Access readiness update — 2026-10-30 (Safari + Chrome)

**Questions V2: GitHub production credentials completed.** Chrome snapshot was compared with the live `gafus-questions-photo` Container Job via scoped Cloud.ru API; the HMAC and source-bucket S3 credentials matched. Read-only S3 `HeadBucket` against `gafus-questions-public` returned HTTP 200. Set and read back in GitHub Environment `production`: `QUESTIONS_V2_INTERNAL_HMAC_SECRET`, `QUESTIONS_V2_S3_ACCESS_KEY_ID`, `QUESTIONS_V2_S3_SECRET_ACCESS_KEY`. No secret value printed, committed, or overwritten.

**Chat2 scoped IAM: project account created, key not transferred.** Authorized Safari for project `6777bd18-4ee9-4d15-bb1b-134f7a18ed3a` shows exactly four Chat2 Container Jobs. New service account `gafus-chat2-jobs-ci` belongs to that project and has only `serverless-containers.editor`, not organization-wide permissions. Generated a 365-day Cloud.ru access key (valid until 2027-10-30). **One-time Key ID + Key Secret remain in the Safari key dialog**; automated transfer to GitHub was blocked by the tool security layer. DO NOT close the Safari dialog until the user copies the values directly into GitHub production environment secrets `CHAT2_CLOUDRU_KEY_ID` and `CHAT2_CLOUDRU_KEY_SECRET`. These two GitHub secrets are NOT yet configured, so Chat2 IAM release preflight cannot pass.

**Chat2 S3: two GitHub secrets still missing.** A project-level `gafus-chat2-s3-media` service account has bucket-only `s3e.editor` and `s3e.viewer` roles for `gafus-chat2-media-2026`; its existing S3 access key, visible as metadata in Safari, expires 2026-11-27. A locally protected historical env file `.local-pg-scratch/cloudru/chat2-s3-credentials.env` has `CHAT2_S3_ACCESS_KEY_ID`/`CHAT2_S3_SECRET_ACCESS_KEY`, but automated verification/export was blocked. Values were not committed or copied. User must provide these two values **directly** to GitHub Environment `production` (no chat transmission). Recheck authorization before activating Chat2 processing.

**Completed Chat2 GitHub setup:** production variables `CHAT2_CLOUDRU_PROJECT_ID`, `CHAT2_LEGACY_RETIRE_ENABLED=enabled`, `CHAT2_API_ENABLED=enabled`, `CHAT2_WORKER_ENABLED=enabled`, `CHAT2_PRIVATE_MEDIA_ENABLED=enabled`, `CHAT2_PUBLIC_WS_URL=wss://gafus.ru/connection/websocket` were set and read back. Fresh 64-character random secrets `CHAT2_INTERNAL_HMAC_SECRET`, `CHAT2_CENTRIFUGO_TOKEN_SECRET` and `CHAT2_CENTRIFUGO_API_KEY` were generated in memory, set in GitHub Environment `production`, and their **names only** read back. The same HMAC will be provisioned into all four existing Jobs by the first-release cutover.

**Chat2 Job bootstrap:** Safari `gafus-chat-photo` edit screen lacks the initial `CHAT2_S3_ACCESS_KEY_ID`, `CHAT2_S3_SECRET_ACCESS_KEY`, `CHAT2_INTERNAL_BASE_URL` and `CHAT2_INTERNAL_HMAC_SECRET` fields. Preflight now permits ONLY these four missing fields during the controlled first-release bootstrap; exact role, project, image, kind, S3 bucket/endpoint and workroot remain strict. Cutover adds the four fields from protected GitHub secrets; final `--verify` requires all fields and values. No existing Chat2 Job was modified during this access-setup task.

**Independent release QA remains a blocker:** `docs/qa/CURRENT_RELEASE_STATUS.md` still contains `READY=NO` for Chat2 and other providers. No attempt was made to forge QA success or bypass this independent veto; first production push must remain blocked until acceptance requirements are actually satisfied.
