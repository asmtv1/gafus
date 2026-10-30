## Moments quiz read-only + foreign vote preservation — 2026-10-29 14:58:52 +0400

- **Quiz publish PASS scoped**: QA USER desktop published 2-option quiz via real Chrome; local PostgreSQL confirmed FeedPoll.isQuiz=true and correct option structure. First QA harness attempt failed on variable initialization order (fixed); on rerun publication succeeded, but QA client incorrectly waited for DOM fieldset.disabled. The native fieldset element itself is not classified as disabled by Playwright, whereas contained radio controls ARE effectively disabled.
- **Quiz vote immutability real Chrome mobile PASS, read-only rerun**: QA TRAINER voted; local PostgreSQL confirms their own vote. Fresh browser GET /api/v1/feed/posts/<built-in function id>/poll reports isQuiz=true and myOptionIds length 1; option radios disabled, no Edit/Cancel/Submit buttons after vote. Evidence .local-pg-scratch/qa-logs/chromium-moments-quiz-readonly-final-20261029.log and browser-20261029/feed-quiz-immutable-readonly.json.
- **Cleanup deliberately NOT DONE for one QA quiz**: exact SQL discovered TWO votes under this one newly QA-authored public quiz, one from synthetic QA TRAINER and one from an existing non-QA USER account in local WORK PG18 (account predated Oct29 and is not among authorized QA actors). Strict fixture cleanup refused to delete the post, because cascading deletion would remove a non-QA user's vote; no such destructive deletion executed. The local QA quiz remains published, clearly labeled QA. This is not a production write. Need isolate poll QA from other actors before closing/deleting or agree on an explicit safe data policy. Do not relabel as PASS/cleaned.
- **READY=NO**: closing this quiz and end-to-end non-QA isolation remain unverified; native offline, external providers and full source Docker build remain open.

## Moments poll: publish/vote/cancel/delete Chrome+SQL — 2026-10-29 14:50:20 +0400

- **PASS 4/4**, durable job f8f20acf6fb3ecd416e6b121aca62e3389a4722fc20f1141 exited0: synthetic QA USER desktop actual UI /moments/new text+2-option poll POST/PUT/PUBLISH HTTP200, SQL FeedPost published and FeedPoll 2 options; QA TRAINER mobile read+vote, SQL exact voter selection; mobile cancel, SQL zero votes; QA USER desktop post action menu -> delete, SQL deletedAt/status; strict own QA post hard cleanup with zero media/comments/reactions/third-party votes, SQL zero own matching post. Evidence .local-pg-scratch/qa-logs/chromium-moments-poll-after-correct-wait-20261029.log and browser-20261029/feed-poll-e2e.json.
- First attempt **QA harness defect**, not a product failure: waitForURL allowed /moments/new to match the published-post pattern and returned before asynchronous save/publish. Corrected to exclude /moments/new and wait for an actual post-specific URL. Existing older QA USER draft (status draft/version0, with no revision) was not touched: its identity existed before the rerun. Only newly owned QA poll/post was removed.
- Local isolated Hono3001 confirmed Feed enabled, S3 endpoint 127.0.0.1:9000, Cloud.ru Jobs disabled, no production media/registry use. **Does NOT verify** video transcoding, external S3/CDN, Moments quiz/multiple/anonymous/hidden-result variations or notification push. **READY=NO**.

## Chat2 private groups + API Docker incremental runtime — 2026-10-29 14:42:26 +0400

- **Chat2 PRIVATE group Chrome/SQL 4/4 PASS**, durable job dc2be250738c163847702dae697ef0fa798d7c66668e7936 exited0. QA USER desktop created PRIVATE group through real UI POST201, SQL visibility PRIVATE. QA TRAINER mobile before invite could not discover/read/join/send group (HTTP403/404, no membership); QA USER desktop invited through real settings UI POST200, SQL 2 authorized actors; QA TRAINER mobile opened and sent one message HTTP201, SQL author/content verified. Only owned synthetic group/message deleted afterward, SQL zero. Evidence .local-pg-scratch/qa-logs/chromium-chat2-private-group-retry-20261029.log and browser-20261029/chat2-private-group-e2e.json. First attempt clicked unsupported Playwright role summary; no product failure, corrected to actual native summary selector and reran.
- **API Docker current source incremental linux/amd64 PASS (scoped)**: API locally built via tsup/typecheck exit0, JS SHA256 803655cec01cd33eda30d74c2488354bc90c5a229fcb4a22bf4c2eb797f718a7; QA image gafus-refactor-qa-api:20261029-notes-delete-fix-incremental from prior accepted amd64 runtime image and newly compiled JS. Result image digest sha256:e5d32e1ed96122c2824cc1f939af9b6a9ef8ce8d9bc3bd33bf59e01d3c502a52. Runtime Docker --network none: real in-container HTTP GET /health200 JSON status ok; unauthenticated HTTP DELETE trainer notes 401; Docker container removed. Evidence .local-pg-scratch/qa-logs/docker/api-amd64-incremental-after-notes-delete-20261029-r2.log.
- **Full-from-source optimized API Docker rebuild NOT PASS**: durable job 16f63d987f473e6a2c38849d58bdfe620ea11b474a37da2c reached 15min timeout (SIGTERM) before finishing workspace build, no new full image. Evidence .local-pg-scratch/qa-logs/docker/api-amd64-notes-delete-fix-20261029.log. Incremental QA smoke proves runtime behavior of compiled fix but does not replace the missing full clean CI Docker build. Docker Engine 28.4.0 running; no prune or deletion of other images/volumes.
- **READY=NO** while full Docker rebuild, iOS/Android signed QA login/offline video, external media Cloud Jobs/S3/CDN, SMTP/push, payments/IAP, consultation provider Voximplant and remaining role controls are unverified.

## Trainer Notes CRUD HTTP bug fixed + exam/logout — 2026-10-29 14:01:10 +0400

- **Trainer Notes real Chrome CRUD PASS 3/3**, durable job 3859d1c9321b938f414d731ccd80e7088ddea901d51113a4 exit0. Trainer desktop created note with single synthetic CUID QA student HTTP201, SQL verified student relation/entry visibility; Trainer mobile edited HTTP200 SQL confirmed; deleted via real UI confirmation HTTP200, SQL zero. Evidence .local-pg-scratch/qa-logs/chromium-trainer-notes-after-http-fix-20261029.log and browser-20261029/trainer-notes-e2e.json.
- **Bug TRAINER-NOTES-DELETE-HTTP-001 FIXED** in apps/api/src/routes/v1/trainer-notes-manage.ts: Node Hono bodyless DELETE presented an empty ReadableStream, rejected by previous body-is-not-null check as BAD_INPUT400. Now bounded stream content inspection accepts truly empty bodies, rejects nonempty. Added regression in apps/api/src/routes/v1/trainer-notes-manage.test.ts, focused API Vitest 7/7 PASS (Node-like empty200, nonempty400). Replaced local Hono3001 with same isolated postgres/redis, health200; rerun Chrome DELETE200. API typecheck exit0 and build exit0 after fix. Docker rebuild separate in-progress job; never claim Docker PASS before exit0.
- **Temporary student cleanup PASS**: previous synthetic QA USER IDs UUID, but Trainer Notes API requires CUID studentId. Created temporary strictly local CUID student with no email/phone; after test SQL checked all single-field FK references to User, exact guarded delete removed own temp student and tracking file; zero QA notes remaining.
- **Trainer exam filters and logout Chrome desktop/mobile 4/4 PASS**, durable job 6ed3af4472daa72861670310c831f7471b13a0f3a3bf4259 exit0. Both viewports filtered exams via hideCompleted/type/sort, refreshed GET200 with no mutation, logout UI HTTP200, post logout auth/me401. Evidence .local-pg-scratch/qa-logs/chromium-trainer-exam-filters-logout-20261029.log, browser-20261029/trainer-exam-filter-logout.json.
- **Web restored on trusted 5173 PASS** after Trainer local QA. Same original GAFUS_WEB_DEV_API_MODE=local-hono and VITE_API_BASE_URL=http://127.0.0.1:4174, Web /login HTTP200; isolated Hono3001 health200. No production, push/deploy, Main touched.
- **READY=NO**: native QA offline video/download/playback, Cloud media/S3/CDN/Jobs, SMTP/push, payment/IAP, Voximplant, remainder Web/Admin/Trainer UI not proven.

## Admin user edit real mobile/desktop — 2026-10-29 13:42:29 +0400

**PASS 2/2, durable job a822c247ab2b231b4e41c10c8304ae6b3d70e27e467518b0 exit0.** Synthetic local QA ADMIN in real mobile Chrome opened sidebar, filtered /main-panel/users by synthetic QA USER, edited **only** target phone field via actual editor/confirm PATCH HTTP200; SQL verified changed QA marker. Fresh ADMIN desktop session opened same user's editor, read current value, pressed Cancel without any write. Guarded owner-scoped SQL cleanup restored original phone=NULL (no other fields), confirmed. No emails, SMS, roles or passwords touched. Evidence .local-pg-scratch/qa-logs/chromium-admin-user-phone-edit-mobile-20261029.log and browser-20261029/admin-user-phone-edit.json. First failed QA attempt navigated directly to users before login and got redirected home; second failed QA attempt did not expand mobile sidebar; both produced no lasting QA changes and both reasons corrected before final PASS. **READY=NO**.

## Offline journal read guards / Chat2 QA-only block — 2026-10-29 13:35:38 +0400

- Offline V2 journal: real Chrome guest desktop 401; authenticated QA USER mobile and QA TRAINER desktop missing version header400, invalid UUID400, valid but unknown UUID 404. **7/7 PASS, durable job 11d9596f6584853cb4ff02ba1180bf23f632efffcce66484 exit0**. All requests GET only, no data changes. Pre-auth guest 401 did not include a no-store response header, while authenticated routes did; guest response has no private payload. No actual journal write/reconciliation/native offline playback verified.
- Chat2 block/unblock: real authenticated QA USER and TRAINER Chrome contexts used /api/v1/chats/block and /direct on local isolated Hono. USER set blocked true HTTP200 and SQL row, TRAINER direct create HTTP403 with zero rooms, USER unblock HTTP200 with zero blocks, TRAINER direct create HTTP201 after unblock; **4/4 PASS, durable job 19e0aacebfe0dfcd20a003dc8a0c8d78d7c3043170939a7b exit0**. Strict cleanup removed only own synthetic pair block and newly created DIRECT room; SQL zero own remnants. API actions invoked in Chrome, not all UI buttons. Evidence .local-pg-scratch/qa-logs/chromium-chat2-block-qa-actors-20261029.log and browser-20261029/chat2-block-qa-pair.json.
- The separate two-device logout-all UI test was **NOT STARTED**: command was blocked before execution by tool safety. Single-device Web/Admin logout already PASS; multi-device session revocation remains NOT VERIFIED. No unsafe retry or secret exposure.
- **READY=NO**. Native signed QA auth/offline video, external Cloud media/SMTP/push/payment/IAP/Voximplant and full Web/Admin/Trainer interactions remain unverified.

## Browser session revoke/logout — 2026-10-29 13:29:26 +0400

**PASS 2/2, durable job d7c4fcdf08e8d96a8e33a8cb75e10f26010c783cf07b5c8a exit0**: authenticated synthetic USER Web mobile and ADMIN panel desktop, GET /api/v1/auth/me before exit HTTP200; clicked real logout UI, HTTP POST200; subsequent /me HTTP401; protected /profile and /main-panel/users no longer displayed private actor contents. QA cookies isolated by fresh Chrome contexts, no other session changes. Evidence .local-pg-scratch/qa-logs/chromium-web-admin-logout-e2e-20261029.log and .local-pg-scratch/qa-logs/browser-20261029/web-admin-logout-e2e.json. This does not substitute for real multi-device logout-all or password-reset SMTP. **READY=NO.**

# GAFUS Refactor — актуальная функциональная матрица

Обновлено: 2026-10-29 13:13:53 +0400. **READY=NO.** PASS означает только указанный проверенный сценарий, а не весь раздел. Тестовые операции — только на localhost и синтетических QA-учётных записях.

| Область | Реальная проверка | Статус | Что осталось |
|---|---|---|---|
| Prisma / local WORK PG18 | 160 миграций, Prisma migrate deploy/status exit0; 3 QA actors сохранились | PASS | Production drift и production миграции не проверялись |
| 25 специализированных PG-тестов | 25 файлов, 110 тестов под исходными guards | PASS | Внешние интеграции |
| API non-PG scoped | 2401 PASS, 358 SKIP | PASS scoped | Нельзя подменять полный неограниченный интеграционный прогон |
| Web тесты | 2984 PASS / 6 SKIP | PASS scoped | Браузерные E2E оставшихся действий |
| Admin тесты | 194/194 PASS, typecheck после исправления feature-flags | PASS scoped | Остальные реальные мутации |
| Trainer тесты | 639 PASS | PASS scoped | Остальные реальные мутации |
| Mobile тесты | 2258 PASS / 1 SKIP, typecheck | PASS scoped | Native runtime Android и offline на устройстве |
| Docker | 5 локальных linux/amd64 images; API/Bull реальные изолированные HTTP health200 | PASS scoped | Отсутствует доказательство production deployment |
| Web profile/pets | Аватар/профиль/вес, создание/удаление собственных QA-объектов; SQL | PARTIAL | Прочие поля и фото/внешние медиа |
| Web questions | Create/edit/delete, ответы, лучший ответ; report USER→TRAINER→ADMIN dismiss с SQL | PARTIAL | Фото, все модерационные действия, награды/лимиты |
| Web reminders | Desktop create/disable/edit, mobile read/delete, SQL zero | PASS tested CRUD | Настоящие push и календарные периоды |
| Trainer Course/Day/Step | Реальные локальные QA-мутации, learner course completion и SQL | PARTIAL | Все типы шагов, видео, экраны экзамена/статистики |
| Trainer consultations | Реальный desktop PUT расписания, SQL 1 правило/16 slots, mobile readback, cleanup | PASS tested schedule | Запись пользователя, видеозвонки, уведомления |
| Admin feature flags | Реальный desktop toggle, mobile read/restore, revision27→29 и исправление UI | PASS tested flag | Остальные переключатели, публикация релизных конфигураций |
| Web subscriptions | 3 тарифных переключателя desktop/mobile, offer/status200 | PARTIAL | Оплата, IAP, промокоды, webhooks |
| Consultations | USER/TRAINER/ADMIN GET boundaries 15/15; 402 without subscription; screen navigation | PARTIAL | Реальное бронирование/отмена/связь Voximplant |
| Chat 2.0 direct | Создание, текст 2 стороны, edit/delete own, чужое edit 404; SQL/cleanup | PASS tested text | Вложения, WebSocket, уведомления, blocked state |
| Chat 2.0 groups | PUBLIC group create/join, desktop/mobile сообщения, SQL 2 участника, cleanup | PASS tested public | Private groups, avatar, moderator actions |
| Chat 2.0 complaints | TRAINER report HTTP201, Admin queue reject HTTP200, SQL REJECTED, user staff403 | PASS tested moderation | Все модерационные действия, медиа-жалобы |
| Chat 2.0 reserved lana | Mobile Chrome GET search HTTP200, lana excluded, no direct button/POST | PASS read-only lookup | Реальный API негативный direct POST против не-QA пользователя не выполнялся |
| Offline course entitlement | Guest GET401, QA USER no subscription GET402 SUBSCRIPTION_REQUIRED | PASS access denial | Разрешённое скачивание видео и воспроизведение без сети |
| iOS simulator build/boot | QA Debug build exit0, installed, native Intro/Welcome/Login and Metro | PASS build/native boot | QA signed keychain, synthetic authenticated login |
| iOS authenticated offline MP4 | Не получено подтверждённой сессии именно одного из QA акторов; отдельный QA simulator после установки Shutdown и удалён | NOT VERIFIED | Завести изолированную рабочую native сессию, download+airplane mode+playback |
| Android native runtime | ADB service ранее зависал; реального устройства нет | NOT VERIFIED | Запуск app, offline, push, права |
| Moments / photo albums / question media / Chat2 attachments | Отдельной полной Cloud Job→S3→CDN→fallback цепочки нет | NOT VERIFIED | Только безопасные синтетические медиа в nonproduction |
| SMTP / Push / YooKassa / IAP / Voximplant | Настоящие provider end-to-end не выполнены | EXTERNAL BLOCKER | Тестовые провайдеры и nonproduction keys |
| Все JSX/API кнопки | 1347 JSX и 342 API декларации — кандидаты, не проверенные действия | NOT COMPLETE | Полная инвентаризация по ролям, состояниям, viewport |

## Точные условия и ограничения

Локальная рабочая директория строго /Users/asmtv1/Desktop/gafus-refactor; GAFUS Main, production PostgreSQL/S3/CDN/CI, push и deploy не затрагивались. Секреты не выводились в отчёт. Синтетические QA Chat2 direct, GROUP, message edits/reports, вопросы, напоминания и консультационные слоты очищены после отдельных тестов.

Для схемы WORK PG перед миграциями сохранён custom PG18 backup .local-pg-scratch/qa-workdb-before-chat2-reports-20261029.dump, chmod 0600, SHA256 b1525a66d7364ffc6c031cd8cba7c37f9acaffd9715c8280c3bba0162e9fb7f0.

До закрытия всех соответствующих разделов релизный вердикт остаётся **READY=NO**, даже если scoped test suites зелёные.
