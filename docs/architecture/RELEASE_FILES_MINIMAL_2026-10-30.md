# Минимальный точный Git release-file inventory — GAFUS Refactor, 30.10.2026

**Статус: preparation/read-only inventory, LOCAL postsubscription `linux/arm64` 10/50 + independent Owner1 PASS, NO STAGING, RELEASE READY=NO.** Только допустимый `/Users/asmtv1/Desktop/gafus-refactor`. Это **минимальный проверяемый список файлов для включения при переносе подтверждённых восьми архитектурных направлений и нового Core P1/OCI 10/50**, но не заявка на полноту всех экранов/API или полноту текущего огромного worktree. `index != HEAD`: наличие в index само по себе не означает release-коммит. Перед реальным выпуском требуется отдельная сверка всех зависимых изменённых файлов и CI. Никакой файл этим отчётом не индексируется.

## Фактическое состояние Git

- Все **10 новых пакетов** (папки ниже) имеют `package.json` и исходники на диске, их **10 manifests отсутствуют в Git index и HEAD**; два уже индексированных файла `achievements-server/src/calculateStreaks{,.test}.ts` — исключение из правила об отсутствии любых исходников; локальные Docker-image 10/50 включают их через незакоммиченный source snapshot. Включать **пакет целиком: manifest, `src`, `tsconfig.json`, существующий `vitest.config.ts`**, не только `package.json`. Не добавлять `dist`, `node_modules`, `.turbo`, build cache.
- **`docs/current`: ровно 7 документов**, все уже в Git index, **0/7 в HEAD**; их нельзя терять при release-commit.
- Docker checker `ci-cd/docker/check-runtime-package-exports.mjs`, четыре `scripts/qa/agent2-oci-*` и новый `subscription-read-server` были untracked на момент снимка. Остальные ключевые источники имеют смешанный staged+unstaged статус — **index содержимое нельзя считать равным принятому рабочему дереву**.
- Локально принятые новые Docker-образы `linux/arm64` имеют новые теги; **это не remote registry SHA digest** и не `linux/amd64` production-ready artifact. Зафиксированные старые образы `20261030` остаются только графом 9 пакетов/49 экспортов.

## Конкретные пути для review/include (точные относительные имена)

Легенда `W/I/H`: `W` — файл существует в worktree, `I` — отслеживается в Git index, `H` — есть в HEAD. Отсутствие `I`/`H` — явная причина для проверки включения при будущей staging-процедуре. `??`, `AM`, `MM` и т. п. в последней колонке — состояние **на момент создания**, не инструкция автоматически его менять.

### A. Новые 10 пакетов: полный исходный модуль, manifest и build config (обязательная новая graph closure)

**81 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | — | — | `packages/core-client/package.json` | `??` |
| ✓ | — | — | `packages/core-client/src/auth/vk-auth-constants.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/client-smoke.test.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/feed/publication-client.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/index.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/media-delivery/index.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/media-delivery/remote-status.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/types/petrovich.d.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/age/getAge.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/age/getAgeWithMonths.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/age/index.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/date.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/index.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/personalization.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/pet.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/pluralize.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/social.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/training.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/transliterate.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/utils/video.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/validation/auth-register.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/validation/email-domain-suggestion.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/validation/pet.ts` | `??` |
| ✓ | — | — | `packages/core-client/src/validation/register-email-domain.ts` | `??` |
| ✓ | — | — | `packages/core-client/tsconfig.json` | `??` |
| ✓ | — | — | `packages/core-client/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/achievements-server/package.json` | `??` |
| ✓ | — | — | `packages/achievements-server/src/calculateAchievements.ts` | `??` |
| ✓ | ✓ | — | `packages/achievements-server/src/calculateStreaks.test.ts` | `A ` |
| ✓ | ✓ | — | `packages/achievements-server/src/calculateStreaks.ts` | `A ` |
| ✓ | — | — | `packages/achievements-server/src/datesService.ts` | `??` |
| ✓ | — | — | `packages/achievements-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/achievements-server/src/statsService.ts` | `??` |
| ✓ | — | — | `packages/achievements-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/achievements-server/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/consent-server/package.json` | `??` |
| ✓ | — | — | `packages/consent-server/src/consentService.ts` | `??` |
| ✓ | — | — | `packages/consent-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/consent-server/src/types.ts` | `??` |
| ✓ | — | — | `packages/consent-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/consent-server/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/package.json` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/src/mobileIntroService.ts` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/src/types.ts` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/mobile-intro-server/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/notifications-server/package.json` | `??` |
| ✓ | — | — | `packages/notifications-server/src/immediatePushService.ts` | `??` |
| ✓ | — | — | `packages/notifications-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/notifications-server/src/pushWorkerService.ts` | `??` |
| ✓ | — | — | `packages/notifications-server/src/stepNotificationService.ts` | `??` |
| ✓ | — | — | `packages/notifications-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/feature-flags-server/package.json` | `??` |
| ✓ | — | — | `packages/feature-flags-server/src/appFeatureFlagsService.ts` | `??` |
| ✓ | — | — | `packages/feature-flags-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/feature-flags-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/admin-rewarded-ads-server/package.json` | `??` |
| ✓ | — | — | `packages/admin-rewarded-ads-server/src/adminRewardedAdsService.ts` | `??` |
| ✓ | — | — | `packages/admin-rewarded-ads-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/admin-rewarded-ads-server/src/types.ts` | `??` |
| ✓ | — | — | `packages/admin-rewarded-ads-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/tracking-server/package.json` | `??` |
| ✓ | — | — | `packages/tracking-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/tracking-server/src/trackingService.test.ts` | `??` |
| ✓ | — | — | `packages/tracking-server/src/trackingService.ts` | `??` |
| ✓ | — | — | `packages/tracking-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/tracking-server/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/package.json` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/src/adminReengagementService.test.ts` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/src/adminReengagementService.ts` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/src/types.ts` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/admin-reengagement-server/vitest.config.ts` | `??` |
| ✓ | — | — | `packages/subscription-read-server/package.json` | `??` |
| ✓ | — | — | `packages/subscription-read-server/src/accessService.test.ts` | `??` |
| ✓ | — | — | `packages/subscription-read-server/src/accessService.ts` | `??` |
| ✓ | — | — | `packages/subscription-read-server/src/index.ts` | `??` |
| ✓ | — | — | `packages/subscription-read-server/tsconfig.json` | `??` |
| ✓ | — | — | `packages/subscription-read-server/vitest.config.ts` | `??` |

### B. P1 перенос read-model: прежний facade, shared type DTO, связанные manifest/config и targeted regression

**14 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | ✓ | ✓ | `packages/core/src/services/appSubscription/accessService.ts` | `MM` |
| ✓ | ✓ | ✓ | `packages/core/src/services/appSubscription/types.ts` | ` M` |
| ✓ | ✓ | ✓ | `packages/core/src/services/appSubscription/plans.ts` | ` M` |
| ✓ | ✓ | ✓ | `packages/core/src/services/appSubscription/index.ts` | `M ` |
| ✓ | — | — | `packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts` | `??` |
| ✓ | — | — | `packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts` | `??` |
| ✓ | — | — | `packages/types/src/contracts/appSubscriptionRead.ts` | `??` |
| ✓ | ✓ | ✓ | `packages/types/src/index.ts` | `MM` |
| ✓ | ✓ | ✓ | `packages/types/package.json` | `MM` |
| ✓ | ✓ | ✓ | `packages/types/tsup.config.ts` | `MM` |
| ✓ | — | — | `packages/types/tsconfig.build.json` | `??` |
| ✓ | — | — | `packages/types/tests/declarations.nodenext.test.ts` | `??` |
| ✓ | ✓ | ✓ | `packages/core/package.json` | `MM` |
| ✓ | ✓ | ✓ | `pnpm-lock.yaml` | `MM` |

### C. API/Worker OCI build, exact 9/49→10/50 checker, offline runtime QA, CI and safety guards

**15 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | ✓ | ✓ | `ci-cd/docker/Dockerfile-worker-optimized` | `MM` |
| ✓ | — | — | `ci-cd/docker/Dockerfile-worker-optimized.dockerignore` | `??` |
| ✓ | ✓ | ✓ | `ci-cd/docker/Dockerfile-api-optimized` | `MM` |
| ✓ | ✓ | — | `ci-cd/docker/Dockerfile-api-optimized.dockerignore` | `AM` |
| ✓ | — | — | `ci-cd/docker/check-runtime-package-exports.mjs` | `??` |
| ✓ | — | — | `scripts/refactor/runtime-checker.pnpm-layout.test.mjs` | `??` |
| ✓ | — | — | `scripts/refactor/docker-package-build-boundary.test.mjs` | `??` |
| ✓ | — | — | `scripts/refactor/ci-core-boundary-gate.test.mjs` | `??` |
| ✓ | ✓ | — | `scripts/refactor/check-release-index.mjs` | `A ` |
| ✓ | ✓ | — | `scripts/refactor/check-chat2-prod-boundary.mjs` | `AM` |
| ✓ | — | — | `scripts/qa/agent2-oci-entrypoints-isolated.sh` | `??` |
| ✓ | — | — | `scripts/qa/agent2-oci-message-fixture.mjs` | `??` |
| ✓ | — | — | `scripts/qa/agent2-oci-message-flow.cjs` | `??` |
| ✓ | — | — | `scripts/qa/agent2-oci-runtime-proxy.cjs` | `??` |
| ✓ | ✓ | ✓ | `.github/workflows/ci-cd.yml` | `MM` |

### D. Web P2: строго MomentSummary lazy, Suspense/error и три тестовых сценария

**4 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | ✓ | — | `apps/web-vite/src/features/moments/MomentSummary.tsx` | `AM` |
| ✓ | ✓ | — | `apps/web-vite/src/features/moments/MomentSummary.pollInline.test.tsx` | `AM` |
| ✓ | — | — | `apps/web-vite/src/features/moments/MomentSummary.lazyPoll.test.tsx` | `??` |
| ✓ | — | — | `apps/web-vite/src/features/moments/MomentSummary.lazyPoll.error.test.tsx` | `??` |

### E. Адресные acceptance anchors восьми направлений (НЕ полный UI/API/Chat2 source closure)

**26 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | — | — | `scripts/check-core-client-boundary.mjs` | `??` |
| ✓ | — | — | `scripts/check-core-server-boundary.mjs` | `??` |
| ✓ | ✓ | — | `scripts/check-web-core-boundary.mjs` | `AM` |
| ✓ | ✓ | ✓ | `scripts/check-workspace-graph.mjs` | `not tracked` |
| ✓ | ✓ | ✓ | `apps/mobile/src/shared/components/media/CdnImage.tsx` | `MM` |
| ✓ | ✓ | ✓ | `apps/mobile/src/shared/components/media/CdnImage.test.tsx` | `MM` |
| ✓ | ✓ | — | `apps/api/src/chat2-v2-cloud-core.ts` | `A ` |
| ✓ | ✓ | — | `apps/api/src/modules/chat2/service.ts` | `A ` |
| ✓ | ✓ | — | `apps/api/src/modules/chat2/realtime.ts` | `A ` |
| ✓ | — | — | `apps/api/src/lib/chat2-legacy-retirement.ts` | `??` |
| ✓ | ✓ | — | `packages/worker/src/chat2-outbox-worker.ts` | `AM` |
| ✓ | — | — | `packages/worker/src/chat2-readiness.ts` | `??` |
| ✓ | ✓ | ✓ | `packages/worker/src/health-server.ts` | ` M` |
| ✓ | ✓ | ✓ | `apps/api/src/routes/v1/auth.ts` | `MM` |
| ✓ | ✓ | ✓ | `apps/api/src/routes/v1/pets.ts` | `MM` |
| ✓ | — | — | `apps/api/src/routes/v1/username-availability.contract.test.ts` | `??` |
| ✓ | — | — | `apps/api/src/routes/v1/pet-weight-read.contract.test.ts` | `??` |
| ✓ | ✓ | — | `packages/types/src/contracts/usernameAvailability.ts` | `AM` |
| ✓ | ✓ | ✓ | `packages/types/src/data/pet.ts` | `MM` |
| ✓ | ✓ | — | `apps/mobile/src/features/pets/petWeightRead.ts` | `AM` |
| ✓ | ✓ | — | `apps/mobile/src/shared/lib/api/pets.g1-weight-get.v98-guard.test.ts` | `AM` |
| ✓ | ✓ | ✓ | `apps/mobile/src/features/training/components/AccordionStep.tsx` | `MM` |
| ✓ | — | — | `apps/mobile/src/features/training/components/AccordionStep.presentation.ts` | `??` |
| ✓ | ✓ | — | `apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx` | `AM` |
| ✓ | — | — | `apps/web-vite/src/features/pets/PetVetVisitDetails.tsx` | `??` |
| ✓ | — | — | `apps/web-vite/src/features/pets/petVetVisitDomain.ts` | `??` |

### F. Живые docs/current: ровно семь документов, все присутствуют в index, ноль в HEAD

**7 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | ✓ | — | `docs/current/ARCHITECTURE.md` | `AM` |
| ✓ | ✓ | — | `docs/current/FUNCTIONAL_DOMAINS.md` | `A ` |
| ✓ | ✓ | — | `docs/current/LOCAL_AND_DATA.md` | `AM` |
| ✓ | ✓ | — | `docs/current/MEDIA.md` | `A ` |
| ✓ | ✓ | — | `docs/current/MOBILE_STARTUP_SPLASH.md` | `A ` |
| ✓ | ✓ | — | `docs/current/QA_AND_RELEASE.md` | `AM` |
| ✓ | ✓ | — | `docs/current/WEB_LOADING.md` | `AM` |

### G. Минимальные acceptance evidence/architecture/performance документы

**16 точных путей.**

| W | I | H | File | Git |
|---|---|---|---|---|
| ✓ | — | — | `docs/architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md` | `??` |
| new doc | — | — | `docs/architecture/RELEASE_FILES_MINIMAL_2026-10-30.md` | `not tracked` |
| ✓ | — | — | `docs/architecture/NIGHT_AGENT_1_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/architecture/NIGHT_AGENT_2_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/architecture/NIGHT_AGENT_3_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/architecture/CORE_CLIENT_SERVER_BOUNDARY.md` | `??` |
| ✓ | — | — | `docs/architecture/CORE_SUBSCRIPTIONS_EXTRACTION_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/architecture/CHAT2_STAGED_CUTOVER_RUNBOOK_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/architecture/CDN_ISOLATED_ACTOR_ACCESS_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_LAZY_MOMENT_POLL_2026-10-30-summary.json` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_LAZY_MOMENT_POLL_2026-10-30.md` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-lazyMomentPoll-after.json` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-summary.json` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-v2.json` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30.json` | `??` |
| ✓ | — | — | `docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30.md` | `??` |

## Stop-gates и границы списка

1. **Source & release inclusion:** координатор вручную проверяет оба `git diff --cached` и `git diff` плюс untracked для этих путей, 10 новых пакетных графов, `pnpm-lock.yaml` и package manifests, точный checker 10/50 при сохранённом legacy9/49, Docker contexts, TypeScript declaration/NodeNext, release-index gate. Не выполнять blanket `git add .` и не считать PR release-ready на основании локальной сборки.
2. **Восемь пунктов не покрывают весь репозиторий:** в каталогах API/Core/Mobile/Web/Chat2/Media остались другие изменённые файлы и неразобранные feature-сценарии. Секция E показывает **точечные якорные файлы** проверок, а не транзитивное перечисление всех исходников Chat2, 52k+ Core или всех API routes. Не удалять и не исключать другие файлы автоматически. Требуется отдельный closure review перед пушем.
3. **Environment gates:** local `linux/arm64` API/Worker + isolated PG/Redis/Centrifugo/WS synthetic E2E **не заменяет** `linux/amd64` release build, remote CI, настоящие Android/iOS native/offline, public TLS/WSS/DNS, реальные Cloud CDN/S3 provider ACL/TTL или production deploy. No new endpoint, production writes or source edit.
4. **Local final acceptance now independently PASS:** Owner2 NEW Worker/API 10/50 builds `4a08b2a3...` / `7a2600d0...`, two real local `linux/arm64` image IDs recorded in [8-point matrix](./ARCHITECTURE_ACCEPTANCE_2026-10-30.md), isolated true-CMD/message E2E job `7575068d5e6128f4a277589028b4183c6261c4afd1a602d5` **exited0**, Owner1 independent Worker/ API image proof jobs `b3753bca224290b1d901caff04c29e93c97550538381e254` and `14796b293a085935623861f7f52539ec42412dab5a9b8f52` **both exited0**. Owner1 Package22 FINAL explicitly accepts **POSTCHANGE LOCAL ARM64 IMAGE+RUNTIME**, including signed same-pair message WS/ACL/idempotence, 410→503 fail-closed. **This is local only**, not remote CI, native/public/production release.

**Итог:** candidate inclusion file count **163** unique explicit paths: A. Новые 10 пакетов: полный исходный модуль, manifest и build config (обязательная новая graph closure)=81, B. P1 перенос read-model: прежний facade, shared type DTO, связанные manifest/config и targeted regression=14, C. API/Worker OCI build, exact 9/49→10/50 checker, offline runtime QA, CI and safety guards=15, D. Web P2: строго MomentSummary lazy, Suspense/error и три тестовых сценария=4, E. Адресные acceptance anchors восьми направлений (НЕ полный UI/API/Chat2 source closure)=26, F. Живые docs/current: ровно семь документов, все присутствуют в index, ноль в HEAD=7, G. Минимальные acceptance evidence/architecture/performance документы=16. `docs/current` **7 index/0 HEAD**, 10 package modules **81 files, manifests 0 index/0 HEAD; 2 existing index source files**. Only documentation authored.

## Post-AMD64 release reconciliation: actual Web dependency closure, not 163-only

**Текущий минимум конкретных релизных путей: 524**, а не исторические 163. 163 файла исходного списка остаются выше без переписывания; новый анализ фактически собранного браузерного графа и новых source/guard/test изменений добавляет **361 уникальный путь**. Worktree **524/524 файлов присутствуют**; Git index **не содержит 120 из 524**, и текущий HEAD **не содержит 501 из 524**. Это минимальная доказанная часть для данного архитектурного пакета, **не весь изменённый репозиторий**. Не выполнять автоматический `git add .`.

**Сборка Web после browser-safe исправлений:** production-mode Vite build **exit0**, `98 JS`, `96 source maps` в закрытом `.local-pg-scratch/agent3-release-20261030/web-dist-final`, включено **350 реальных source файлов** (`dist/` исключён). Ни одного `packages/core/src`, `packages/prisma`, API, Worker или выделенного серверного пакета в production sourcemaps нет; проверяемые литералы серверных секретов, Node-only и Prisma в скомпилированном JS не найдены. **Два Web source действительно отсутствуют в Git index**: `apps/web-vite/src/features/pets/PetVetVisitDetails.tsx`, `apps/web-vite/src/features/pets/petVetVisitDomain.ts`; 349 реальных Web source отсутствуют в HEAD. Generated `dist/*.js`, `dist/*.d.ts`, sourcemaps **в Git не добавлять**.

**Минимальные browser source исправления:** 92 относительных workspace import paths в 76 Web файлах перешли к задекларированным public package entrypoints; 2 remaining `import type` из `packages/core/src/services/appSubscription/types` не попадают в runtime. Новый direct `@gafus/ui-components` в Web manifest+pnpm lock; browser-only `./cookie-consent` и lazy `./voximplant-room` в `packages/ui-components/package.json`; type-safe re-export `publicCourseCoverUrl` в `packages/types/src/index.ts`. Guard `scripts/refactor/verify_vite_browser_boundary.mjs` проверяет декларацию зависимости и разрешённый exported path; неподтверждённые workspace, server/Node, обычный PWA остаются **fail-closed**, только существующий push-only SW учитывается отдельно; guard **exit0**, fixture tests **16/16 PASS**. Два test-only prewarm исправления cold React.lazy module availability в `PublicHomeRoute.mounted.test.tsx` и `PartnerRoute.mounted.test.tsx` не влияют на runtime.

**Два локальных production-platform образа на проверенном server snapshot** (это локальные Docker `.Id`, **не** Cloud.ru Registry digest): Worker `gafus-refactor-release-check-worker:20261030-amd64` `sha256:cc768f653d214a250075338692d716c25d81def36a7234f347d417012750252b`, user `worker`, CMD `node dist/worker/src/index.js`; API `gafus-refactor-release-check-api:20261030-amd64` `sha256:52ede2e09ec6fc2804b698a49c82a3678541500805f6ffb5e69d20a71651e7a8`, user `hono`, CMD `node dist/index.js`. Оба `linux/amd64`, sequential Docker builds **exit0**, strict old9/49 + new subscription1/1 = 10/50 JS+.d.ts checker **exit0** на реально сохранённых образах, Node entrypoint syntax **exit0**. Combined actual default CMD/temporary isolated PG+Redis+Centrifugo/JWT/private ACL/API→outbox→Worker→WS→GET/idempotence/healthy410→stoppedWorker503 **exit0** job `bb7097840ba9b31276388ac207d6fbb65c4771c9de97bcff`; cleanup 0 own containers/networks. Никаких production ключей, миграций или cloud действий.

**Source-fingerprint caveat:** API/Worker Docker source contexts зафиксированы в момент старта build; последующие исключительно browser-oriented Web import, `packages/types` public re-export, UI manifest/lock changes проверены отдельным Web build/typecheck. Прежде чем публиковать release, нужен новый image build из **точно зафиксированного HEAD** в remote CI, его SHA/digest; существующие местные image IDs не заявляют byte-for-byte совпадение с будущим Git checkout.

### Дополнительные пути сверх прежних 163: 361 конкретный файл

| W | Index | HEAD | Path |
|---|---|---|---|
| yes | yes | NO | `.github/workflows/refactor-browser-boundary.yml` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/AdminActions.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/AdminNavIcon.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/AnalyticsPanels.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/App.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/Consultations.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/DataPanel.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/GafusPanel.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/MailAlertBadge.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/MobileIntroPanel.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/ModerationPanels.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/PartnersPanel.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/PaymentHistory.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/ProfitExpenses.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/ProfitReport.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/ScheduleEditor.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/SettingsEditors.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/SubscriptionOverview.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/SubscriptionPanels.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/SystemPanels.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/UserManagement.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/UserSubscription.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/api.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/consultationNavigation.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/consultationScheduleRules.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/consultationScheduleTime.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/mountInWeb.tsx` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/profitNavigation.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/profitPartners.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/rewardedPeriod.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/routes.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/scheduleMutationResolution.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/subscriptionNavigation.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/support/dateRange.ts` |
| yes | yes | NO | `apps/admin-panel/src/admin-live/support/usersListUtils.ts` |
| yes | yes | NO | `apps/web-vite/index.html` |
| yes | yes | NO | `apps/web-vite/public/push-sw.js` |
| yes | yes | NO | `apps/web-vite/src/App.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/ArticleCard.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/BurgerIcon.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/GafusFooter.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/GafusHeader.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/LandingMaterialIcons.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/LandingVkEntry.tsx` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyArticleDetail.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyCourseCard.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyCourseFilters.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyCourseSearch.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyCoursesPage.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyDeleteAccountForm.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyFeedCard.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyFeedLayout.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyGafusWallet.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyMyQuestions.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyPetList.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyPetsPage.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyPrimaryButton.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyProfileBio.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyProfilePage.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyQuestionsPage.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyRemindersPage.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyTrainingReminders.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyVetVisits.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyVkErrorBanner.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/LegacyVkIdOneTap.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/PublicLanding.module.css` |
| yes | yes | NO | `apps/web-vite/src/brand/PublicLanding.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/account/AccountDeletionS1Form.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/account/AccountMutationPage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/account/EmailConfirmPage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/account/UsernameChangePage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/account/accountApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/account/g04SourceMockConsumer.ts` |
| yes | yes | NO | `apps/web-vite/src/features/account/usernameApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/account/usernameContract.ts` |
| yes | yes | NO | `apps/web-vite/src/features/achievements/AchievementsOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/achievements/achievementsApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/achievements/achievementsEntitlement.ts` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleCatalog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleDetails.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleEmbeddedPaywall.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleEmbeddedPaywall.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleGafusUnlock.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleGafusUnlock.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/articles/ArticleLikeIcon.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/articles/articleApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/chats/Chat2Messenger.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/chats/Chat2Messenger.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/chats/Chat2ReportQueue.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/chats/Chat2StaffQueue.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/chats/chat2Api.ts` |
| yes | yes | NO | `apps/web-vite/src/features/chats/messageReactions.ts` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/SubscriptionCheckout.css` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/SubscriptionOptInHarness.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/SubscriptionReadPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/checkoutApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/commerce/subscriptionReadMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationOptInHarness.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationPublicTrainerProfile.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/bookingSourceMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/consultationLiveApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/consultations/consultationReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/courses/CourseCatalog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/courses/CourseNextMainGeometry.css` |
| yes | yes | NO | `apps/web-vite/src/features/courses/CourseOverview.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/courses/LegacyCourseCard.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/courses/PublicHomeRoute.mounted.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/courses/courseApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/courses/courseCatalogFilters.test.ts` |
| yes | yes | NO | `apps/web-vite/src/features/courses/courseCatalogFilters.ts` |
| yes | yes | NO | `apps/web-vite/src/features/courses/courseLabels.ts` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/DailyCourseNextParity.css` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/DailyCourseOptInHarness.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/dailyBoundProgressApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/daily-course/dailyCourseApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/excuses/ExcusesOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/excuses/excuseSourceMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/gafus/GuidesOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gafus/WalletConnectedPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gafus/WalletOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gafus/guidesReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/gafus/walletReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/GalleryAlbums.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/GalleryManage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/GalleryOptInHarness.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/GalleryPhotoActionsDialog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/PublicGalleryView.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/gallery/galleryApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/FeedCdnImage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/FeedV2Image.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/FeedV2Media.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/FeedV2Video.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentActions.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentAuthorAvatar.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentCommentAvatar.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentCommentCard.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentCommentMediaProcessing.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentComments.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentComposer.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentDetails.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentDraftPoll.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentDrafts.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentEditPublishedText.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentEditPublishedText.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentInlinePoll.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentLegacyEditRoute.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentLocalMediaPreview.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentMediaGallery.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentMediaReorder.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPendingPosts.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPendingPosts.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPhotoUpload.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPoll.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPostMenu.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentPostMenu.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentReplies.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentVideo.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsCatalog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsProfile.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsProfile.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsSaved.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/MomentsSaved.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/PostDetailOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/moments/feedClient.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/feedMediaTransfer.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/hiddenAuthorsReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/moment-drafts-clean.css` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentComposerApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentDraftPollApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentMedia.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentPollImages.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentPollOptionUpload.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentPublishedEditor.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentUploadPool.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/momentsApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/notificationsReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/moments/postDetailReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/partner/PartnerOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/partner/PartnerRoute.mounted.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/partner/partnerReadApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetActionDialog.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetActionDialog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetAvatarConnected.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetAvatarConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCardActionIcons.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCollection.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCreateConnectedPage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCreateFields.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCreateLegacy.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCreateS1Form.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetCreateTypeSelector.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetDeleteConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetDetailPage.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetDetails.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetDocumentViewer.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetDocuments.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetEditConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetEditOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetExpandedNext.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetInlinePrivateFacts.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetPrevention.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetPrevention.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetProfileVisibilityConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetVetVisits.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetVetVisitsConnected.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetWeightChart.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/pets/PetWeightChart.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petActionsApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petAvatarApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petCreateIntentS1.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petCreateS1.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petCreateS1HttpSubmit.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petDocumentsApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petEditSourceMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petListCountSync.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petPhotoUrl.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/petPreventionApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/vetVisitsHonoReadConsumer.ts` |
| yes | yes | NO | `apps/web-vite/src/features/pets/vetVisitsSourceMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/AccountDeleteConnected.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/AccountDeleteConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/AccountDeleteOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/EmbeddedProfileActivity.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LegacyNotificationStatus.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.mounted.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LegacyProfileSettings.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/LogoutAllSessionsAction.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextCookieConsent.mounted.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextCookieConsent.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextExternalLinkIcon.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextProfileIcon.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextSocialIcons.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextTourHost.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/NextTourSteps.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/ProfileOverview.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/ProfileQuestionListCard.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/PublicProfileRoute.mounted.test.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/PublicProfileView.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/PublicTrainerCourses.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/RemindersConnectedPage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/RemindersControls.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/RemindersNextExtras.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/RemindersOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/StudentNotesPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1PublicActivityCards.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1PublicActivityLayout.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1PublicHero.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1PublicPets.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1SocialBrandMarks.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1TrainerCourses.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/WEB1VisitorToggle.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/profile/accountDeleteReview.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/browserPushEnrollment.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/profileApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/profileQuestionsOwnerApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/publicProfileApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/reminderTimezones.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/reminderV2SourceCandidate.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/remindersLiveApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/remindersSourceMock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/profile/studentNotesApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/questions/AnswerActionBar.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/AnswerHeart.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/AnswerOwnerControls.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/MyQuestionsPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/NextQuestionPreview.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionAnswerAvatar.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionCatalog.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionCreate.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionDetails.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionManagement.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionOwnerControls.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionPhotoPicker.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionReport.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionThreadReplies.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/questions/QuestionsCatalogNextResponsive.css` |
| yes | yes | NO | `apps/web-vite/src/features/questions/questionApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/questions/questionMedia.ts` |
| yes | yes | NO | `apps/web-vite/src/features/questions/questionPhotoRead.ts` |
| yes | yes | NO | `apps/web-vite/src/features/readListHistoryView.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/CourseReviewsOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/CourseReviewsPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/CourseShareButton.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/DiaryEditor.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/PaidTrainingPreview.module.css` |
| yes | yes | NO | `apps/web-vite/src/features/training/PaidTrainingPreview.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/SafeCourseDescriptionMarkdown.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TheoryReadingContext.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingDayViewer.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingExamStep.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingIndex.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingIndexOptInHarness.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingProgressConnected.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingStepAccessCard.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingStepImage.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingStepUnlock.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingStepVideo.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/TrainingSurveyStep.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/training/courseReviewsApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/paidCourseOutlineApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingDayApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingDaysApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingDiaryApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingExamApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingGlobalTimer.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingProgressConnectedApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingStepClock.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingStepMutationLease.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingSurveyApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/training/trainingVideoProgressApi.ts` |
| yes | yes | NO | `apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx` |
| yes | yes | NO | `apps/web-vite/src/features/vk-consent/vkConsentSource.ts` |
| yes | yes | NO | `apps/web-vite/src/main.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/api/cdnProbe.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/api/client.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/AuthPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/PasswordRecovery.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/PasswordVisibilityField.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/RegisterPanel.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/VkConsentWeb.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/authApi.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/passwordRecoveryApi.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/registerApi.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/registrationSession.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/auth/useAuth.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/media/browserStorageUploadUrl.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/pwa-retirement/retireLegacyPwa.ts` |
| yes | yes | NO | `apps/web-vite/src/shared/router/location.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/BackButton.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/Buttons.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/CancelNavigationLink.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/Loading.tsx` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/SelectChevron.svg` |
| yes | yes | NO | `apps/web-vite/src/shared/ui/SelectChevron.tsx` |
| yes | yes | NO | `apps/web-vite/vite.config.mjs` |
| yes | yes | yes | `packages/cdn-upload/src/utils.ts` |
| yes | yes | yes | `packages/ui-components/package.json` |
| yes | yes | yes | `packages/ui-components/src/index.ts` |
| yes | yes | NO | `scripts/refactor/verify_vite_browser_boundary.mjs` |
| yes | yes | NO | `scripts/refactor/verify_vite_browser_boundary.test.mjs` |

### Файлы релизного объёма, отсутствующие в index: точно 120

Все пути ниже присутствуют локально, но не попадут в создаваемый из index release-коммит без отдельного review и сознательного включения. Не переписывать чужие staged/unstaged/untracked состояния.

```text
apps/api/src/lib/chat2-legacy-retirement.ts
apps/api/src/routes/v1/pet-weight-read.contract.test.ts
apps/api/src/routes/v1/username-availability.contract.test.ts
apps/mobile/src/features/training/components/AccordionStep.presentation.ts
apps/web-vite/src/features/moments/MomentSummary.lazyPoll.error.test.tsx
apps/web-vite/src/features/moments/MomentSummary.lazyPoll.test.tsx
apps/web-vite/src/features/pets/PetVetVisitDetails.tsx
apps/web-vite/src/features/pets/petVetVisitDomain.ts
ci-cd/docker/Dockerfile-worker-optimized.dockerignore
ci-cd/docker/check-runtime-package-exports.mjs
docs/architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md
docs/architecture/CDN_ISOLATED_ACTOR_ACCESS_2026-10-30.md
docs/architecture/CHAT2_STAGED_CUTOVER_RUNBOOK_2026-10-30.md
docs/architecture/CORE_CLIENT_SERVER_BOUNDARY.md
docs/architecture/CORE_SUBSCRIPTIONS_EXTRACTION_2026-10-30.md
docs/architecture/NIGHT_AGENT_1_2026-10-30.md
docs/architecture/NIGHT_AGENT_2_2026-10-30.md
docs/architecture/NIGHT_AGENT_3_2026-10-30.md
docs/architecture/RELEASE_FILES_MINIMAL_2026-10-30.md
docs/performance/FRONTEND_LAZY_MOMENT_POLL_2026-10-30-summary.json
docs/performance/FRONTEND_LAZY_MOMENT_POLL_2026-10-30.md
docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-lazyMomentPoll-after.json
docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-summary.json
docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30-v2.json
docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30.json
docs/performance/FRONTEND_ROUTE_PAYLOAD_2026-10-30.md
packages/achievements-server/package.json
packages/achievements-server/src/calculateAchievements.ts
packages/achievements-server/src/datesService.ts
packages/achievements-server/src/index.ts
packages/achievements-server/src/statsService.ts
packages/achievements-server/tsconfig.json
packages/achievements-server/vitest.config.ts
packages/admin-reengagement-server/package.json
packages/admin-reengagement-server/src/adminReengagementService.test.ts
packages/admin-reengagement-server/src/adminReengagementService.ts
packages/admin-reengagement-server/src/index.ts
packages/admin-reengagement-server/src/types.ts
packages/admin-reengagement-server/tsconfig.json
packages/admin-reengagement-server/vitest.config.ts
packages/admin-rewarded-ads-server/package.json
packages/admin-rewarded-ads-server/src/adminRewardedAdsService.ts
packages/admin-rewarded-ads-server/src/index.ts
packages/admin-rewarded-ads-server/src/types.ts
packages/admin-rewarded-ads-server/tsconfig.json
packages/consent-server/package.json
packages/consent-server/src/consentService.ts
packages/consent-server/src/index.ts
packages/consent-server/src/types.ts
packages/consent-server/tsconfig.json
packages/consent-server/vitest.config.ts
packages/core-client/package.json
packages/core-client/src/auth/vk-auth-constants.ts
packages/core-client/src/client-smoke.test.ts
packages/core-client/src/feed/publication-client.ts
packages/core-client/src/index.ts
packages/core-client/src/media-delivery/index.ts
packages/core-client/src/media-delivery/remote-status.ts
packages/core-client/src/types/petrovich.d.ts
packages/core-client/src/utils/age/getAge.ts
packages/core-client/src/utils/age/getAgeWithMonths.ts
packages/core-client/src/utils/age/index.ts
packages/core-client/src/utils/date.ts
packages/core-client/src/utils/index.ts
packages/core-client/src/utils/personalization.ts
packages/core-client/src/utils/pet.ts
packages/core-client/src/utils/pluralize.ts
packages/core-client/src/utils/social.ts
packages/core-client/src/utils/training.ts
packages/core-client/src/utils/transliterate.ts
packages/core-client/src/utils/video.ts
packages/core-client/src/validation/auth-register.ts
packages/core-client/src/validation/email-domain-suggestion.ts
packages/core-client/src/validation/pet.ts
packages/core-client/src/validation/register-email-domain.ts
packages/core-client/tsconfig.json
packages/core-client/vitest.config.ts
packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts
packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts
packages/feature-flags-server/package.json
packages/feature-flags-server/src/appFeatureFlagsService.ts
packages/feature-flags-server/src/index.ts
packages/feature-flags-server/tsconfig.json
packages/mobile-intro-server/package.json
packages/mobile-intro-server/src/index.ts
packages/mobile-intro-server/src/mobileIntroService.ts
packages/mobile-intro-server/src/types.ts
packages/mobile-intro-server/tsconfig.json
packages/mobile-intro-server/vitest.config.ts
packages/notifications-server/package.json
packages/notifications-server/src/immediatePushService.ts
packages/notifications-server/src/index.ts
packages/notifications-server/src/pushWorkerService.ts
packages/notifications-server/src/stepNotificationService.ts
packages/notifications-server/tsconfig.json
packages/subscription-read-server/package.json
packages/subscription-read-server/src/accessService.test.ts
packages/subscription-read-server/src/accessService.ts
packages/subscription-read-server/src/index.ts
packages/subscription-read-server/tsconfig.json
packages/subscription-read-server/vitest.config.ts
packages/tracking-server/package.json
packages/tracking-server/src/index.ts
packages/tracking-server/src/trackingService.test.ts
packages/tracking-server/src/trackingService.ts
packages/tracking-server/tsconfig.json
packages/tracking-server/vitest.config.ts
packages/types/src/contracts/appSubscriptionRead.ts
packages/types/tests/declarations.nodenext.test.ts
packages/types/tsconfig.build.json
packages/worker/src/chat2-readiness.ts
scripts/check-core-client-boundary.mjs
scripts/check-core-server-boundary.mjs
scripts/qa/agent2-oci-entrypoints-isolated.sh
scripts/qa/agent2-oci-message-fixture.mjs
scripts/qa/agent2-oci-message-flow.cjs
scripts/qa/agent2-oci-runtime-proxy.cjs
scripts/refactor/ci-core-boundary-gate.test.mjs
scripts/refactor/docker-package-build-boundary.test.mjs
scripts/refactor/runtime-checker.pnpm-layout.test.mjs
```

**Актуальная Post-import Web QA:** один исходный full Vitest `3048 PASS /2 FAIL /6 SKIP` был красным из-за cold React.lazy DOM tests; после **двух test-only** модульных prewarm без таймаутов targeted **28/28 PASS**, и финальный один полный Web job `f6d4d78fee5a0f19ffb09de1b4a298cfcf9be8838ae34a23` **exited0, 3050 PASS / 6 SKIP / 0 FAIL**. Это новый authoritative full Web receipt, заменяющий pre-import Web 3050/6.

**Финальный релизный blocker:** неполный Git index/HEAD и отсутствие принятого remote CI/registry SHA/native/public TLS/WSS/provider-prod QA. `AGENTS.md` в разрешённом корне проекта и в проверенных подкаталогах не обнаружен. **Overall READY=NO**, нет production deploy.
