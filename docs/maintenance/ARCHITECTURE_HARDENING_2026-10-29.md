# GAFUS Refactor — архитектурная стабилизация, 29.10.2026

Скоуп: только локальный Refactor (ветка vite), без GAFUS Main, push, deployment, production PostgreSQL/S3/CDN/DNS. Состояние внешних providers не проверено. Release READY=NO.

## Исправлено в подготовленном Git index

1. Apple signing .p8: прекращено отслеживание Git через git rm --cached; файл сохранён локально, содержимое не раскрывалось. В .dockerignore исключены приватные ключи, credentials и дампы. В старой Git-истории ключ **пока остаётся**, ротация и изменение уже опубликованной истории требуют отдельной согласованной операции.
2. Адресно добавлены исходники Web, Hono API, Admin, Trainer, Mobile, Feed/Gallery, общие пакеты, документация и все локальные SQL-миграции Prisma. Старый Next apps/web исключён из будущего Git-снимка. Проверка scripts/refactor/check-release-index.mjs не пропускает пропущенные модули, миграции и ключи.
3. Не относящиеся к исходникам тестовые .stdout/.stderr/.exit исключены из Git. Индекс проверен git diff --cached --check.
4. Web теперь явно зависит от Core и допускает только два проверенных чистых entrypoint. scripts/check-web-core-boundary.mjs блокирует непроверенные серверные импорты.
5. CDN: 410 Gone распознаётся как одноразовый повод для авторизованного media-specific fallback, не открывает circuit breaker. 403/404 не дают fallback, backend заново проверяет доступ к объекту.
6. Web Chat 2.0 разбит на отдельный lazy chunk /chats; остальные экраны не загружают чаты при старте.
7. Main CI, Deploy Only и reusable deploy требуют GAFUS_REFACTOR_PRODUCTION_CUTOVER=approved. Cutover preflight запускается до любых облачных публикаций и требует реального QA READY=YES и Chat2 настроек.
8. Подготовлены выключенные по умолчанию runtime-контракты Chat2: optional profile chat2-centrifugo, конфиг без ключей, WebSocket proxy и Hono/Worker env. Только локальная статическая проверка, не настоящий production realtime.

## Локальные команды верификации

~~~sh
node scripts/refactor/check-release-index.mjs
node scripts/check-web-core-boundary.mjs
node scripts/check-workspace-graph.mjs
node scripts/refactor/check-chat2-prod-boundary.mjs
python3 ci-cd/scripts/refactor-verify-compose.py
pnpm --filter @gafus/core exec vitest run src/services/mediaDelivery/index.test.ts --config vitest.config.ts
pnpm --filter @gafus/web-vite typecheck
pnpm --filter @gafus/web-vite build
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/mobile typecheck
git diff --cached --check
~~~

Только действительно выполненные с exit code 0 проверки можно считать PASS. См. фактические результаты QA отдельно.

## Остаточные ограничения

- READY=NO до native iOS/Android authenticated offline video, полной матрицы Chrome/ролей, Cloud.ru Jobs/S3/CDN, SMTP/push, IAP/ЮКасса, Voximplant, Chat2 WebSocket/media и проверенного OCI rollback. Никаких production-записей ради тестов.
- Apple-ключ был отслеживаемым в прежних commits; исключение из индекса не решает историю/возможную компрометацию. Нужны план ротации и согласованное обновление CI Secret storage.
- Большие файлы paymentService.ts, Chat2Messenger.tsx, Mobile Pets и основной Web JS ~1.4 MB требуют отдельных функциональных регрессий при дальнейшем дроблении. Не переносить критическую бизнес-логику без тестов.
- Настройки внешнего websocket ingress, Github Environment, реальные секреты, запуск Compose-профиля и его доступность ещё не подтверждены. Конфигурация не означает реальный работающий broker.

## API unit/real-PG test separation

Full default API suite on this Refactor snapshot completed 2427 PASS, 254 SKIP, 0 FAIL (2026-10-29). The real-PG tests were previously accidentally launched without DATABASE_URL, resulting in 24 import suite failures and 3 standalone Prisma errors. The standard vitest.config.ts now excludes explicit real-pg/realpg/real-prisma-pg/real-work integration cases instead of attempting unknown DBs.

A dedicated fail-closed apps/api/vitest.realpg.config.ts and pnpm --filter @gafus/api test:realpg:isolated requires GAFUS_API_REALPG_ISOLATED=1, a localhost-only nonstandard-port database named gafus_refactor_* or ag1_*, a credentialed URL and each test's own role/DB guards. This **does not** mark real-PG integration tests PASS; their separate runtime/fixture environment must be provisioned and tested safely. Default API suite now runs source-only contracts independently.

Full Web/Admin/Trainer/Mobile test commands passed in the same local run before API; native hardware/remote-provider E2E are still outstanding.

## Dependency security audit — 29 October 2026

Initial read-only pnpm audit reported 7 critical and 70 high dependency vulnerability instances. Conservative compatible fixes were pinned in root pnpm overrides and pnpm-lock.yaml, including Vitest, Hono, Vite, proxy-addr, shell-quote, PostCSS, ws, undici, protobufjs, dompurify, js-yaml and smaller patch updates. The final lockfile audit reports **0 critical, 16 high**. This means high-risk advisories have NOT all been remediated.

Remaining high advisory modules: basic-ftp, decode-uri-component, extract-zip, linkify-it, markdown-it, node-forge, nodemailer, sharp, zod. Some require incompatible major upgrades (Zod 3 to 4, Nodemailer 7 to 8+, Markdown-It/Linkify-It) or media-native validation (Sharp/libvips); others currently have no fixed release in the audit (node-forge, extract-zip). Do not blanket-upgrade or mute the audit: handle them in isolated compatibility/QA work. pnpm audit --audit-level high intentionally remains nonzero, blocking production CI.

Dependency audit artifacts were saved only to local temporary paths. No private credentials were read or committed, and no production deployment occurred.


## Scoped follow-up — security remediation and owner exclusion

The owner specifically excludes Apple-key rotation and old Git-history rewriting from this work. Neither was performed; do not add those tasks to the active action list without a new instruction. Existing historical text above is retained for accuracy, not an instruction to perform these operations.

After this release audit, same-major/compatible packages were upgraded: Sharp 0.35.5 in Feed Cloud, Gallery Cloud (with matching linux/amd64 @img binaries), and CDN-upload; Nodemailer 10.0.6+ after SMTP contract tests; Markdown-It 14.3.3 with mobile nested override, node-forge 1.4.2, decode-uri-component 0.5.1. Removed unused prisma-erd-generator from Prisma (schema only generates Prisma Client). The dependency audit decreased to **0 critical / 1 high**. Remaining Zod 3 validation DoS advisory requires a coordinated cross-workspace Zod 4 migration, not a one-package forced override. A trial migration produced 33 TypeScript incompatibilities involving Core schemas and Hono validation; the 0.9.1 validator trial exceeded local compiler resources. The safe version was restored and API typecheck passed. No audit rule was silenced.

Current live checks: Beget gallery read-only provider PASS, cache 86400; Cloud.ru sandbox access BLOCKED due absent sandbox credential file; PostgreSQL isolated real-PG acceptance BLOCKED by insufficient exact role credentials; native iOS/Android device enumeration timed out. Local seven-image Docker build is separate from any registry/deploy operation; record exact results before claiming PASS.

## Follow-up: Nodemailer 10 worker fix and local PostgreSQL guard

The linux/amd64 Worker and API Docker builds initially failed due to Nodemailer 10 changing the `Attachment.contentDisposition` type to an arbitrary string, incompatible with strict encrypted outbox types. The serializer now accepts only the stable `attachment` and `inline` dispositions and rejects unexpected values **before** attempting any database write. Local Mailer build and targeted outbox tests pass; Docker builds must be rerun to independently verify.

The new `scripts/qa/refactor-local-pg-readonly-smoke.sh` uses only a specific Refactor-local Unix socket, read-only Postgres session/transaction, known scratch database and role, and verifies migration ledger, data directory and schema. It never connects to a remote server or writes test data. It is deliberately weaker than full isolated real-PG tests with write fixtures.

A separate disposable Centrifugo handshake harness is in `scripts/qa/chat2-centrifugo-local-handshake.sh`, scoped to Docker-only local network, ephemeral secrets and WebSocket Origin validation; no production services or user chat data are involved.

## Four Feed Media V2 job resource contract

The pure (non-mutating) `infra/cloudru/media-manifests.mjs` previously specified outdated CPU/RAM for the Feed pool (photo 0.5 vCPU / 1 GiB; video 1 vCPU / 4 GiB). It now encodes the **explicitly approved** resource contract for four **existing** Cloud.ru Container Jobs only:

- `gafus-feed-photo`, `gafus-feed-photo-2`: 1 vCPU / 2048 MiB each.
- `gafus-feed-video`, `gafus-feed-video-2`: 2 vCPU / 8192 MiB each.

Separate Gallery/Origin resource defaults are untouched. `node infra/cloudru/media-manifests.test.mjs` and `node infra/cloudru/origin-delivery-gate.test.mjs` PASS. No Cloud.ru API call, Job update, Registry publication or production execution was performed in this change.

## Seven-image release build and Chat2 network gate

After the Nodemailer 10 compatibility fix, the exact local production Dockerfiles for Web, Trainer, Admin, Prisma, Bull Board, Worker and API each built a linux/amd64 image (7/7, no registry push). `scripts/qa/refactor-release-images-offline-smoke.sh` verified each created image, target architecture and startup files in `--network none` containers, all PASS.

`scripts/qa/chat2-centrifugo-local-handshake.sh` creates a disposable Docker **internal** network and ephemeral Redis+Centrifugo, generates throwaway secrets only in process environment, and verifies accepted Origin -> 101 and denied Origin -> 403 via a Node test client in that same network. It cleans up every test container and its network. First two iterations incorrectly assumed /health was available and host publishing worked on an internal network; the final actual WebSocket handshake passed with exit code 0.

Five Refactor Feed/Gallery Dockerfiles still pinned Sharp 0.34.3 after package manifest updates; all eight Docker install occurrences now explicitly pin 0.35.5. The pure check script `scripts/qa/check-media-docker-sharp-version.mjs` protects these Dockerfiles and the three package manifest pins in both Vite and Main CI.

## Cloud media worker+origin Linux image validation — 4/4

The Cloud media build workflow uses four Dockerfiles (`feed`/`gallery` x `worker`/`origin`). All four exact local roles now build successfully for linux/amd64. Gallery Worker was missing `@gafus/cdn-upload/isolated-nonprod-s3` and read-only CDN sources/aliases; Feed Origin also lacked `@gafus/feed-cloud` and both CDN helpers. Their prod and staging origin Dockerfiles now copy/resolve those required source entries. The CI source guard `scripts/qa/check-media-docker-sharp-version.mjs` now checks both media Docker alias contracts and the exact Sharp 0.35.5 install pins.

Executed `scripts/qa/refactor-cloud-media-images-offline-smoke.sh`, exit 0, four PASS. It runs each Linux image without a network, checks worker/origin Node bootstraps, verifies Sharp 0.35.5 native WebP (Feed) and AVIF (Gallery), and FFmpeg availability in Feed Worker. No Cloud.ru Registry push, API Job updates, S3 writes, production DB operations, or service migrations.

Postbuild, iOS simulator and Android ADB enumeration both returned **zero connected devices**; true native offline QA still requires provisioned test devices/simulators. Cloud.ru remote registry digest and real Job observability remain blocked by absent dedicated provider control-plane credentials, and are not claimed PASS.

## 30 October: App lazy-route regression and achievement application boundary

Local full Web tests showed multiple stale 20–35 ms synthetic `act` probes that predate React.lazy splitting. Test helpers now selectively preload the modules used in each scenario and allow multiple asynchronous React commits, without disabling code splitting in production. Account and public-profile tests separately handle asynchronously loaded owner screens; CDN denied fallback tests await both request hops without weakening 401/403/404 fail-closed semantics. User-facing API and permission semantics are preserved.

`apps/api/src/modules/achievements/application/read-achievements.ts` no longer imports provider types directly from the server-only achievements package; its generic pure port contracts infer actual provider result types from the composition. The architecture checker pins the exact `@gafus/achievements-server` package as the only allowed achievements runtime provider in that composition. API typecheck and full tests PASS.

`packages/types` tsup DTS build required a 6 GiB Node heap in this local low-memory session; the generated dist was restored and follow-up Web/API typechecks PASS. The agreed media video duration is 120 seconds, reflected in the types contract test. The pure achievements streak calculation now copies Date inputs rather than mutating them. Added automated tests in its previously test-empty server package.

Only Refactor source, pure local tests, Git index and Refactor documentation were touched. Cloud.ru Jobs, registry, production data, Apple key rotation and Git history were untouched.

## 30 October: Public Types declaration integrity and five Web route tests

A recent `@gafus/types` build printed JS success and TS declaration success while silently omitting the new username-availability contract from the bundled `dist/index.d.ts`. Replaced tsup declaration bundling with a standard `tsc --emitDeclarationOnly` step after JS bundling. `scripts/qa/check-types-artifact-exports.mjs` asserts contract exports in JS, the barrel declaration and the specific contract declaration. Wired the guard into the Vite and production CI release paths. Local package build plus Web/API typechecks PASS.

A full Web smoke had 5 failing suites on async lazy-loaded routes, despite 281 PASS files: both password-recovery paths, public/guest route redirect, owner reviews, and G03 username. Added route-scoped lazy module preloading or bounded `act` settlement to the fixtures. **Targeted 5/5 suites PASS**. The subsequent full rerun identified two more delayed lazy screens (GalleryPets guest landing and Guides owner profile); both were corrected and independently retested. The next **single completed full Web test run** returned exit 0: **286 passed, 1 skipped, 0 failed files**. Web typecheck/lint PASS; actual user-facing lazy routes remain demand-loaded.

The security audit still reports Zod3 high advisory (patched only in Zod >=4.6.6). A cross-workspace Zod major upgrade is not part of this narrow regression repair; the production gate remains READY=NO until explicitly resolved and tested.

## 30 October: Isolate Mobile/Hono in-process test harnesses from shipped source

The strict `check-mobile-core-boundary.mjs` found four actual in-process Hono contract tests importing server-only Core (`@gafus/core/services/pets`, `petRead`, and `auth`) under Expo `apps/mobile/src`. Instead of whitelisting these unsafe entry points, relocated the full four test files to `apps/mobile/tests/server-integration`, preserving their API app imports, synthetic mocks, and relative Mobile helper contracts via exact aliases. The Mobile Vitest config now explicitly includes this test-only folder. Mobile production code and the strict boundary detector were not relaxed.

Validation: Mobile core boundary PASS (629 source modules), Mobile typecheck PASS, relocated server integration 4/4 test files PASS. The tests stub Prisma/network and do not perform production reads/writes.

## 30 October: Calendar booking test across Moscow month boundaries

A Mobile full regression revealed one V89 consultation test that expected the next Moscow calendar day in the *same currently displayed month*. When 31 October is followed by 1 November, the real UI correctly needs a month-forward navigation. The test now detects differing `YYYY-MM`, navigates by the existing month control, waits for the second FREE day and confirms the original UTC slot and idempotent booking behavior. App calendar/ACL code was not modified. Targeted V89 tests and Mobile TS typecheck PASS; the next independent full Mobile regression finished **exit 0: 285 passed, 1 skipped, 0 failed files**.
