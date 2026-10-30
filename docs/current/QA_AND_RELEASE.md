# QA и готовность к выпуску

Дата: **29.10.2026**. Актуальный подтверждённый статус на ~13:42 +04:00: **READY=NO**. Текущие отдельные PASS не означают покрытие 100% функций.

## Где смотреть

| Назначение | Ссылки |
|---|---|
| Полный список функций | [FUNCTIONAL_MATRIX](../qa/FUNCTIONAL_MATRIX.md), [CURRENT_FUNCTIONAL_MATRIX](../qa/CURRENT_FUNCTIONAL_MATRIX.md) |
| Текущие блокеры, состояние выпуска | [CURRENT_RELEASE_STATUS](../qa/CURRENT_RELEASE_STATUS.md), [RELEASE_READINESS](../qa/RELEASE_READINESS.md) |
| Дефекты и следующий шаг | [BUG_REPORT](../qa/BUG_REPORT.md), [NEXT_ACTIONS](../qa/NEXT_ACTIONS.md) |
| Проверенные факты и сценарии | [TEST_RESULTS](../qa/TEST_RESULTS.md), [AUTHENTICATED_CHROMIUM_EVIDENCE](../qa/AUTHENTICATED_CHROMIUM_EVIDENCE.md) |
| CI и скрипты | [CI_SCRIPTS](../reference/CI_SCRIPTS.md) |
| Восемь архитектурных направлений / свежие регрессии | [ARCHITECTURE_ACCEPTANCE_2026-10-30](../architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md), [NIGHT_AGENT_3](../architecture/NIGHT_AGENT_3_2026-10-30.md) |

## Обязательные этапы

1. Prisma generate, typechecks, lint, unit/integration/contract tests, все Web/Admin/Trainer/API сборки, сборка/проверка нужных контейнеров.
2. Hono + отдельный локальный PostgreSQL snapshot/Redis; server-side негативные/положительные сценарии авторизации, сессий и permissions.
3. Chromium/Playwright на desktop/mobile: полный функциональный маршрут по экранам и действиям **каждого** приложения, включая admin и trainer.
4. iOS/Android native: вход, восстановление сети, офлайн-курсы и видео, синхронизация журнала, сохранение состояния, logout.
5. Внешние SMTP/Cloud.ru/Beget/платежи/IAP/push/Voximplant — только на разрешённых test-only средах и без production writes.
6. Повторная проверка после каждого исправления, запись exit code/HTTP/UI evidence, блокеров, точной версии и даты.

## Как ставить статус

PASS — только после исполнения сценария и сохранения проверяемого результата с правильной ролью, БД и viewport/device. SKIP, BLOCKED, NOT VERIFIED и PARTIAL не эквивалентны PASS. Если текущие evidence и код разошлись, нужна повторная проверка.

Не удалять активные QA-логи, локальные test DB и браузерные профили ради уборки. **Документирование и очистка мусора не являются финальным QA.**

## Chat 2.0 — локальные вложения, 29.10.2026

- Причина HTTP 503 при `POST /api/v1/chats/:id/attachments`: выделенный Hono на `127.0.0.1:3003` работал без `CHAT2_PRIVATE_MEDIA_ENABLED=isolated-dev-only`. После резервирования ключа S3 загрузчик отклонял запись. Не считать 503 ошибкой Vite и не отключать защитную проверку хранилища.
- Важно для запуска: Chat2 Hono 3003 требует `NODE_ENV=development`, `GAFUS_LOCAL_ISOLATED_API=1`, проверенный локальный PostgreSQL/Redis, `GAFUS_ISOLATED_NONPROD_S3=enabled`, endpoint `http://127.0.0.1:9000`, bucket `gafus-refactor-documents-test` и `CHAT2_PRIVATE_MEDIA_ENABLED=isolated-dev-only`. В `api-server-startup.ts` есть fail-fast для отсутствующей конфигурации. Использовать изолированный `scripts/refactor/chat2-manual-local.py`, где обязательный флаг уже задан; не запускать API 3003 вручную с неполным окружением.
- `@gafus/cdn-upload` должен быть пересобран после изменений экспорта (в частности `questionsV2Delivery`), иначе Hono падает при старте. Локальный `pnpm --filter @gafus/cdn-upload build` — PASS.
- Для каскадного удаления и realtime нужен локальный `packages/worker/src/chat2-manual-worker.ts` с `CHAT2_WORKER_ENABLED=enabled` и тем же изолированным окружением; без него файлы не очищаются вовремя. Не стартовать worker для production.
- Smoke `python3 scripts/refactor/chat2-local-http-smoke.py` проверяет cookie/Origin, Vite 5173 → Hono 3003 → MinIO 9000, запись и чтение вложения, создание сообщения, realtime, очистку временного пользователя и фактическое удаление объекта из S3. Тест работает только с временными сущностями локального WORK snapshot, не обращается к production.
- На 29.10.2026 targeted Vitest API startup **24/24 PASS**, Web attachment **4/4 PASS**, локальный HTTP/S3 smoke через Vite **PASS** (201, дальнейшее чтение и удаление). Полный `pnpm --filter @gafus/api typecheck` **FAIL** по трём существующим TypeScript-ошибкам теста `src/routes/v1/public-paid-course-outline.test.ts` (не связаны с Chat2); общий релизный QA не считается закрытым. Playwright MCP недоступен: 429.
- **Уточнение ~20:31 +04:00:** указанные три TypeScript-ошибки исправлены в тестовой фикстуре публичного платного курса; повторный `@gafus/api typecheck` — PASS, соответствующие Vitest 4/4 PASS. Все четыре сборки Web/Admin/Trainer/API — PASS. Глобальный READY остаётся **NO** до закрытия незавершённых функциональных сценариев.

## Chat 2.0 — встроенная обложка видео в Web, 29.10.2026

- `apps/web-vite/src/features/chats/Chat2Messenger.tsx`: видеоссылка через `GET /api/v1/chats/:id/attachments/:attachmentId` запрашивается при отображении сообщения. Вместо полноширинной кнопки «Воспроизвести видео» сразу появляется HTML5-плеер (`preload=metadata`, без autoplay), с обложкой `renditions.poster` при наличии или первым кадром браузерного MP4, центральной кнопкой Play и стандартными controls. Поддерживаются качество 360/720, разрешённый fallback, повторная загрузка URL при ошибке; права доступа/API не меняются.
- CSS: `Chat2Messenger.module.css`, компактный квадратный плеер с `object-fit: contain`, без обрезания вертикального видео.
- Подтверждено: `pnpm --filter @gafus/web-vite typecheck` PASS, `pnpm --filter @gafus/web-vite build` PASS, Chat2 mounted+attachment Vitest **25/25 PASS** (включая автоматическое появление видео, ручной Play и Retry после 503). В реальном Chromium просмотр не подтверждён: подключение Playwright MCP — 429. Production не затрагивался.

## Chat 2.0 Mobile inline video cover, 2026-10-29

- `apps/mobile/src/features/chat2/Chat2RoomScreen.tsx` now fetches the scoped Chat2 attachment URL when the message mounts, and displays an inline paused `expo-video` player, not a separate full-width video button. The video never auto-plays when scrolling or opening a chat. The preview uses the provided `renditions.poster` and a centered Play overlay. Legacy MP4 files without server posters get a native first-frame thumbnail via `generateThumbnailsAsync(0)` plus `expo-image`; a paused VideoView is the fallback if the thumbnail fails.
- Android uses `textureView` so RN overlays appear in front of video; after first Play the native controls become available. Auto/360/720 switching, progressive MP4 fallback, playback position preservation, expiry-aware signed URL refresh, and a retry button remain supported. Access control, Chat API, production storage, and deployment are unchanged.
- Verified: mobile TypeScript typecheck PASS, Chat2 mobile Vitest 43/43 PASS (including 3 new source-level UI contracts), targeted ESLint 0 errors (one pre-existing max-len warning), iOS Metro bundle HTTP 200, Android Metro bundle HTTP 200. Actual playback UI on physical Android/iOS hardware or an authenticated simulator is NOT VERIFIED. Do not treat source-level tests or bundling as device playback proof.

### Pre-merge cleanup QA — 29.10.2026 (локально, без production)

- Prisma generate, API typecheck, Web typecheck, Mobile typecheck — PASS.
- Web/Admin/Trainer/API release-build — PASS; Web/Admin/Trainer/Mobile lint — EXIT 0 без ошибок (предупреждения допустимы для проверки, но остаются к разбору).
- Web полный Vitest — **3022 PASS / 0 FAIL / 6 SKIP**, Mobile полный Vitest — **2311 PASS / 0 FAIL / 1 SKIP**.
- Admin и Trainer Vitest — PASS в отдельной последовательной цепочке.
- Все исправления падений ограничены тестовыми фикстурами, кроме удаления неиспользуемого импорта в Web.
- **Release READY=NO** пока не закрыты отдельные native/offline/browser/provider сценарии и Git-security/staging audit; результаты Vitest не заменяют эти проверки.
- Детали, обязательные проверки и секрет в отслеживаемом Git: `docs/maintenance/PREMERGE_AUDIT_2026-10-29.md`.


## Security release gate (29 October 2026)

Root pnpm audit --audit-level high is blocking, not warning-only. Initial audit: 7 critical / 70 high. After compatible lockfile patch overrides: 0 critical / 16 high, so the gate remains FAIL and release READY=NO. Major-dependency changes for Sharp/libvips, mail, Zod and markdown require separate scenario E2E; do not suppress advisories. See maintenance/ARCHITECTURE_HARDENING_2026-10-29.md.


## Сверка после освобождения места — 30.10.2026 (Agent 3, только документация)

- **Свежий `df -h .`: 47 GiB свободно (77% занято)**. Старый `disk BLOCKED` относится только к прежним сборкам/PG replay; новые OCI image/runtime acceptance **IN PROGRESS, owner Agent 2**: Worker `04e91cf41f6ae590483d614daf7a7cae9a1bf352c9508e39` **running** (локальный `linux/arm64`), API пока без нового полного job receipt; image-ID/digest/runtime-boot после NodeNext/realpath **не подтверждены**. `linux/arm64` нельзя выдавать за release `linux/amd64`. Очистку/cache/prune повторно не делали.
- Сохранённые финальные тесты: Web **3048 PASS / 6 SKIP** (`55069dfa…`, exited/0), Mobile **2345 PASS / 1 SKIP** (`f1e6a7d2…`, exited/0), Mobile P1 token-sub negative/mounted **59/59**; все результаты ранее завершены, **в этой сверке не перезапускались**. JWT `sub` на клиенте — только отрицательный guard; сервер JWT/ACL authoritative.
- Документированные source-only QA команды воспроизведены: Core client/server, Web Core, workspace graph, Chat2 static, release index — **exit 0**; **этот PASS не означает запуск реального CI или release-контейнеров**. 11 документов, 80 локальных ссылок без ошибок. Запуск `ci-cd/docker/check-runtime-package-exports.mjs` должен происходить **внутри фактически готового image**, не на хосте.
- **Release-inclusion blocker:** девять новых `packages/*/package.json` отсутствуют в Git index (включая `core-client`), равно как и ряд новых source QA scripts/runtime checker и архитектурных отчётов. `check-release-index.mjs` exit 0 **не проверяет наличие всех девяти**. Полный перечень **только для будущего review, не staging** — [ARCHITECTURE_ACCEPTANCE](../architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md). `docs/current`: **7 index / 0 HEAD**, документы не представлены как уже закоммиченные.
- **READY=NO** до completed image/runtime receipts агента 2, затем реального CI и независимой native/browser/provider/security приёмки. API/Worker/Cloud/production не разворачивались в этом пакете. См. [отчёт Agent 3](../architecture/NIGHT_AGENT_3_2026-10-30.md).
