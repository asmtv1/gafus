# GAFUS — Web-консультации на Voximplant

Статус: приложения Voximplant подготовлены; восемь production секретов подтверждены в GitHub Actions Environment production. Проводка CI/CD и Docker Compose готова локально, но в main ещё не запушена. Работающий GAFUS и БД не менялись.


## Актуальное решение о релизе — 2026-10-13

Владелец отказался от GitHub Actions staging и промежуточного тестового окружения. Деплой будет непосредственно в production при push в main. Создавать staging environment GitHub или загружать в него секреты НЕ требуется. Уже созданные ресурсы Voximplant staging не используются в GAFUS production; они не удалялись.

GitHub Actions Environment production: наличие всех восьми VOXIMPLANT_* секретов подтверждено командой gh secret list. Проводка из GitHub Secrets в серверный .env и явно в web/trainer-panel/api сделана локально; CI/CD ещё НЕ обновлён на GitHub. До push необходимо проверить SQL миграцию и восстановимый бэкап текущей production-БД, выделить релизные файлы из множества параллельных изменений. После деплоя провести реальный двухсторонний видеозвонок на тестовых учётных записях, проверить звук, камеру, повторный вход и контроль доступа. Пропуск staging означает риск ошибки первого реального звонка; откат контейнеров не отменяет уже применённую миграцию БД.

Сам push, production деплой и применение миграций в рамках обновления этой инструкции НЕ запускались.

## Изменения

- Бронирование больше не делает вызовы Телемоста; внешние ошибки видеосервиса не отменяют запись.
- Схема ConsultationBooking теряет старые telemost-поля. Исторические почтовые события переименовываются в CLIENT_BOOKING_VIDEO_FAILED без удаления писем из базы. Миграция подготовлена, но не применена.
- Пользовательский Web: /consultations/call/:bookingId; панель кинолога: /main-panel/consultations/call/:bookingId.
- Оба интерфейса используют VoxConsultationRoom и общий Core для авторизации и выдачи SDK challenge response.
- Только владелец брони и назначенный кинолог, только CONFIRMED, вход от -15 минут до начала и +60 минут после конца.
- Vox SDK учётная запись стабильна для каждого пользователя Гафус между консультациями, формируется сервером по HMAC; пароль, RSA private key и сервисный JWT не отправляются клиенту.
- При каждом вызове VoxEngine требуется дополнительное подписанное 90-секундное разрешение (HMAC, привязка к комнате и Vox SDK identity). Сценарий проверяет срок и реальное Vox FROM URI до call.answer; один известный room ID вход не открывает.
- Hono Mobile API содержит prepare/sign/admission для следующего этапа Mobile. Временно Mobile открывает защищённую Web-страницу.
- Unit/contract tests: Core, Hono API и смоделированный VoxEngine сценарий с проверкой отказов без права/подписи/времени.

## Конфигурация Voximplant до живого звонка

1. Создать отдельное приложение GAFUS (раздельные Vox приложения/секреты для staging и production).
2. Загрузить infra/voximplant/gafus-consultation-conference.js как VoxEngine scenario.
3. Назначить сценарию routing rule с выражением ^gafus_[a-f0-9]{30}$ и обязательно включить Video conference. НЕ использовать catch-all правило.
   В VoxEngine идентификатор реального аутентифицированного вызывающего должен находиться в AppEvents.CallAlerting.fromURI, а одноразовое доказательство в customData. При первом тестовом звонке после production-деплоя проверить эти поля. Если провайдер передал другой формат fromURI, сценарий отклонит соединение: не ослаблять эту проверку вслепую.
4. Создать service account с правами User manager для GetUsers и AddUser; получить account_id, key_id, private_key.
5. Настроить ОДИНАКОВЫЕ server-only environment secrets на Web, trainer-panel и API:
   VOXIMPLANT_ACCOUNT_ID = numeric Vox account ID
   VOXIMPLANT_APPLICATION_ID = numeric Vox application ID
   VOXIMPLANT_ACCOUNT_NAME = account portion of user@app.account.voximplant.com
   VOXIMPLANT_APPLICATION_NAME = application portion of same login
   VOXIMPLANT_KEY_ID = service-account JWT signing key ID
   VOXIMPLANT_PRIVATE_KEY_BASE64 = однострочный Base64 от RSA PEM для GitHub Actions; VOXIMPLANT_PRIVATE_KEY допускается локально
   VOXIMPLANT_CREDENTIAL_SECRET = independent random string >= 32 bytes, stable across servers
   VOXIMPLANT_ADMISSION_SECRET = OTHER independent random secret >= 32 bytes, same on all backend services
   NEVER prefix these variables with NEXT_PUBLIC_.
   In Voximplant application panel -> Secrets add GAFUS_VOX_ADMISSION_SECRET equal exactly to VOXIMPLANT_ADMISSION_SECRET. It must never appear in the JS scenario text.
6. Перед push в main проверить production SQL миграцию, наличие проверяемой резервной копии БД и путь восстановления; тестового окружения нет по решению владельца.
7. Сразу после production-деплоя проверить настоящий звонок между тестовым пользователем и назначенным тестовым кинологом на отдельных устройствах:
   camera/video/audio, mic mute, camera switch, tab leave/reenter, network interruption,
   role mismatch, too-early / expired slot, cancelled/completed booking, 2-participant limit.
8. Релиз Web, trainer-panel, API и mail-worker проводить согласованно, с бэкапом БД и контролем работоспособности до и после миграции.
   Do not ship Web alone against old DB schemas or missing provider secrets.

## Safety and billing limitations

- VoxEngine scenario admits at most two simultaneous calls, keeps room alive 60 seconds after all participants exit, terminates after 120 minutes (including an idle caller).
- One-time SDK challenge is valid for five minutes per Vox rules; the server sends only a hash response.
- VoxEngine admission token lasts 90 seconds, HMAC signature is verified in the conference script (Voximplant Crypto.hmac_sha256 + VoxEngine.getSecretValue), and is bound to the provider-authenticated FROM identity. Admission is re-authorized on every dialing attempt; cancellation or expiry stops new token issuance.
- Live confirmed calls are not forcibly hung up after the booking changes status; the scenario caps sessions at 120 minutes. Реальный формат caller FROM URI до первого production-звонка не подтверждён; есть риск отказа реального звонка.
- Client SDK session may outlive the server eligibility window if already connected.
- Реальную работу медиаканала и удаление Vox пользователей нельзя подтвердить без E2E. Пользователь отказался от staging; проверка будет в production.
- Local Web/trainer .env files currently have no VOXIMPLANT keys. Secret files for staging/production prepared outside repository; application secrets were verified against cloud. Do not claim real calls passed.
- A release requires the same admission secret on Web/trainer/API plus the VoxEngine application Secret and actual routing rule. Missing any secret is fail-closed, not fallback to Telemost.
- Smoke simulation: node --test infra/voximplant/gafus-consultation-conference.test.mjs. This does not replace the real two-party conference in production.

Пользователи Vox создаются с parent_accounting=true, чтобы минуты связи списывались с основного аккаунта Voximplant.

## Безопасность исторических данных

Prisma-миграция не удаляет строки ConsultationEmailLog: старое значение enum CLIENT_BOOKING_TELEMOST_FAILED преобразуется в нейтральное CLIENT_BOOKING_VIDEO_FAILED, остальные типы остаются без изменений. Старые ссылки и поля конференций удаляются, как разрешил владелец проекта. Перед production SQL нужно проверить резервное копирование БД, готовность восстановления и порядок единого релиза; staging пользователь не использует.


## Подтверждённые локальные проверки — 2026-10-13

- Production job 047918ad7f66fbed exit 0: Prisma schema validate PASS (synthetic DB URL, without DB connection or writes); worker types, Core build, API production build, Next Web build (108 pages), Next trainer panel build (28 pages) PASS.
- Regression job 3d5a0a41a5481bf6 exit 0: TypeScript Core/Web/trainer/API/Mobile PASS; Core 1390 tests PASS (93 DB-dependent skipped), Web 209, trainer 18, API 110.
- After historical Prisma email enum fix: Web TypeScript PASS; focused Core tests 27/27, API tests 12/12, VoxEngine mock tests 4/4; git diff --check PASS.
- Local production HTTP smoke without authentication: Web robots.txt and trainer login HTTP 200; Web consultations/my and consultations/call/fake-booking, trainer consultations and call/fake-booking correctly HTTP 307 redirect.
- Git HEAD 05c5b67f on main; 0 staged paths and about 433 dirty/untracked paths from concurrent work. Never add everything blindly.
- NO push, production deployment, database migration, or live Voximplant cloud changes.
- Production Secrets подтверждены в GitHub; их CI/CD-проброс пока не в main. Пользователь выбрал прямой production. До push нужно проверить итоговый SQL migration, готовность бэкапа и точно выделить Vox-изменения из параллельной рабочей директории. Реальный двухсторонний звонок будет проверен после релиза.
- Migration not applied to staging or production. Legacy mail rows are preserved by enum conversion, not DELETE.

## Voximplant automatic provisioning / credentials blocker (2026-10-13)

- Provisioner infra/voximplant/provision.mjs is ready for distinct gafus-staging and gafus-production apps. Namespaced scenario gafus_consultation_video, exact rule ^gafus_[a-f0-9]{30}$, required video_conference=true, app Secret GAFUS_VOX_ADMISSION_SECRET, restricted runtime key with User manager role.
- The local --init steps have been run for both environments; independent admission and SDK credential HMAC secrets were generated using CSPRNG outside Git at ~/Library/Application Support/GAFUS/voximplant/{staging,production}-secrets.json with mode 0600. Never log secret values or commit these local files.
- Before operator authorization, no Voximplant credentials were present; this entry is historical. The downloaded service-account JSON was discovered in the protected Vox config folder, permission hardened to 0600, and successfully used for real provider provisioning (see verified resource IDs below).
- Operator action COMPLETED: generated Owner/Admin Voximplant key is stored in a protected local file outside Git and has worked for all Management API operations. Never paste its private key into chat.
- Executed live --plan and --apply for staging and production; repeated --apply with zero new resources created. Production Vox app is NOT connected to live GAFUS deployment yet.
- On apply, this script creates or reuses a namespaced app, verifies scenario source from the provider, adds or checks the app admission secret, creates a restricted User manager key and verifies GetUsers, creates and re-reads video routing rule and outputs a protected environment-specific .env for Web/trainer/API. Existing mismatched scenario, secret, or rule fails closed and is not overwritten.
- Восемь production secrets уже переданы в GitHub Environment production. Проводка в серверный env подготовлена в CI/CD локально. Staging не требуется по решению владельца.

## Voximplant actual provider configuration — VERIFIED (2026-10-13)

- Staging: application gafus-staging ID **61610863**, scenario gafus_consultation_video ID **3715923**, rule gafus_consultation_video ID **9543300**.
- Production: application gafus-production ID **61610943**, scenario gafus_prod_video ID **3715928**, rule gafus_consultation_video ID **9543307**.
- Both video_conference flags TRUE; both rules bound to their specific scenarios. Rule source pattern ^gafus_[a-f0-9]{30}$ is normalized by the provider in GetRules to gafus_[a-f0-9]{30}; VoxEngine additionally strictly checks the entire destination with ^ and $.
- VoxEngine application secret GAFUS_VOX_ADMISSION_SECRET created independently in both applications; GetSecretValue verified exact match to each distinct server secret in constant time. No HMAC admission values logged.
- Restricted UserManager API signing keys created separately for each environment, saved to local 0600 files; both GetUsers calls succeeded with restricted JWT credentials.
- Local protected server-side env: ~/Library/Application Support/GAFUS/voximplant/staging.env and production.env. All required eight VOXIMPLANT_* variables present, both files mode 0600; no secrets stored in repository. One-time downloaded admin credentials also local mode 0600.
- Actual --apply rerun twice PASS without creating duplicate resources; source code verified by GetScenarios(with_script=true), rules by GetRules(with_scenarios=true), Secret by GetSecretValue.
- Provisioning quirks accounted for: Vox GetSecretValue returns result object (not result array) in current account; role name UserManager (not UI label User manager); GetRules normalizes away the regex anchors; scenario names must be unique across all account applications.
- Remaining prerequisites to release: inject correct distinct server-only env per target into deployment secret managers for Web/trainer-panel/Hono API, execute 2-user authorized browser E2E on staging and verify VoxEngine event.fromURI & customData, check staging Prisma migrations, and coordinate production deployment. No changes were made to current production GAFUS, databases, git index, main branch or live calls. Cloud Vox resources are provisioned only and generate no application traffic until enabled by GAFUS.

## GitHub Actions Secrets -> CI/CD -> Docker Compose (2026-10-13)

Existing deployment architecture verified: production GitHub Actions environment secrets are interpolated into a restricted ci-cd/docker/.env on the server by the production CI workflow and consumed by an explicit Docker Compose environment allowlist.

GAFUS's Vox configuration is now wired through ALL THREE deployment workflows:
- .github/workflows/ci-cd.yml (main -> deploy-production)
- .github/workflows/deploy-only.yml (manual deploy)
- .github/workflows/build-single-container.yml (manual rebuild/redeploy, including existing .env updates)
All workflows require non-empty GitHub Environment Secrets before rewriting the server env, and all deliver all eight names to Docker Compose. Services receiving the variables: web, trainer-panel and api. No NEXT_PUBLIC credentials. Obsolete Yandex Telemost dotenv propagation removed from these 3 workflows and all prod compose services.

GitHub Actions Environment production: 8 обязательных секретов (имена подтверждены GitHub):
- VOXIMPLANT_ACCOUNT_ID
- VOXIMPLANT_APPLICATION_ID
- VOXIMPLANT_ACCOUNT_NAME
- VOXIMPLANT_APPLICATION_NAME
- VOXIMPLANT_KEY_ID
- VOXIMPLANT_PRIVATE_KEY_BASE64
- VOXIMPLANT_CREDENTIAL_SECRET
- VOXIMPLANT_ADMISSION_SECRET

PRIVATE_KEY_BASE64 carries the RSA PEM key safely as ONE line through GitHub Actions SSH script, server dotenv and Docker Compose; core prefers this form while retaining local legacy VOXIMPLANT_PRIVATE_KEY support. All required Compose substitutions fail rather than silently use empty strings. The per-environment secret bundle is prepared outside Git on the Mac at the previously documented location. Scoped CLI transfer helper:
node infra/voximplant/github-secrets.mjs --environment production --plan
node infra/voximplant/github-secrets.mjs --environment production --apply
Production GitHub API connectivity was restored. The production upload returned success and all eight production VOXIMPLANT_* names were verified by listing GitHub Actions Environment secrets. The separate staging upload returned 404 because its GitHub environment does not exist; the owner explicitly declined staging. It is not needed for production. Secret values cannot be read back from GitHub and were not logged; confirmation is by names only. No main push, DB migration or GAFUS production deployment occurred.

Checks: Ruby YAML parse of all 3 workflow files and production compose PASS. Docker Compose config --quiet PASS with temporary synthetic placeholders for eight secrets; values never exposed. Node YAML wiring assertions: all 8 names present in each GitHub workflow and in web/trainer-panel/api compose environment list. Core TS typecheck PASS. Git diff --check PASS. Previous staging and production Voximplant provider provisioning remains confirmed and unaffected.

## Фактический Prisma migration QA — 2026-10-13

Проверен packages/prisma/migrations/20261013010000_consultation_voximplant/migration.sql. Добавлена явная транзакция BEGIN/COMMIT: в PostgreSQL она защищает от частичного применения при ошибке. Убрано неподтверждённое утверждение об отсутствии активных бронирований.

- Первая изолированная локальная PostgreSQL 14: восстановлена полная актуальная Prisma-схема, но с прежними полями Телемоста и прежним email enum. Посеяны 2 пользователя, кинолог, слот, 1 CONFIRMED бронирование со старыми URLs, 2 письма (старый Telemost failure и обычное confirmation). SQL применён. Booking и кинолог остались; оба письма сохранили id/status/attempts/lastError; исторический тип письма стал CLIENT_BOOKING_VIDEO_FAILED; 4 старых колонки и старый тип исчезли. Сравнение Prisma migrate diff после обновления: No difference detected.
- Вторая независимая локальная PostgreSQL: на таких же синтетических данных выполнен настоящий Prisma CLI migrate deploy через изолированную временную директорию миграций, где предыдущая схема помечена отдельной пустой baseline миграцией и единственным реальным SQL Vox. All migrations successfully applied. Prisma migrate status: Database schema is up to date. Данные сохранились, drift отсутствует. Повторный migrate deploy: No pending migrations to apply.
- Третья независимая локальная PostgreSQL: намеренно внедрён SQL сбой после DROP COLUMN внутри BEGIN/COMMIT. Применение закономерно завершилось неудачей, PostgreSQL полностью откатил изменения: старые колонки, enum и архивная запись остались. Atomic rollback PASS.
- Проверка выполнялась исключительно на синтетических локальных базах, НЕ в production; main, CI/CD и production PostgreSQL не менялись.

Важное ограничение перед прямым production rollout: нынешний GitHub Actions ci-cd.yml выполняет проверяемый pg_dump -Fc перед migrate deploy, но мигрирует БД ДО перезапуска старых Web/trainer/API контейнеров. Старый код может кратковременно ошибаться при чтении удалённых полей и старого enum. Откат Docker-образов не откатывает SQL. Для прямого релиза без staging нужны готовый DB backup и согласованное окно обновления серверных сервисов.

Другие незакоммиченные миграции (training_reminder_delivery и gallery_vet_preview_job) также потенциально попадут в release: Prisma migrate deploy исполняет ВСЕ pending миграции. Реальная история production _prisma_migrations и набор зависимых SQL объектов ещё не проверены; отдельная успешная проверка Vox не гарантирует успех всех других миграций.

## Production container cutover order — updated 2026-10-13

For the owner-approved direct-to-production release (no staging), the production GitHub Actions workflow now uses ci-cd/scripts/production-schema-cutover.sh with an explicit HTTPS Nginx maintenance flag. The lock ci-cd/nginx/conf.d/.release-maintenance is gitignored and served by a request-time check in ALL FIVE HTTPS virtual hosts; traffic receives HTTP 503 while the migration is in progress. HTTP ACME challenge routes are not gated.

**Exact sequence:**
1. CI finishes building and downloads every new image. Old containers remain live. Previous image tags, Git SHA and .env are stored for pre-migration recovery.
2. Ensure PostgreSQL/Redis are available. Validate/reload Nginx, create maintenance lock, and verify live local HTTPS 503 response. Pause briefly to drain requests.
3. Stop ALL old write-capable and web-facing containers: web, trainer-panel, admin-panel, api, worker and bull-board. Verify none is still running. Nginx remains up to serve HTTP 503.
4. After the last writer has stopped, take full PostgreSQL pg_dump -Fc into a protected release directory OUTSIDE the Git repository; require nonzero output and successful pg_restore --list. Do not run SQL without the backup.
5. Mark that schema mutation has started BEFORE running prisma migrate deploy. Require the maintenance gate and all old application containers stopped. Apply all pending Prisma migrations.
6. Only after Prisma succeeds, start new worker + API followed by new Web + trainer-panel + admin-panel + bull-board. Verify service health while maintenance remains on. Recreate Nginx with the HTTPS config and keep maintenance active. Renew existing certificates via webroot without ever replacing production HTTPS config with an HTTP-only template.
7. After backend and Nginx checks, remove maintenance lock, confirm public ping/auth/API endpoints and worker health.

**Rollback:** On failure before any Prisma migration has started, restore previously saved images, Git commit and .env, restart old apps while maintenance is enabled, verify health, then restore Nginx and reopen. Once the migration command has started, automatic image rollback is categorically unsafe (partially committed migrations or a newly removed Telemost column). Keep HTTP 503 and require controlled repair or a verified DB restoration. The downstream Cloud.ru CDN activation failure handler also checks the schema-migration marker and skips restoring incompatible old application images.

**Alternate paths:** legacy manual Deploy Only and Build Single Container workflows now refuse to deploy when any repo Prisma migration is not already applied on the server; standalone Prisma container refresh does NOT apply migrations. Single-container deployments also refuse a source-commit mismatch. All production deployment entry points serialize via a shared GitHub Actions concurrency group, so parallel manual operations cannot interrupt main.

**Checks performed locally, without deploying:** test ci-cd/scripts/production-schema-cutover.test.sh covers success order and forced Prisma failure retention. Local real Nginx smoke on disposable port verified responses 200, 503, 200 as maintenance file is created and removed. Ruby + Node YAML validation of all workflows passes; bash -n passes 44 shell scripts in main, 1 in Deploy Only and 11 in Build Single Container. Static assertions verify main cutover step order, old-image rollback barriers in main and CDN job, and all 8 Vox environment values remain available to Web/trainer/API. Actual production cutover and real two-party Vox call have NOT been executed.

Operator note: maintenance can cause a short planned period of HTTP 503. No zero-downtime claim is made. The database backup is logically checked by pg_restore --list, not restored in a full drill. Before pushing to main, ensure available production disk capacity and understand how to recover manually if schema migration fails.
