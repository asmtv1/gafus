## Активная матрица

См. docs/qa/CURRENT_FUNCTIONAL_MATRIX.md — актуальные подтверждённые PASS/PARTIAL/NOT VERIFIED. Исторические строки ниже оставлены для аудита и не означают, что каждый контроль уже протестирован.

---

## Mobile native environment and offline API — 2026-10-29 13:13:00 +0400

- **Offline course permission gate PASS (real Chrome 2/2)**: guest desktop GET /api/v1/offline/course/download for a nonexistent synthetic course received HTTP401, logged-in synthetic QA USER mobile (no active subscription) got HTTP402 code SUBSCRIPTION_REQUIRED. Requests GET only; no course/subscription/provider mutations. Durable job 51ac702c4ce7f752c5c00610c0d08c174cff4957579a3dcb exited 0. Evidence .local-pg-scratch/qa-logs/chromium-offline-course-entitlement-readonly-20261029.log and browser-20261029/offline-course-entitlement-gate.json.
- **Native test environment limitation (not a product PASS/FAIL):** existing iOS Simulator app ru.gafus.qa.sim has an authenticated local-loopback UI from a session whose username/userId do NOT equal any of three synthetic QA identities. Preserve that session, do not mutate data under it, do not infer native QA login PASS. Created a separate tracked QA-only iPhone17Pro iOS26.2 Simulator, boot/install both exit0; opening Metro dev-client presented iOS confirmation, follow-up GUI command timed out and device changed state to Shutdown without a confirmed app session. Diagnosed state, then deleted ONLY new self-created simulator after identity/name/Shutdown guards, freeing about 2 GiB; original simulator and session unchanged. Native QA login and real disconnected MP4 playback remain NOT VERIFIED. No further simulator heavy operations until environment resource constraints are resolved.
- **READY=NO**: providers (payment/IAP, Cloud S3/CDN/Jobs, SMTP/push, Voximplant), Chat2 media/realtime, other role/control actions still untested.

## Reserved kynologist direct-chat lookup — 2026-10-29 13:00:48 +0400

**PASS read-only real mobile Chrome:** isolated QA USER searched for username lana via /api/v1/chats/users; HTTP200, verified matching existing target in **local clone** but excluded exact reserved username from direct-person results, no direct-start UI element, zero chat POST/write. Durable job c85ba738b5da2d3e31312270445c96c86053199dd617f61a exit0. Evidence .local-pg-scratch/qa-logs/browser-20261029/chat2-lana-search-gate.json. This test does not submit a direct API POST against a non-QA user; the server's 403 prevention is visible in source but not counted as a real API E2E.

**Native caveat:** local QA iOS Simulator foreground now renders an authenticated chat UI on the loopback API. Metro logs show native login success/authenticated true, but the logged-in account ID and login username DO NOT match any of the 3 synthetic QA actors. Do not count this as QA-actor authenticated native test and do not mutate the other account. The earlier attempted synthetic QA login returned NETWORK_ERROR; native offline QA remains NOT VERIFIED. No production reads/writes.

**READY=NO**, native QA/offline and external media/payments/push/video call/complete UI matrix remain incomplete.

## Local WORK PostgreSQL schema fully synchronized — 2026-10-29 12:55:33 +0400

After owner-approved local-only changes and verified exclusive PG18 backup .local-pg-scratch/qa-workdb-before-chat2-reports-20261029.dump (SHA256 b1525a66d7364ffc6c031cd8cba7c37f9acaffd9715c8280c3bba0162e9fb7f0), official Prisma migrate deploy on exact 127.0.0.1:55921/gafus_refactor_real_work_20261024 completed exit0. All nine remaining pending migrations applied; official Prisma migrate status exit0 **160 migrations, Database schema is up to date!** Targeted independent SQL verified new OfflineMutationReceipt, OfflineResourceRevision, OfflinePreventionClientBinding, OfflineMutationEffect, PetMediaDeletionIntent, Chat2Report, Chat2V2MediaTask, QuestionV2MediaTask; 3 original synthetic QA actors retained. No work performed on production, Cloud S3, CDN, Main or Git. Evidence .local-pg-scratch/qa-logs/work-pg-local-migrate-deploy-20261029.log and work-pg-local-migration-status-20261029.log.

**READY=NO:** schema applies do not prove offline video, actual mobile login, media jobs, CDN fallback, SMTP/push, payment/IAP, consultation video, every Web/Admin/Trainer control.

## Chat 2.0 abuse report and staff moderation — 2026-10-29 12:52:58 +0400

- **PASS 3/3**, durable job 0f8f4d080bd299ecdcd1c32415060f966f8b474699956d30 exit0. Isolated real Chrome Web USER desktop: synthetic DIRECT text sent HTTP201; own non-staff GET /api/v1/chats/moderation/reports 403. TRAINER mobile: complaint on that message submitted HTTP201, SQL verified reporter, message, comment, OPEN state. ADMIN desktop: global Chat2 staff queue visible, clicked Reject with confirmation, HTTP200, SQL confirmed status REJECTED. Owner-only transaction cleanup removed sole own QA DIRECT, message, report; subsequent DB count zero. Evidence .local-pg-scratch/qa-logs/chromium-chat2-report-staff-e2e-20261029.log and browser-20261029/chat2-staff-report-e2e.json.
- **Root cause of previous local unavailability:** work QA PostgreSQL had no Chat2Report table, although repository migration 20261027004500_chat2_reports exists. Saved exclusive 0600 verified PG18 custom backup .local-pg-scratch/qa-workdb-before-chat2-reports-20261029.dump (5,173,152 bytes, SHA256 b1525a66d7364ffc6c031cd8cba7c37f9acaffd9715c8280c3bba0162e9fb7f0). Applied ONLY the 17-line additive Chat2Report migration inside localhost WORK database 127.0.0.1:55921 and marked it applied by Prisma migrate resolve (exit0, ledger readback). No production writes, schema-wide migration deploy or other pending migrations.
- **Remaining:** nine other migrations still pending in this local WORK DB; do not mark full schema parity. Chat2 real provider realtime, media, pushes, subscriptions, mobile native offline, other UI still NOT VERIFIED. **READY=NO.**

## Chat 2.0 edit/delete/ACL — 2026-10-29 12:46:39 +0400

**PASS 3/3, durable job e6ceeeeb22442eafc8e66c2f65fb3f31c1953d33898b5c38 exit0.** Real Chrome synthetic USER desktop created DIRECT, sent HTTP201, edited own message HTTP200; SQL verified changed text and editedAt. Synthetic TRAINER mobile read edited text, edit UI absent, attempted foreign PATCH was fail-closed HTTP404 (exact backend owner-only updateMany contract), independent SQL content unchanged. Original USER desktop deleted through confirmation HTTP200; SQL deletedAt nonnull and UI showed deletion placeholder. Exact owner-scoped QA room cleanup PASS, zero own residual data. Evidence .local-pg-scratch/qa-logs/chromium-chat2-edit-delete-final-20261029.log and browser-20261029/chat2-edit-delete-e2e.json. Desktop action buttons intentionally reveal on hover, QA harness updated accordingly. This does not cover delivery, media, moderation, push or offline. READY=NO.

## Chat 2.0 GROUP E2E — 2026-10-29 12:41:22 +0400

**PASS 2/2**: реальный Chrome desktop: QA USER создал PUBLIC GROUP, отправил первое сообщение, ответ HTTP 201 и SQL confirmed. Реальный Chrome mobile: QA TRAINER нашёл сообщество, нажал Вступить, получил серверный ACK, прочитал исходное сообщение, отправил ответ HTTP201, SQL подтвердил 2 участника и двух правильных авторов. После проверки удалён только собственный синтетический GROUP и его сообщения; SQL zero. Durable job 3b1d09e30152d140b4fc8fe3891e9ebbb2eaf6199b0e785f exited 0. Evidence .local-pg-scratch/qa-logs/chromium-chat2-local-group-e2e-20261029.log и browser-20261029/chat2-local-group-e2e.json.

**Ограничения:** непротестированы chat media/avatar/upload, WebSocket delivery, push, moderation/admin, приватные группы, все устройства. READY=NO.

## Новая подтверждённая QA-проверка — 2026-10-29 12:39:30 +0400

- **Chat 2.0 DIRECT Web desktop и mobile PASS (2/2):** локальный Hono 3003, изолированные PostgreSQL 127.0.0.1:55921 и Redis 55927. Синтетический QA USER создал прямой диалог с QA TRAINER HTTP201 и отправил текст HTTP201; отдельная мобильная Chrome-сессия TRAINER прочитала сообщение и ответила HTTP201. SQL подтвердил авторов обоих сообщений. Owner-scoped cleanup удалил только собственный DIRECT QA-диалог и контент. Durable job a76dadc9446b87bba11b59ceb2dd2336c1d0d9030097df60 завершился exit0. Evidence: .local-pg-scratch/qa-logs/chromium-chat2-direct-complete-20261029.log и browser-20261029/chat2-local-direct-e2e.json.
- Первые попытки падали по причинам **QA harness**: баннер cookies перехватывал кнопку отправки (реально отклонён по UI); незавершённый POST нельзя считать по одному тексту в composer; неоднозначный mobile text locator; cleanup ожидал несуществующую таблицу Chat2Report в этой локальной БД. Теперь тест требует подтверждения HTTP201 и SQL, а cleanup проверяет наличие таблицы. **PASS не распространяется на группы, медиа, WebSocket realtime, push, offline.**
- **READY=NO**; production/Main/push/deploy/Cloud.ru не затрагивались.

## Актуальный QA срез — 2026-10-29 11:47:39 +0400

Смотрите docs/qa/CURRENT_RELEASE_STATUS.md. READY=NO. Ниже — сохранённые исторические контрольные точки.

---

## Most recent QA addition — 2026-10-29 09:22:38 +0400

Web real reminders owner lifecycle PASS: desktop Chrome synthetic QA user created reminder POST200, initial API-created enabled=true; clicked the visible switch to disable (PUT200), SQL confirmed enabled=false, edited name and reminderTime through form (second PUT200), SQL confirmed. Fresh mobile Chrome login displayed new values, confirmed DELETE200 and SQL absence. Two viewport scenarios PASS, no reminders left active, zero delivery records. Actual evidence .local-pg-scratch/qa-logs/browser-20261029/reminder-crud-e2e.json, .local-pg-scratch/qa-logs/chromium-web-reminders-crud-20261029.log. Initial harness wrongly assumed new reminders disabled and stale locator referred to old name after rename; now corrected. No confirmed product bug, no push sent. No production modifications.

Previous authoritative checkpoints and historical snapshots follow.

# CURRENT AUTHORITATIVE QA — 2026-10-29 09:16:02 +0400

CURRENT VERDICT READY=NO. 100% FUNCTIONAL PARITY NOT CONFIRMED. This authoritative block overrides historical RUNNING/BLOCKED entries below.

- Native iOS build after Pod/Codegen fix durable job b7ce6190998aca0aa25856ae840d58a8028b6aaa45ea2d11 exited 07:58:57 Europe/Samara, code 0. Real iPhone17Pro iOS26.2 Simulator install, process launch, iOS Metro JS bundle HTTP200 (20548507 bytes) and native intro/welcome/login UI PASS. Log: .local-pg-scratch/qa-logs/ios-simulator-local-debug-build-after-pods-20261029.log and native simulator screenshots. No external deployment.
- Native login and real offline media NOT PASS: unsigned local iOS Debug app lacks Keychain entitlement; Expo SecureStore reported "A required entitlement isn't present". QA synthetic native login surfaced NETWORK_ERROR; standalone simulator HTTP GET loopback /health200 and server login200 do not prove app login. Available Apple Development certificate Team ID does not match project Team ID PJQ8PP666S. QA-only copied ad hoc/different-team signed app launch rejected by SpringBoard; original debug app reinstalled/launchable and 2 QA signing copies removed. Production signing untouched. Expo Metro own server stopped; 8081 NOT RUNNING. Matching Apple team signing capability is an explicit local external blocker, not evidence production app is broken.
- Real Chrome consultations catalog and my bookings screens USER desktop/mobile, TRAINER desktop, ADMIN desktop PASS render+nav click (targeted Admin rerun PASS); no bookings created. Browser evidence: chromium-commercial-screens-20261029.log, chromium-commercial-admin-probe-20261029.log.
- Real Chrome safe subscription UX: offer GET200 and status GET200, 3 plans, two plan-selection transitions desktop/mobile PASS, no external payment writes. Synthetic user promo unavailable; no promo/payment claim. browser-20261029/subscription-safe-controls.json.
- Real Chrome 15/15 consultant GET role checks PASS: USER general 200, staff 403; TRAINER own 200/admin 403; ADMIN all 200. browser-20261029/consultation-rbac-read.json. Real user with no subscription attempted specialist slots GET and received HTTP402 SUBSCRIPTION_REQUIRED with private,no-store, no booking/mutation. browser-20261029/consultation-subscription-denial.json.
- Real local Trainer consultation schedule desktop create 09:00-10:00 PUT200, independent SQL one rule and 16 materialized slots; mobile fresh readback same values. 2/2 PASS. Own synthetic ConsultantCynologist profile/rule/slots cleaned, SQL absent, bookings zero. browser-20261029/trainer-consultation-availability-e2e.json. Standalone Trainer auth guest race was QA harness waiting issue, not application regression.
- Prior PASS not rerun: 25 special PG files/110 tests, scoped API 2401 PASS/358 SKIP, Web Vitest 2984 PASS/6 SKIP, Admin 194 PASS, Trainer 639 PASS, Mobile full 2258 PASS/1 SKIP plus typecheck, five local linux/amd64 Docker images, API+Bull isolated HTTP health200, real Chrome profile/pets/weight, questions/answers/best, Trainer Course/Day/Step, training progress and synthetic SQL cleanup.
- Remaining BLOCKED/NOT RUN: iOS signed local session and native disconnected offline video download/playback, Android device runtime; real Cloud S3/CDN/media jobs/fallback, SMTP delivery/push, YooKassa payment/webhook/IAP, full real Voximplant video consultations, complete chat2 media, exhaustive every-button Web/Admin/Trainer/Mobile. Those external integrations require isolated test resources or provider access; must not claim 100%.
- Production DB/S3, Cloud Jobs, GAFUS Main, production push/CI/deploy remained untouched. No Git staging.

---

## Prior QA checkpoints — historical / SUPERSEDED

# CURRENT VERIFIED CHECKPOINT — 2026-10-29 09:05:24 +0400

CURRENT AUTHORITATIVE STATE:
- READY=NO. Never claim 100%. No push, production deployment, Main repo or production writes.
- iOS Debug Simulator build after full local CocoaPods/codegen recovery is PASS, NOT RUNNING. Durable job b7ce6190998aca0aa25856ae840d58a8028b6aaa45ea2d11 exited successfully at 2026-10-29 07:58:57 Europe/Samara, code 0, no timeout. Log .local-pg-scratch/qa-logs/ios-simulator-local-debug-build-after-pods-20261029.log.
- Installed local Debug Gafus.app (ru.gafus.app arm64) on iPhone 17 Pro iOS 26.2 simulator. App process launched; local Metro iOS bundle HTTP 200 (20548507 bytes), actual React Native intro/welcome/login screens rendered (native runtime PASS, not just xcodebuild). Native screenshot artifacts .local-pg-scratch/qa-logs/ios-sim-after-menu-dismiss-20261029.png, ios-sim-intro-top-fix-20261029.png and ios-sim-login-form-20261029.png.
- Native authenticated login NOT PASS: synthetic QA USER entered, mobile AuthApi returns NETWORK_ERROR. Local Hono direct POST /api/v1/auth/login for same QA credentials HTTP 200 and simctl subprocess GET 127.0.0.1:3001/health HTTP 200. Do NOT infer actual app sign-in or blame external provider. This is a separate unresolved native/client transport or React Native parsing blocker. Native offline video with downloaded media NOT RUN. Native Metro job a64992c88a61862d3d801a7b07024863649e1cc15409a785 eventually expired after 20-min timeout; do not call Metro RUNNING if no live listener.
- Actual Chrome Web consultations catalog/my/subscribe screens rendered for USER desktop/mobile, TRAINER desktop, ADMIN desktop; navigation click consultations->my PASS, ADMIN rerun passed. Admin first QA click timeout was not product regression; actual element pointer hit target and next direct click succeeded. Logs .local-pg-scratch/qa-logs/chromium-commercial-screens-20261029.log and chromium-commercial-admin-probe-20261029.log.
- Actual Chrome subscription controls: 3 subscription plan options rendered; offer GET200 and status GET200, selecting two different radios changed aria-checked and selection restored desktop+mobile, 2/2 PASS; 0 checkout/payment writes. Promo field not eligible/present for synthetic account. File .local-pg-scratch/qa-logs/browser-20261029/subscription-safe-controls.json.
- Actual Chrome Trainer local synthetic consultation availability: desktop own TRAINER login, added weekday1 09:00-10:00, PUT /api/v1/consultations/trainer/availability HTTP200, independent SQL confirmed one rule and 16 rebuilt local slots, mobile independent fresh login/readback showed interval and SQL1. 2/2 PASS. Own isolated ConsultationCynologist row and 1 rule/16 slots cleaned; independent SQL confirmed profile absent and bookings=0. Real booking creation/cancel/confirmation/video calls NOT RUN. .local-pg-scratch/qa-logs/browser-20261029/trainer-consultation-availability-e2e.json and chromium-trainer-availability-local-e2e-20261029.log.
- Already-accepted prior suites NOT repeated: special PG 25/25 files 110 PASS; scoped API 2401 PASS, 358 SKIP; Web full 2984 PASS, Admin 194 PASS, Trainer 639 PASS, Mobile full 2258 PASS +1 SKIP and typecheck PASS; local linux/amd64 Web/Admin/Trainer/API/Bull images built; API/Bull actual isolated container /health200; real Chrome pet weight, profile, questions/answers/best and training progression PASS. These are not proof of every UI control.
- Still NOT VERIFIED: actual native offline video download+playback with network disabled; Android actual native runtime; local real full media job/S3/CDN failure fallback and production-facing external integrations; SMS/SMTP delivery and WebPush; subscription YooKassa payment+webhook, mobile IAP; consultation booking confirmation, Voximplant real calls; chat/media parity; full Admin/Trainer/Web every action and interactive control; container protected auth with integration dependencies. Dependencies requiring external providers are external blockers; native login NETWORK_ERROR is an internal blocker. All must be enumerated explicitly, not counted as passed.

---

## Historical QA snapshots below (not current RUNNING/BLOCKED states)

# GAFUS - functional matrix (preliminary)

Reconstructed 2026-10-29 03:23 Europe/Samara after unrelated workspace changes removed docs/qa. All entries NOT RUN; static discoveries do not prove user actions. Incomplete route/action inventory.

| ID | App | Route | Function | Unit/integration | Playwright Chromium | Status |
|---|---|---|---|---|---|---|
| QA-0001 | Web | / | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0002 | Web | /achievements | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0003 | Web | /articles | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0004 | Web | /articles/[slug] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0005 | Web | /chats | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0006 | Web | /chats/[chatId] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0007 | Web | /consultations | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0008 | Web | /consultations/my | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0009 | Web | /courses | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0010 | Web | /courses/[courseId] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0011 | Web | /cynologist-chat | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0012 | Web | /feed | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0013 | Web | /login | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0014 | Web | /moments | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0015 | Web | /moments/[postId] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0016 | Web | /moments/drafts | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0017 | Web | /moments/new | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0018 | Web | /moments/saved | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0019 | Web | /passwordReset | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0020 | Web | /pets | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0021 | Web | /profile | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0022 | Web | /profile/albums | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0023 | Web | /profile/change-email | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0024 | Web | /profile/change-password | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0025 | Web | /profile/change-username | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0026 | Web | /profile/confirm-email | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0027 | Web | /profile/delete-account | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0028 | Web | /profile/set-password | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0029 | Web | /profile?tab=gafus | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0030 | Web | /profile?tab=notes | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0031 | Web | /profile?tab=questions | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0032 | Web | /profile?tab=settings | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0033 | Web | /questions | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0034 | Web | /questions/[id] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0035 | Web | /questions/new | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0036 | Web | /register | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0037 | Web | /reminders | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0038 | Web | /reset-password | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0039 | Web | /subscription | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0040 | Web | /trainings/[courseType] | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0041 | Web | /vk-consent | Audit interactive controls | NOT RUN | NOT RUN | NOT RUN |
| QA-0042 | Web | /login | Auth/login/logout/redirect | NOT RUN | NOT RUN | NOT RUN |
| QA-0043 | Web | /register | Registration/validation | NOT RUN | NOT RUN | NOT RUN |
| QA-0044 | Web | /passwordReset | Reset password and expiry | NOT RUN | NOT RUN | NOT RUN |
| QA-0045 | Web | /profile/change-password | Password change | NOT RUN | NOT RUN | NOT RUN |
| QA-0046 | Web | /profile/change-email | Email change | NOT RUN | NOT RUN | NOT RUN |
| QA-0047 | Web | /profile | Profile and avatar | NOT RUN | NOT RUN | NOT RUN |
| QA-0048 | Web | /pets | Pets CRUD/weights/photos | NOT RUN | NOT RUN | NOT RUN |
| QA-0049 | Web | /courses | Access rules/subscriptions/gafus | NOT RUN | NOT RUN | NOT RUN |
| QA-0050 | Web | /trainings/[courseType] | Steps/offline/video/progress | NOT RUN | NOT RUN | NOT RUN |
| QA-0051 | Web | /moments | Posts/polls/media/processing | NOT RUN | NOT RUN | NOT RUN |
| QA-0052 | Web | /questions | Questions/photos/best-answer/rewards | NOT RUN | NOT RUN | NOT RUN |
| QA-0053 | Web | /profile/albums | Gallery CRUD/privacy | NOT RUN | NOT RUN | NOT RUN |
| QA-0054 | Web | /chats | Chat 2.0/realtime/attachments | NOT RUN | NOT RUN | NOT RUN |
| QA-0055 | Web | /cynologist-chat | lana-only paid access | NOT RUN | NOT RUN | NOT RUN |
| QA-0056 | Web | /reminders | Recurring reminders | NOT RUN | NOT RUN | NOT RUN |
| QA-0057 | Web | /consultations | Booking/scheduling | NOT RUN | NOT RUN | NOT RUN |
| QA-0058 | Web | /articles | Likes/entitlements | NOT RUN | NOT RUN | NOT RUN |
| QA-0059 | Admin | /main-panel/users | Roles/moderation | NOT RUN | NOT RUN | NOT RUN |
| QA-0060 | Admin | /main-panel/feed-moderation | Moderate Moments | NOT RUN | NOT RUN | NOT RUN |
| QA-0061 | Admin | /main-panel/questions | Moderate questions | NOT RUN | NOT RUN | NOT RUN |
| QA-0062 | Admin | /main-panel/feature-flags | Feature flags | NOT RUN | NOT RUN | NOT RUN |
| QA-0063 | Admin | /main-panel/broadcasts | Sandbox broadcasting | NOT RUN | NOT RUN | NOT RUN |
| QA-0064 | Admin | /main-panel/gafus | Gafus awards | NOT RUN | NOT RUN | NOT RUN |
| QA-0065 | Admin | /main-panel/consultations | Booking administration | NOT RUN | NOT RUN | NOT RUN |
| QA-0066 | Trainer | /main-panel/courses/new | Create course | NOT RUN | NOT RUN | NOT RUN |
| QA-0067 | Trainer | /main-panel/days/new | Create day | NOT RUN | NOT RUN | NOT RUN |
| QA-0068 | Trainer | /main-panel/steps/new | Create step | NOT RUN | NOT RUN | NOT RUN |
| QA-0069 | Trainer | /main-panel/daily-course | Daily course | NOT RUN | NOT RUN | NOT RUN |
| QA-0070 | Trainer | /main-panel/my-videos | Trainer media | NOT RUN | NOT RUN | NOT RUN |
| QA-0071 | Trainer | /main-panel/exam-results | Exam results | NOT RUN | NOT RUN | NOT RUN |
| QA-0072 | Cross-app | Trainer=>Web | Course and learner progress | NOT RUN | NOT RUN | NOT RUN |
| QA-0073 | Cross-app | Web=>Admin | Posts and moderation | NOT RUN | NOT RUN | NOT RUN |
| QA-0074 | Cross-app | Web=>Admin | Questions and moderation | NOT RUN | NOT RUN | NOT RUN |
| QA-0075 | Cross-app | Web=>Trainer=>Admin | Consultations | NOT RUN | NOT RUN | NOT RUN |
| QA-0076 | Cross-app | Web A<=>B | Chat 2.0 realtime | NOT RUN | NOT RUN | NOT RUN |

Initial route/plan candidates: 76. Not a legitimate 100% denominator.

<!-- UI_CANDIDATES_BEGIN -->

## Статический реестр JSX интерактивных кандидатов

Это исходные элементы-кандидаты (могут быть общими, скрытыми или недостижимыми). Реальная доступность, связь с маршрутом, последствия нажатия и статус требуют Chromium. Static discovery НЕ равен покрытию. Для shared-or-app или feature:* привязка маршрута ещё не установлена.

| ID | Приложение | Маршрут / область | Кандидат | Исходник | Unit/Integration | Playwright | Статус |
|---|---|---|---|---|---|---|---|
| UI-ADM-0001 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/AdminActions.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0002 | Admin | shared-or-app | select | apps/admin-panel/src/admin-live/AdminActions.tsx:248 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0003 | Admin | shared-or-app | textarea | apps/admin-panel/src/admin-live/AdminActions.tsx:256 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0004 | Admin | shared-or-app | input | apps/admin-panel/src/admin-live/AdminActions.tsx:258 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0005 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/AdminActions.tsx:267 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0006 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:182 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0007 | Admin | shared-or-app | button [onClick] «Обновить статистику» | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:414 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0008 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:420 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0009 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:423 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0010 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:429 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0011 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:517 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0012 | Admin | shared-or-app | input [onChange] «Например: Новый курс доступен!» | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:520 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0013 | Admin | shared-or-app | textarea [onChange] «Например: Мы добавили новый курс по дрессировке щенков» | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:530 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0014 | Admin | shared-or-app | input [onChange] «/courses» | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:541 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0015 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:554 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0016 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/AnalyticsPanels.tsx:556 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0017 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/App.tsx:100 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0018 | Admin | shared-or-app | a «Вернуться в админ-панель» | apps/admin-panel/src/admin-live/App.tsx:291 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0019 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/App.tsx:308 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0020 | Admin | shared-or-app | a [onClick] «Медиа и хранение — отдельный раздел» | apps/admin-panel/src/admin-live/App.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0021 | Admin | shared-or-app | a [onClick] «Управление системой и кэшем» | apps/admin-panel/src/admin-live/App.tsx:324 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0022 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/App.tsx:335 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0023 | Admin | shared-or-app | button [onClick] «дней» | apps/admin-panel/src/admin-live/App.tsx:349 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0024 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/App.tsx:363 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0025 | Admin | shared-or-app | button [onClick] «Выбрать другого кинолога» | apps/admin-panel/src/admin-live/App.tsx:395 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0026 | Admin | shared-or-app | button [onClick] «Повторить запрос» | apps/admin-panel/src/admin-live/App.tsx:403 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0027 | Admin | shared-or-app | TrainerPicker [onSelect] | apps/admin-panel/src/admin-live/App.tsx:498 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0028 | Admin | shared-or-app | button [onClick] «Повторить» | apps/admin-panel/src/admin-live/App.tsx:648 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0029 | Admin | shared-or-app | button [onClick] «Выйти» | apps/admin-panel/src/admin-live/App.tsx:668 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0030 | Admin | shared-or-app | a [onClick] | apps/admin-panel/src/admin-live/App.tsx:685 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0031 | Admin | shared-or-app | button [onClick] «Выйти» | apps/admin-panel/src/admin-live/App.tsx:705 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0032 | Admin | shared-or-app | button [onClick] «Открыть меню» | apps/admin-panel/src/admin-live/App.tsx:712 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0033 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/App.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0034 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/App.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0035 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/App.tsx:92 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0036 | Admin | shared-or-app | input [onChange] «Имя или логин» | apps/admin-panel/src/admin-live/Consultations.tsx:175 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0037 | Admin | shared-or-app | a «Все брони» | apps/admin-panel/src/admin-live/Consultations.tsx:188 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0038 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/Consultations.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0039 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/Consultations.tsx:216 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0040 | Admin | shared-or-app | button [onClick] «Сверить каталог с сервером» | apps/admin-panel/src/admin-live/Consultations.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0041 | Admin | shared-or-app | a «← К каталогу кинологов» | apps/admin-panel/src/admin-live/Consultations.tsx:266 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0042 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/Consultations.tsx:272 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0043 | Admin | shared-or-app | input [onChange] «Кинолог, клиент, питомец» | apps/admin-panel/src/admin-live/Consultations.tsx:283 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0044 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/DataPanel.tsx:110 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0045 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/DataPanel.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0046 | Admin | shared-or-app | input [onChange] «Поиск» | apps/admin-panel/src/admin-live/DataPanel.tsx:69 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0047 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/GafusPanel.tsx:172 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0048 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:176 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0049 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:189 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0050 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:211 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0051 | Admin | shared-or-app | button «Сохранить настройки» | apps/admin-panel/src/admin-live/GafusPanel.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0052 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/GafusPanel.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0053 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0054 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:242 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0055 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:254 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0056 | Admin | shared-or-app | button «Применить корректировку» | apps/admin-panel/src/admin-live/GafusPanel.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0057 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:348 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0058 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:359 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0059 | Admin | shared-or-app | button [onClick] «Отклонить сигнал» | apps/admin-panel/src/admin-live/GafusPanel.tsx:370 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0060 | Admin | shared-or-app | button [onClick] «Подтвердить нарушение» | apps/admin-panel/src/admin-live/GafusPanel.tsx:377 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0061 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/GafusPanel.tsx:454 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0062 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/GafusPanel.tsx:462 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0063 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/MobileIntroPanel.tsx:120 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0064 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/MobileIntroPanel.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0065 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/MobileIntroPanel.tsx:133 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0066 | Admin | shared-or-app | button «Показать отчёт» | apps/admin-panel/src/admin-live/MobileIntroPanel.tsx:141 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0067 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/ModerationPanels.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0068 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/ModerationPanels.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0069 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/ModerationPanels.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0070 | Admin | shared-or-app | button [onClick] «Перечитать жалобу на сервере» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:225 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0071 | Admin | shared-or-app | button [onClick] «Обновить список жалоб» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:285 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0072 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:298 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0073 | Admin | shared-or-app | button [onClick] «Следующая страница» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:307 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0074 | Admin | shared-or-app | a | apps/admin-panel/src/admin-live/ModerationPanels.tsx:341 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0075 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/ModerationPanels.tsx:352 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0076 | Admin | shared-or-app | button [onClick] «Перечитать модерацию на сервере» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:463 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0077 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/ModerationPanels.tsx:469 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0078 | Admin | shared-or-app | button [onClick] «Ещё жалобы» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:487 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0079 | Admin | shared-or-app | button [onClick] «Снять блокировку» | apps/admin-panel/src/admin-live/ModerationPanels.tsx:499 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0080 | Admin | shared-or-app | button [onClick] «К списку» | apps/admin-panel/src/admin-live/PartnersPanel.tsx:145 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0081 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/PartnersPanel.tsx:166 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0082 | Admin | shared-or-app | button [onClick] «Перечитать баланс перед выплатой» | apps/admin-panel/src/admin-live/PartnersPanel.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0083 | Admin | shared-or-app | input [onChange] «Логин, имя, email, код» | apps/admin-panel/src/admin-live/PartnersPanel.tsx:232 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0084 | Admin | shared-or-app | a [onClick] «Открыть» | apps/admin-panel/src/admin-live/PartnersPanel.tsx:269 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0085 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/PaymentHistory.tsx:107 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0086 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/PaymentHistory.tsx:118 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0087 | Admin | shared-or-app | button «Найти» | apps/admin-panel/src/admin-live/PaymentHistory.tsx:126 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0088 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/PaymentHistory.tsx:178 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0089 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/PaymentHistory.tsx:188 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0090 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/PaymentHistory.tsx:95 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0091 | Admin | shared-or-app | input [onChange] «Пользователь, промокод, ID» | apps/admin-panel/src/admin-live/PaymentHistory.tsx:98 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0092 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:110 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0093 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0094 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:132 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0095 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:141 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0096 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:145 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0097 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:149 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0098 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0099 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:170 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0100 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0101 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/ProfitExpenses.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0102 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/ProfitReport.tsx:128 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0103 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitReport.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0104 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitReport.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0105 | Admin | shared-or-app | button «Показать период» | apps/admin-panel/src/admin-live/ProfitReport.tsx:151 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0106 | Admin | shared-or-app | button [onClick] «Текущий месяц» | apps/admin-panel/src/admin-live/ProfitReport.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0107 | Admin | shared-or-app | button [onClick] «С начала учёта» | apps/admin-panel/src/admin-live/ProfitReport.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0108 | Admin | shared-or-app | button [onClick] «Изменить» | apps/admin-panel/src/admin-live/ProfitReport.tsx:235 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0109 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/ProfitReport.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0110 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/ProfitReport.tsx:272 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0111 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/ProfitReport.tsx:313 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0112 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/ProfitReport.tsx:323 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0113 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:111 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0114 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:122 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0115 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:134 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0116 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0117 | Admin | shared-or-app | button [onClick] «Отменить расход» | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:145 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0118 | Admin | shared-or-app | button [onClick] «Закрыть» | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:153 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0119 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:90 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0120 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/ProfitVideoEditor.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0121 | Admin | shared-or-app | a «← Консультации (каталог)» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:196 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0122 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:219 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0123 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:226 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0124 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0125 | Admin | shared-or-app | button [onClick] «Сохранить расписание» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0126 | Admin | shared-or-app | button [onClick] «Удалить» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:259 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0127 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:269 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0128 | Admin | shared-or-app | input «date» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:272 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0129 | Admin | shared-or-app | input «reason» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:276 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0130 | Admin | shared-or-app | button «Добавить выходной» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:278 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0131 | Admin | shared-or-app | button [onClick] «Удалить» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:291 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0132 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:313 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0133 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:327 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0134 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:342 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0135 | Admin | shared-or-app | button [onClick] «Сверить расписание с сервером» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:370 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0136 | Admin | shared-or-app | button [onClick] «Открыть расписание» | apps/admin-panel/src/admin-live/ScheduleEditor.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0137 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:108 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0138 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:117 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0139 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0140 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:161 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0141 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/SettingsEditors.tsx:170 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0142 | Admin | shared-or-app | button [onClick] «Перечитать тарифы на сервере» | apps/admin-panel/src/admin-live/SettingsEditors.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0143 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:291 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0144 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:302 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0145 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:316 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0146 | Admin | shared-or-app | input [onChange] «1.7.0» | apps/admin-panel/src/admin-live/SettingsEditors.tsx:326 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0147 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:343 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0148 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:353 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0149 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:365 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0150 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/SettingsEditors.tsx:374 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0151 | Admin | shared-or-app | button [onClick] «Перечитать флаги перед повтором» | apps/admin-panel/src/admin-live/SettingsEditors.tsx:378 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0152 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/SettingsEditors.tsx:97 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0153 | Admin | shared-or-app | button [onClick] «( )» | apps/admin-panel/src/admin-live/SubscriptionOverview.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0154 | Admin | shared-or-app | input [onChange] «Пользователь, email, тариф, ID» | apps/admin-panel/src/admin-live/SubscriptionOverview.tsx:151 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0155 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/SubscriptionOverview.tsx:162 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0156 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/SubscriptionOverview.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0157 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/SubscriptionOverview.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0158 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0159 | Admin | shared-or-app | button [onClick] «Сверить промокоды с сервером» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:192 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0160 | Admin | shared-or-app | button [onClick] «История» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0161 | Admin | shared-or-app | button [onClick] «Изменить» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:228 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0162 | Admin | shared-or-app | button [onClick] «В архив» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0163 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:266 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0164 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:271 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0165 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:282 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0166 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:293 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0167 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:297 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0168 | Admin | shared-or-app | button [onClick] «Отмена» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:301 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0169 | Admin | shared-or-app | button [onClick] «Сверить чеки с сервером» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:399 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0170 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:404 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0171 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:413 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0172 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:417 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0173 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:435 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0174 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:439 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0175 | Admin | shared-or-app | button «Найти» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:441 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0176 | Admin | shared-or-app | a «Открыть чек» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:473 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0177 | Admin | shared-or-app | button [onClick] «Повторить» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:478 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0178 | Admin | shared-or-app | button [onClick] «Сверка» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:487 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0179 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:511 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0180 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:519 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0181 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/SubscriptionPanels.tsx:529 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0182 | Admin | shared-or-app | button [onClick] «Повторить чтение статистики» | apps/admin-panel/src/admin-live/SystemPanels.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0183 | Admin | shared-or-app | button [onClick] «Перечитать состояние кэша» | apps/admin-panel/src/admin-live/SystemPanels.tsx:361 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0184 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/SystemPanels.tsx:384 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0185 | Admin | shared-or-app | button [onClick] «Проверить сервер перед новым обновлением» | apps/admin-panel/src/admin-live/SystemPanels.tsx:392 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0186 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/UserManagement.tsx:143 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0187 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0188 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0189 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0190 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:170 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0191 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:182 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0192 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0193 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/UserManagement.tsx:204 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0194 | Admin | shared-or-app | button [onClick] «Проверить пользователя на сервере» | apps/admin-panel/src/admin-live/UserManagement.tsx:208 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0195 | Admin | shared-or-app | button [onClick] «Отмена» | apps/admin-panel/src/admin-live/UserManagement.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0196 | Admin | shared-or-app | input [onChange] «Имя, почта, ID, промокод» | apps/admin-panel/src/admin-live/UserManagement.tsx:317 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0197 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/UserManagement.tsx:329 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0198 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/UserManagement.tsx:342 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0199 | Admin | shared-or-app | button [onClick] «Перечитать список пользователей» | apps/admin-panel/src/admin-live/UserManagement.tsx:355 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0200 | Admin | shared-or-app | button [onClick] «Изменить» | apps/admin-panel/src/admin-live/UserManagement.tsx:410 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0201 | Admin | shared-or-app | a [onClick] «Подписка» | apps/admin-panel/src/admin-live/UserManagement.tsx:419 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0202 | Admin | shared-or-app | button [onClick] | apps/admin-panel/src/admin-live/UserManagement.tsx:431 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0203 | Admin | shared-or-app | select [onChange] «Пользователей на странице» | apps/admin-panel/src/admin-live/UserManagement.tsx:452 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0204 | Admin | shared-or-app | button [onClick] «Назад» | apps/admin-panel/src/admin-live/UserManagement.tsx:467 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0205 | Admin | shared-or-app | button [onClick] «Дальше» | apps/admin-panel/src/admin-live/UserManagement.tsx:477 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0206 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/UserSubscription.tsx:105 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0207 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserSubscription.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0208 | Admin | shared-or-app | button «Загрузить подписку» | apps/admin-panel/src/admin-live/UserSubscription.tsx:122 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0209 | Admin | shared-or-app | form [onSubmit] | apps/admin-panel/src/admin-live/UserSubscription.tsx:139 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0210 | Admin | shared-or-app | select [onChange] | apps/admin-panel/src/admin-live/UserSubscription.tsx:143 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0211 | Admin | shared-or-app | input [onChange] | apps/admin-panel/src/admin-live/UserSubscription.tsx:153 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0212 | Admin | shared-or-app | textarea [onChange] | apps/admin-panel/src/admin-live/UserSubscription.tsx:164 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0213 | Admin | shared-or-app | button | apps/admin-panel/src/admin-live/UserSubscription.tsx:172 | NOT RUN | NOT RUN | NOT RUN |
| UI-ADM-0214 | Admin | shared-or-app | a [onClick] «К списку пользователей» | apps/admin-panel/src/admin-live/UserSubscription.tsx:92 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0001 | Trainer | shared-or-app | button [onClick] «Повторить проверку» | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0002 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:169 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0003 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:170 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0004 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:172 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0005 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:175 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0006 | Trainer | shared-or-app | div [onClick] | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:180 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0007 | Trainer | shared-or-app | a | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:183 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0008 | Trainer | shared-or-app | button [onClick] | apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx:187 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0009 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:184 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0010 | Trainer | shared-or-app | a «К списку статей» | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:187 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0011 | Trainer | shared-or-app | a «К списку статей» | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:191 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0012 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:192 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0013 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0014 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0015 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:201 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0016 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:204 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0017 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:209 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0018 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:214 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0019 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:218 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0020 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0021 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:224 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0022 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:228 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0023 | Trainer | shared-or-app | button [onClick] «Удалить статью» | apps/trainer-panel/src/trainer-vite/TrainerArticleEditorRoute.tsx:229 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0024 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:231 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0025 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0026 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:237 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0027 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:240 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0028 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0029 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:257 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0030 | Trainer | shared-or-app | a «К списку» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:261 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0031 | Trainer | shared-or-app | a «Назад к списку» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:263 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0032 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:264 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0033 | Trainer | shared-or-app | button [onClick] «Показать доступные шаги» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0034 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:279 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0035 | Trainer | shared-or-app | button [onClick] «Вверх» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:287 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0036 | Trainer | shared-or-app | button [onClick] «Вниз» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:289 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0037 | Trainer | shared-or-app | button [onClick] «Исключить» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:291 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0038 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:298 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0039 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:315 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0040 | Trainer | shared-or-app | button «Сохранить» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:319 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0041 | Trainer | shared-or-app | button [onClick] «Удалить» | apps/trainer-panel/src/trainer-vite/TrainerContentEditorRoute.tsx:320 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0042 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:51 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0043 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:53 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0044 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:57 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0045 | Trainer | shared-or-app | button [onClick] «Из заголовка» | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:59 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0046 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:61 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0047 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:68 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0048 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:74 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0049 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:80 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0050 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0051 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:86 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0052 | Trainer | shared-or-app | a «К статьям» | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0053 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerCreateArticleRoute.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0054 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:103 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0055 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:106 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0056 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:108 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0057 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:113 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0058 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0059 | Trainer | shared-or-app | button [onClick] «Вверх» | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:122 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0060 | Trainer | shared-or-app | button [onClick] «Вниз» | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:124 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0061 | Trainer | shared-or-app | a «К панели тренера» | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:132 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0062 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:133 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0063 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:74 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0064 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0065 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0066 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0067 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:86 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0068 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:90 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0069 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateCourseRoute.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0070 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:64 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0071 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:65 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0072 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:67 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0073 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:69 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0074 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0075 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0076 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:75 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0077 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:80 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0078 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0079 | Trainer | shared-or-app | button [onClick] «Вверх» | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0080 | Trainer | shared-or-app | button [onClick] «Вниз» | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:91 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0081 | Trainer | shared-or-app | a «К списку дней» | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:98 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0082 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerCreateDayRoute.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0083 | Trainer | shared-or-app | a «К списку шагов» | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:102 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0084 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:103 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0085 | Trainer | shared-or-app | a «Библиотека шаблонов» | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:64 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0086 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:65 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0087 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0088 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:68 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0089 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0090 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:74 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0091 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0092 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0093 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:85 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0094 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:88 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0095 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0096 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:91 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0097 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0098 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerCreateStepRoute.tsx:97 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0099 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0100 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0101 | Trainer | shared-or-app | select [onChange] «Редактируемая связка» | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0102 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:205 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0103 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:207 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0104 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:208 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0105 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0106 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:214 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0107 | Trainer | shared-or-app | button [onClick] «Вверх» | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:219 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0108 | Trainer | shared-or-app | button [onClick] «Вниз» | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0109 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:226 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0110 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0111 | Trainer | shared-or-app | button [onClick] «Удалить выбранную связку» | apps/trainer-panel/src/trainer-vite/TrainerDailyBundleEditor.tsx:235 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0112 | Trainer | shared-or-app | button [onClick] «Предыдущие даты» | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0113 | Trainer | shared-or-app | button [onClick] «Следующие даты» | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:171 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0114 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0115 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:183 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0116 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0117 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0118 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:204 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0119 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:208 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0120 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0121 | Trainer | shared-or-app | input [onChange] «ГГГГ-ММ-ДД» | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:217 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0122 | Trainer | shared-or-app | button [onClick] «Удалить будущее назначение» | apps/trainer-panel/src/trainer-vite/TrainerDailyScheduleEditor.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0123 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:118 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0124 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:119 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0125 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:120 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0126 | Trainer | shared-or-app | button «Показать» | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0127 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:125 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0128 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerDailyStatisticsRoute.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0129 | Trainer | shared-or-app | a «Создать курс» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:113 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0130 | Trainer | shared-or-app | a «Создать день» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0131 | Trainer | shared-or-app | a «Создать шаг» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:115 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0132 | Trainer | shared-or-app | a «Экзамены» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0133 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0134 | Trainer | shared-or-app | a «Редактировать» | apps/trainer-panel/src/trainer-vite/TrainerDashboardRoute.tsx:135 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0135 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:224 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0136 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:250 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0137 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:259 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0138 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:268 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0139 | Trainer | shared-or-app | button [onClick] «Обновить результаты» | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0140 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:323 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0141 | Trainer | shared-or-app | button [onClick] «Принять экзамен» | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:332 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0142 | Trainer | shared-or-app | button [onClick] «Вернуть на доработку» | apps/trainer-panel/src/trainer-vite/TrainerExamManageRoute.tsx:339 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0143 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:346 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0144 | Trainer | shared-or-app | a «К списку курсов» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:350 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0145 | Trainer | shared-or-app | a «Редактировать созданный курс» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:354 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0146 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:361 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0147 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:363 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0148 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:368 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0149 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:373 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0150 | Trainer | shared-or-app | a «Назад к курсам» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:379 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0151 | Trainer | shared-or-app | button [onClick] «Загрузить актуальную версию» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:383 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0152 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:386 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0153 | Trainer | shared-or-app | select [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:396 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0154 | Trainer | shared-or-app | button [onClick] «Показать доступные дни» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:407 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0155 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:412 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0156 | Trainer | shared-or-app | button [onClick] «Вверх» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:418 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0157 | Trainer | shared-or-app | button [onClick] «Вниз» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:420 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0158 | Trainer | shared-or-app | button [onClick] «Убрать» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:423 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0159 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:430 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0160 | Trainer | shared-or-app | button [onClick] «Найти учеников» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:433 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0161 | Trainer | shared-or-app | button [onClick] «Добавить» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:439 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0162 | Trainer | shared-or-app | button [onClick] «Исключить» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:444 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0163 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:450 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0164 | Trainer | shared-or-app | button [onClick] «Удалить курс» | apps/trainer-panel/src/trainer-vite/TrainerFullCourseEditorRoute.tsx:454 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0165 | Trainer | shared-or-app | input [onChange] «ID ученика» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:348 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0166 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:362 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0167 | Trainer | shared-or-app | button [onClick] «Редактировать» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:391 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0168 | Trainer | shared-or-app | button [onClick] «Удалить» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:394 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0169 | Trainer | shared-or-app | button [onClick] «Назад» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:402 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0170 | Trainer | shared-or-app | button [onClick] «Далее» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:410 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0171 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:423 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0172 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:426 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0173 | Trainer | shared-or-app | input [onChange] «Минимум 2 символа» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:437 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0174 | Trainer | shared-or-app | button [onClick] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:444 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0175 | Trainer | shared-or-app | button [onClick] «Добавить» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:455 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0176 | Trainer | shared-or-app | input [onChange] «Можно вставить ID вручную» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:471 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0177 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:482 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0178 | Trainer | shared-or-app | textarea [onChange] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:490 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0179 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:503 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0180 | Trainer | shared-or-app | button [onClick] «Убрать запись» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:517 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0181 | Trainer | shared-or-app | button [onClick] «Добавить запись» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:526 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0182 | Trainer | shared-or-app | button | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:539 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0183 | Trainer | shared-or-app | button [onClick] «Отмена» | apps/trainer-panel/src/trainer-vite/TrainerNotesManageRoute.tsx:543 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0184 | Trainer | shared-or-app | button [onClick] «Повторить» | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:130 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0185 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0186 | Trainer | shared-or-app | button [onClick] | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:141 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0187 | Trainer | shared-or-app | form [onSubmit] | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:150 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0188 | Trainer | shared-or-app | input [onChange] | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-TRA-0189 | Trainer | shared-or-app | button «Сохранить название» | apps/trainer-panel/src/trainer-vite/TrainerVideosManageRoute.tsx:155 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0001 | Web | shared-or-app | button [onClick] «Перезагрузить страницу» | apps/web-vite/src/App.tsx:106 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0002 | Web | shared-or-app | button [onClick] «Повторить загрузку» | apps/web-vite/src/App.tsx:177 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0003 | Web | shared-or-app | a [onClick] «К содержимому» | apps/web-vite/src/App.tsx:336 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0004 | Web | shared-or-app | div [onClick] | apps/web-vite/src/brand/BurgerIcon.tsx:29 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0005 | Web | shared-or-app | a | apps/web-vite/src/brand/GafusFooter.tsx:13 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0006 | Web | shared-or-app | a «Контакты» | apps/web-vite/src/brand/GafusFooter.tsx:7 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0007 | Web | shared-or-app | a «Оферта» | apps/web-vite/src/brand/GafusFooter.tsx:9 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0008 | Web | shared-or-app | button [onClick] | apps/web-vite/src/brand/GafusHeader.tsx:103 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0009 | Web | shared-or-app | BackButton [onClick] «Назад» | apps/web-vite/src/brand/GafusHeader.tsx:70 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0010 | Web | shared-or-app | button [onClick] | apps/web-vite/src/brand/GafusHeader.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0011 | Web | shared-or-app | div [onClick] | apps/web-vite/src/brand/GafusHeader.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0012 | Web | shared-or-app | a [onClick] | apps/web-vite/src/brand/GafusHeader.tsx:95 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0013 | Web | shared-or-app | button [onClick] | apps/web-vite/src/brand/LandingVkEntry.tsx:47 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0014 | Web | shared-or-app | a | apps/web-vite/src/brand/PublicLanding.tsx:207 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0015 | Web | shared-or-app | a | apps/web-vite/src/brand/PublicLanding.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0016 | Web | shared-or-app | a | apps/web-vite/src/brand/PublicLanding.tsx:44 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0017 | Web | shared-or-app | a «Гафус, на главную» | apps/web-vite/src/brand/PublicLanding.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0018 | Web | feature:account | BackButton [onClick] «В профиль» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0019 | Web | feature:account | PrimaryButton [onClick] «Проверить состояние вручную» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:163 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0020 | Web | feature:account | PrimaryButton [onClick] «g04-request-code» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0021 | Web | feature:account | form [onSubmit] | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:177 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0022 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:179 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0023 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:190 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0024 | Web | feature:account | input [onChange] «g04-confirm-check» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:193 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0025 | Web | feature:account | SecondaryButton [onClick] «g04-confirm-delete» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:196 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0026 | Web | feature:account | button [onClick] «Назад к коду» | apps/web-vite/src/features/account/AccountDeletionS1Form.tsx:200 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0027 | Web | feature:account | form [onSubmit] | apps/web-vite/src/features/account/AccountMutationPage.tsx:124 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0028 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountMutationPage.tsx:127 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0029 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountMutationPage.tsx:135 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0030 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountMutationPage.tsx:144 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0031 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountMutationPage.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0032 | Web | feature:account | input [onChange] | apps/web-vite/src/features/account/AccountMutationPage.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0033 | Web | feature:account | form [onSubmit] | apps/web-vite/src/features/account/EmailConfirmPage.tsx:95 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0034 | Web | feature:account | form [onSubmit] | apps/web-vite/src/features/account/UsernameChangePage.tsx:189 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0035 | Web | feature:account | input [onChange] «username» | apps/web-vite/src/features/account/UsernameChangePage.tsx:191 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0036 | Web | feature:achievements | PrimaryButton [onClick] «Повторить проверку состояния подписки» | apps/web-vite/src/features/achievements/AchievementsOptIn.tsx:129 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0037 | Web | feature:achievements | button [onClick] | apps/web-vite/src/features/achievements/AchievementsOptIn.tsx:170 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0038 | Web | feature:achievements | BackButton [onClick] «Мой профиль» | apps/web-vite/src/features/achievements/AchievementsOptIn.tsx:58 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0039 | Web | feature:achievements | PrimaryButton [onClick] | apps/web-vite/src/features/achievements/AchievementsOptIn.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0040 | Web | feature:articles | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/articles/ArticleCatalog.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0041 | Web | feature:articles | button [onClick] | apps/web-vite/src/features/articles/ArticleCatalog.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0042 | Web | feature:articles | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/articles/ArticleDetails.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0043 | Web | feature:articles | button [onClick] | apps/web-vite/src/features/articles/ArticleDetails.tsx:139 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0044 | Web | feature:articles | PrimaryButton [onClick] «Проверить доступ к статье» | apps/web-vite/src/features/articles/ArticleEmbeddedPaywall.tsx:110 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0045 | Web | feature:articles | button [onClick] | apps/web-vite/src/features/articles/ArticleEmbeddedPaywall.tsx:86 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0046 | Web | feature:articles | PrimaryButton [onClick] | apps/web-vite/src/features/articles/ArticleGafusUnlock.tsx:100 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0047 | Web | feature:articles | button [onClick] «Проверить доступ» | apps/web-vite/src/features/articles/ArticleGafusUnlock.tsx:108 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0048 | Web | feature:chats | button [onClick] «Назад к сообщениям» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0049 | Web | feature:chats | button [onClick] «Обновить переписку» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1172 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0050 | Web | feature:chats | button [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1209 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0051 | Web | feature:chats | button [onClick] «Ответить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1279 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0052 | Web | feature:chats | button [onClick] «Пожаловаться» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1289 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0053 | Web | feature:chats | button [onClick] «Изменить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1303 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0054 | Web | feature:chats | button [onClick] «Удалить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1313 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0055 | Web | feature:chats | form [onSubmit] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1321 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0056 | Web | feature:chats | select [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1325 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0057 | Web | feature:chats | textarea [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1336 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0058 | Web | feature:chats | button «Отправить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1344 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0059 | Web | feature:chats | button [onClick] «Отмена» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1347 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0060 | Web | feature:chats | button [onClick] «Отменить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1363 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0061 | Web | feature:chats | button [onClick] «×» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1389 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0062 | Web | feature:chats | form [onSubmit] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1400 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0063 | Web | feature:chats | input [onChange] «Прикрепить фото, видео или PDF» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1415 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0064 | Web | feature:chats | textarea [onChange,onKeyDown] «Текст сообщения» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1428 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0065 | Web | feature:chats | button | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1443 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0066 | Web | feature:chats | button [onClick] «▶ Воспроизвести видео» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1564 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0067 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1570 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0068 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1590 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0069 | Web | feature:chats | Chat2GroupAvatarEditor [onSelect] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1672 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0070 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1704 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0071 | Web | feature:chats | button [onClick] «Выйти из чата» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1717 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0072 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1732 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0073 | Web | feature:chats | form [onSubmit] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1738 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0074 | Web | feature:chats | input [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1753 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0075 | Web | feature:chats | input [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:176 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0076 | Web | feature:chats | textarea [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1763 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0077 | Web | feature:chats | select [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1772 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0078 | Web | feature:chats | button «Сохранить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1781 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0079 | Web | feature:chats | button [onClick] «Админ» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1807 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0080 | Web | feature:chats | button [onClick] «Снять» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1812 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0081 | Web | feature:chats | button [onClick] «Исключить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1816 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0082 | Web | feature:chats | button [onClick] «Блокировать» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1819 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0083 | Web | feature:chats | button [onClick] «Передать группу» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1823 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0084 | Web | feature:chats | input [onChange] «Имя пользователя» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1843 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0085 | Web | feature:chats | button [onClick] «＋» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:1852 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0086 | Web | feature:chats | button [onClick] «Удалить фото» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:220 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0087 | Web | feature:chats | CaramelButton [onClick] «Новое сообщение» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:445 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0088 | Web | feature:chats | PrimaryButton [onClick] «Создать группу» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:471 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0089 | Web | feature:chats | input [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:512 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0090 | Web | feature:chats | button [onClick] «Закрыть сообщение об ошибке» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:524 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0091 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:544 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0092 | Web | feature:chats | button [onClick] «Кинолог» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:555 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0093 | Web | feature:chats | button [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:574 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0094 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:581 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0095 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:601 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0096 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:606 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0097 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:614 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0098 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:630 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0099 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:634 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0100 | Web | feature:chats | BackButton [onClick] «К перепискам» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:643 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0101 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:662 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0102 | Web | feature:chats | form [onSubmit] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:678 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0103 | Web | feature:chats | Chat2GroupAvatarEditor [onSelect] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:680 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0104 | Web | feature:chats | input [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:692 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0105 | Web | feature:chats | select [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:702 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0106 | Web | feature:chats | select [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:714 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0107 | Web | feature:chats | textarea [onChange] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:724 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0108 | Web | feature:chats | button [onClick] «Обновить список» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:741 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0109 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:747 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0110 | Web | feature:chats | button [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:768 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0111 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2Messenger.tsx:780 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0112 | Web | feature:chats | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:829 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0113 | Web | feature:chats | BackButton [onClick] «К сообщениям» | apps/web-vite/src/features/chats/Chat2Messenger.tsx:840 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0114 | Web | feature:chats | button [onClick] | apps/web-vite/src/features/chats/Chat2ReportQueue.tsx:40 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0115 | Web | feature:chats | button [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2ReportQueue.tsx:49 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0116 | Web | feature:chats | button [onClick] «Обработано» | apps/web-vite/src/features/chats/Chat2ReportQueue.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0117 | Web | feature:chats | button [onClick] «Отклонить» | apps/web-vite/src/features/chats/Chat2ReportQueue.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0118 | Web | feature:chats | button [onClick] «Повторить» | apps/web-vite/src/features/chats/Chat2StaffQueue.tsx:49 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0119 | Web | feature:chats | button [onClick] «Обработано» | apps/web-vite/src/features/chats/Chat2StaffQueue.tsx:75 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0120 | Web | feature:chats | button [onClick] «Отклонить» | apps/web-vite/src/features/chats/Chat2StaffQueue.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0121 | Web | feature:commerce | button [onClick] «Проверить снова» | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:106 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0122 | Web | feature:commerce | button [onClick] «Повторить» | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:118 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0123 | Web | feature:commerce | button [onClick] | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:125 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0124 | Web | feature:commerce | form [onSubmit] | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0125 | Web | feature:commerce | input [onChange] «Введите промокод» | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0126 | Web | feature:commerce | button «Применить» | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0127 | Web | feature:commerce | button [onClick] | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:150 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0128 | Web | feature:commerce | a «оферты» | apps/web-vite/src/features/commerce/SubscriptionCheckout.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0129 | Web | feature:commerce | button [onClick] «Моя подписка» | apps/web-vite/src/features/commerce/SubscriptionOptInHarness.tsx:40 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0130 | Web | feature:commerce | BackButton [onClick] «Вернуться в профиль» | apps/web-vite/src/features/commerce/SubscriptionOptInHarness.tsx:45 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0131 | Web | feature:commerce | button [onClick] | apps/web-vite/src/features/commerce/SubscriptionReadPanel.tsx:26 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0132 | Web | feature:commerce | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/commerce/SubscriptionReadPanel.tsx:51 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0133 | Web | feature:consultations | form [onSubmit] | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:119 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0134 | Web | feature:consultations | select [onChange] «petGender» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:124 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0135 | Web | feature:consultations | button «К подтверждению» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0136 | Web | feature:consultations | button [onClick] «К свободным слотам» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0137 | Web | feature:consultations | PrimaryButton [onClick] «Проверить и отправить макет» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:148 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0138 | Web | feature:consultations | button [onClick] «Изменить обращение» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:151 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0139 | Web | feature:consultations | PrimaryButton [onClick] | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0140 | Web | feature:consultations | button [onClick] «К моим записям» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:186 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0141 | Web | feature:consultations | button [onClick] «К слотам» | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:188 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0142 | Web | feature:consultations | textarea | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0143 | Web | feature:consultations | input | apps/web-vite/src/features/consultations/ConsultationBookingMockForm.tsx:51 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0144 | Web | feature:consultations | button [onClick] «Консультации с кинологом» | apps/web-vite/src/features/consultations/ConsultationOptInHarness.tsx:69 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0145 | Web | feature:consultations | BackButton [onClick] «Вернуться в профиль» | apps/web-vite/src/features/consultations/ConsultationOptInHarness.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0146 | Web | feature:consultations | BackButton [onClick] «К специалистам» | apps/web-vite/src/features/consultations/ConsultationPublicTrainerProfile.tsx:55 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0147 | Web | feature:consultations | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationPublicTrainerProfile.tsx:63 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0148 | Web | feature:consultations | button [onClick] «Посмотреть свободное время» | apps/web-vite/src/features/consultations/ConsultationPublicTrainerProfile.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0149 | Web | feature:consultations | BackButton [onClick] «К специалистам» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:107 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0150 | Web | feature:consultations | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0151 | Web | feature:consultations | PrimaryButton [onClick] | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:126 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0152 | Web | feature:consultations | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:166 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0153 | Web | feature:consultations | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:203 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0154 | Web | feature:consultations | button [onClick] «Профиль кинолога (макет)» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:222 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0155 | Web | feature:consultations | button [onClick] «Посмотреть свободное время» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:227 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0156 | Web | feature:consultations | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:255 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0157 | Web | feature:consultations | button [onClick] | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:274 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0158 | Web | feature:consultations | button [onClick] «Специалисты» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0159 | Web | feature:consultations | button [onClick] «Мои записи» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:317 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0160 | Web | feature:consultations | button [onClick] «К моим записям» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0161 | Web | feature:consultations | button [onClick] «К свободным слотам» | apps/web-vite/src/features/consultations/ConsultationReadOnlyPanel.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0162 | Web | feature:consultations | input [onChange] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:175 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0163 | Web | feature:consultations | form [onSubmit] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0164 | Web | feature:consultations | select [onChange] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0165 | Web | feature:consultations | textarea [onChange] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:192 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0166 | Web | feature:consultations | textarea [onChange] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0167 | Web | feature:consultations | PrimaryButton [onClick] «Проверить результат записи» | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:201 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0168 | Web | feature:consultations | button [onClick] «Повторить» | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:27 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0169 | Web | feature:consultations | button [onClick] «Проверить статус отмены» | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:316 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0170 | Web | feature:consultations | SecondaryButton [onClick] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:349 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0171 | Web | feature:consultations | button [onClick] | apps/web-vite/src/features/consultations/ConsultationsLivePage.tsx:356 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0172 | Web | feature:consultations | PrimaryButton [onClick] «Обновить» | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:102 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0173 | Web | feature:consultations | button [onClick] «Предыдущий месяц» | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0174 | Web | feature:consultations | button [onClick] «Следующий месяц» | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:120 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0175 | Web | feature:consultations | button [onClick] | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:136 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0176 | Web | feature:consultations | button [onClick] | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:166 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0177 | Web | feature:consultations | button «Недоступно» | apps/web-vite/src/features/consultations/ConsultationSlotsCalendar.tsx:171 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0178 | Web | feature:courses | button [onClick] «Закрыть панель фильтров» | apps/web-vite/src/features/courses/CourseCatalog.tsx:183 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0179 | Web | feature:courses | button [onClick] «Закрыть» | apps/web-vite/src/features/courses/CourseCatalog.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0180 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0181 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:222 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0182 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:235 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0183 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:249 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0184 | Web | feature:courses | select [onChange] | apps/web-vite/src/features/courses/CourseCatalog.tsx:259 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0185 | Web | feature:courses | select [onChange] | apps/web-vite/src/features/courses/CourseCatalog.tsx:272 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0186 | Web | feature:courses | select [onChange] | apps/web-vite/src/features/courses/CourseCatalog.tsx:287 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0187 | Web | feature:courses | select [onChange] | apps/web-vite/src/features/courses/CourseCatalog.tsx:307 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0188 | Web | feature:courses | button [onClick] «Сбросить фильтры» | apps/web-vite/src/features/courses/CourseCatalog.tsx:318 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0189 | Web | feature:courses | button [onClick] «Сбросить» | apps/web-vite/src/features/courses/CourseCatalog.tsx:335 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0190 | Web | feature:courses | PrimaryButton [onClick] «Показать» | apps/web-vite/src/features/courses/CourseCatalog.tsx:353 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0191 | Web | feature:courses | button [onClick] «Повторить» | apps/web-vite/src/features/courses/CourseCatalog.tsx:411 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0192 | Web | feature:courses | input [onChange] «Поиск курсов...» | apps/web-vite/src/features/courses/CourseCatalog.tsx:429 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0193 | Web | feature:courses | button [onClick] «Очистить поиск» | apps/web-vite/src/features/courses/CourseCatalog.tsx:433 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0194 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:439 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0195 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/CourseCatalog.tsx:453 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0196 | Web | feature:courses | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/courses/CourseOverview.tsx:75 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0197 | Web | feature:courses | button [onClick] | apps/web-vite/src/features/courses/FavoriteCourseButton.tsx:43 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0198 | Web | feature:courses | button [onClick] «Обновить список курсов» | apps/web-vite/src/features/courses/FavoriteCourseButton.tsx:58 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0199 | Web | feature:daily-course | PrimaryButton [onClick] «Проверить ещё раз» | apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx:147 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0200 | Web | feature:daily-course | CaramelButton [onClick] «Обновить прогресс» | apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx:198 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0201 | Web | feature:daily-course | PrimaryButton [onClick] «Проверить ещё раз» | apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx:213 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0202 | Web | feature:daily-course | button [onClick] | apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0203 | Web | feature:daily-course | button [onClick] «Обновить прогресс» | apps/web-vite/src/features/daily-course/DailyBoundProgress.tsx:240 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0204 | Web | feature:daily-course | PrimaryButton [onClick] «Повторить загрузку» | apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx:242 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0205 | Web | feature:daily-course | button [onClick] «Посмотреть шаги» | apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx:287 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0206 | Web | feature:daily-course | BackButton [onClick] «К заданию дня» | apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0207 | Web | feature:daily-course | PrimaryButton [onClick] «Повторить загрузку» | apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx:91 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0208 | Web | feature:daily-course | button [onClick] | apps/web-vite/src/features/daily-course/DailyCoursePanel.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0209 | Web | feature:excuses | BackButton [onClick] «Назад» | apps/web-vite/src/features/excuses/ExcusesOptIn.tsx:57 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0210 | Web | feature:excuses | button [onClick] | apps/web-vite/src/features/excuses/ExcusesOptIn.tsx:61 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0211 | Web | feature:excuses | button [onClick] | apps/web-vite/src/features/excuses/ExcusesOptIn.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0212 | Web | feature:excuses | button [onClick] | apps/web-vite/src/features/excuses/ExcusesOptIn.tsx:77 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0213 | Web | feature:excuses | button [onClick] «Генератор отмазок (макет)» | apps/web-vite/src/features/excuses/ExcusesOptIn.tsx:92 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0214 | Web | feature:gafus | button [onClick] «Мини-гайды за гафусы (макет)» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0215 | Web | feature:gafus | BackButton [onClick] «Мой профиль» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0216 | Web | feature:gafus | PrimaryButton [onClick] «Повторить список» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:56 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0217 | Web | feature:gafus | BackButton [onClick] «К мини-гайдам» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:61 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0218 | Web | feature:gafus | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0219 | Web | feature:gafus | button [onClick] «Читать» | apps/web-vite/src/features/gafus/GuidesOptIn.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0220 | Web | feature:gafus | button [onClick] | apps/web-vite/src/features/gafus/WalletConnectedPanel.tsx:129 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0221 | Web | feature:gafus | button [onClick] «Повторить» | apps/web-vite/src/features/gafus/WalletConnectedPanel.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0222 | Web | feature:gafus | PrimaryButton [onClick] «Повторить историю» | apps/web-vite/src/features/gafus/WalletOptIn.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0223 | Web | feature:gafus | button [onClick] | apps/web-vite/src/features/gafus/WalletOptIn.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0224 | Web | feature:gafus | PrimaryButton [onClick] «Повторить страницу операций» | apps/web-vite/src/features/gafus/WalletOptIn.tsx:169 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0225 | Web | feature:gafus | button [onClick] «Мои гафусы и история (макет)» | apps/web-vite/src/features/gafus/WalletOptIn.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0226 | Web | feature:gafus | BackButton [onClick] «Мой профиль» | apps/web-vite/src/features/gafus/WalletOptIn.tsx:91 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0227 | Web | feature:gafus | PrimaryButton [onClick] «Повторить баланс» | apps/web-vite/src/features/gafus/WalletOptIn.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0228 | Web | feature:gallery | button [onClick] «Обновить ссылку» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:291 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0229 | Web | feature:gallery | button [onClick] «Все альбомы» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:444 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0230 | Web | feature:gallery | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:452 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0231 | Web | feature:gallery | SecondaryButton [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:502 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0232 | Web | feature:gallery | SecondaryButton [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:533 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0233 | Web | feature:gallery | SecondaryButton [onClick] «Убрать обложку» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:540 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0234 | Web | feature:gallery | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:561 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0235 | Web | feature:gallery | button [onClick] «Обновить изображения» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:571 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0236 | Web | feature:gallery | button [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:592 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0237 | Web | feature:gallery | button [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:640 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0238 | Web | feature:gallery | div [onClick] «Просмотр фотографии» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:653 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0239 | Web | feature:gallery | SecondaryButton [onClick] «Закрыть фотографию» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:664 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0240 | Web | feature:gallery | button [onClick] «Предыдущая фотография» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:676 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0241 | Web | feature:gallery | button [onClick] «Следующая фотография» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:687 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0242 | Web | feature:gallery | button [onClick] «Обновить обложки» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:781 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0243 | Web | feature:gallery | PrimaryButton [onClick] «＋ Создать альбом» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:791 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0244 | Web | feature:gallery | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:842 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0245 | Web | feature:gallery | button [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:891 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0246 | Web | feature:gallery | button [onClick] | apps/web-vite/src/features/gallery/GalleryAlbums.tsx:930 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0247 | Web | feature:gallery | form [onSubmit] | apps/web-vite/src/features/gallery/GalleryManage.tsx:129 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0248 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:134 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0249 | Web | feature:gallery | textarea [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0250 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:145 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0251 | Web | feature:gallery | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/gallery/GalleryManage.tsx:155 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0252 | Web | feature:gallery | button [onClick] «Проверить мои альбомы без повторной записи» | apps/web-vite/src/features/gallery/GalleryManage.tsx:161 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0253 | Web | feature:gallery | SecondaryButton [onClick] «Удалить альбом» | apps/web-vite/src/features/gallery/GalleryManage.tsx:178 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0254 | Web | feature:gallery | SecondaryButton [onClick] «Да, удалить альбом» | apps/web-vite/src/features/gallery/GalleryManage.tsx:182 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0255 | Web | feature:gallery | SecondaryButton [onClick] «Не удалять» | apps/web-vite/src/features/gallery/GalleryManage.tsx:196 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0256 | Web | feature:gallery | button [onClick] «Изменить подпись» | apps/web-vite/src/features/gallery/GalleryManage.tsx:238 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0257 | Web | feature:gallery | form [onSubmit] | apps/web-vite/src/features/gallery/GalleryManage.tsx:240 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0258 | Web | feature:gallery | textarea [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:243 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0259 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0260 | Web | feature:gallery | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/gallery/GalleryManage.tsx:249 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0261 | Web | feature:gallery | button [onClick] «Сделать обложкой» | apps/web-vite/src/features/gallery/GalleryManage.tsx:253 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0262 | Web | feature:gallery | button [onClick] «Переместить» | apps/web-vite/src/features/gallery/GalleryManage.tsx:263 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0263 | Web | feature:gallery | select [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:266 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0264 | Web | feature:gallery | button [onClick] «Другие альбомы» | apps/web-vite/src/features/gallery/GalleryManage.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0265 | Web | feature:gallery | button [onClick] «Переместить фото» | apps/web-vite/src/features/gallery/GalleryManage.tsx:276 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0266 | Web | feature:gallery | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/gallery/GalleryManage.tsx:318 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0267 | Web | feature:gallery | SecondaryButton [onClick] «Удалить фото» | apps/web-vite/src/features/gallery/GalleryManage.tsx:321 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0268 | Web | feature:gallery | SecondaryButton [onClick] «Да, удалить фото» | apps/web-vite/src/features/gallery/GalleryManage.tsx:325 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0269 | Web | feature:gallery | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/gallery/GalleryManage.tsx:339 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0270 | Web | feature:gallery | form [onSubmit] | apps/web-vite/src/features/gallery/GalleryManage.tsx:404 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0271 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:407 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0272 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryManage.tsx:412 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0273 | Web | feature:gallery | button [onClick] «Проверить состояние загрузки» | apps/web-vite/src/features/gallery/GalleryManage.tsx:417 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0274 | Web | feature:gallery | button [onClick] «•••» | apps/web-vite/src/features/gallery/GalleryPhotoActionsDialog.tsx:38 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0275 | Web | feature:gallery | div [onClick] | apps/web-vite/src/features/gallery/GalleryPhotoActionsDialog.tsx:42 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0276 | Web | feature:gallery | SecondaryButton [onClick] «Закрыть» | apps/web-vite/src/features/gallery/GalleryPhotoActionsDialog.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0277 | Web | feature:gallery | form [onSubmit] | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:346 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0278 | Web | feature:gallery | PrimaryButton [onClick] «Добавить фотографии» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:350 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0279 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:354 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0280 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:366 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0281 | Web | feature:gallery | SecondaryButton [onClick] «Убрать из очереди» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:387 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0282 | Web | feature:gallery | PrimaryButton [onClick] «Проверить состояние загрузки» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:392 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0283 | Web | feature:gallery | PrimaryButton [onClick] «Восстановить запрос повтора» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:396 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0284 | Web | feature:gallery | PrimaryButton [onClick] «Повторить после ошибки» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:400 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0285 | Web | feature:gallery | SecondaryButton [onClick] «Прервать передачу» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:404 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0286 | Web | feature:gallery | SecondaryButton [onClick] «Отменить загрузку» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:409 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0287 | Web | feature:gallery | button [onClick] «Восстановить резервирование» | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:414 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0288 | Web | feature:gallery | input [onChange] | apps/web-vite/src/features/gallery/GalleryUploadQueue.tsx:431 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0289 | Web | feature:gallery | a | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:128 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0290 | Web | feature:gallery | button [onClick] «Показать ещё альбомы» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0291 | Web | feature:gallery | a «Все альбомы» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0292 | Web | feature:gallery | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0293 | Web | feature:gallery | button [onClick] | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:180 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0294 | Web | feature:gallery | button [onClick] «Показать ещё фотографии» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:196 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0295 | Web | feature:gallery | div [onClick] «Просмотр фотографии» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0296 | Web | feature:gallery | SecondaryButton [onClick] «Закрыть фотографию» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:205 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0297 | Web | feature:gallery | button [onClick] «← Назад» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0298 | Web | feature:gallery | button [onClick] «Вперёд →» | apps/web-vite/src/features/gallery/PublicGalleryView.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0299 | Web | feature:moments | button [onClick] «Открыть фотографию полностью» | apps/web-vite/src/features/moments/FeedV2Image.tsx:59 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0300 | Web | feature:moments | div [onClick] | apps/web-vite/src/features/moments/FeedV2Image.tsx:69 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0301 | Web | feature:moments | div [onClick] «Просмотр фотографии» | apps/web-vite/src/features/moments/FeedV2Image.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0302 | Web | feature:moments | button [onClick] «Закрыть» | apps/web-vite/src/features/moments/FeedV2Image.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0303 | Web | feature:moments | button [onClick] «Воспроизвести видео» | apps/web-vite/src/features/moments/FeedV2Video.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0304 | Web | feature:moments | BackButton [onClick] «К «Моментам»» | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0305 | Web | feature:moments | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:150 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0306 | Web | feature:moments | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:167 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0307 | Web | feature:moments | a | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:183 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0308 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:187 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0309 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0310 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0311 | Web | feature:moments | button [onClick] «Скрытые авторы (макет)» | apps/web-vite/src/features/moments/HiddenAuthorsOptIn.tsx:278 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0312 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentActions.tsx:100 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0313 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentActions.tsx:112 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0314 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentActions.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0315 | Web | feature:moments | button [onClick] «Нравится» | apps/web-vite/src/features/moments/MomentActions.tsx:62 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0316 | Web | feature:moments | button [onClick] «Выбрать реакцию» | apps/web-vite/src/features/moments/MomentActions.tsx:70 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0317 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentActions.tsx:80 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0318 | Web | feature:moments | a | apps/web-vite/src/features/moments/MomentActions.tsx:92 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0319 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:167 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0320 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0321 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:184 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0322 | Web | feature:moments | button [onClick] «Ещё альбомы» | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0323 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:200 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0324 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:203 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0325 | Web | feature:moments | button [onClick] «Ещё фотографии» | apps/web-vite/src/features/moments/MomentAlbumPhotoPicker.tsx:215 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0326 | Web | feature:moments | button [onClick] «Ответить» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:189 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0327 | Web | feature:moments | button [onClick] «Пожаловаться» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0328 | Web | feature:moments | button [onClick] «Редактировать комментарий» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:201 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0329 | Web | feature:moments | SecondaryButton [onClick] «Удалить комментарий» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:207 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0330 | Web | feature:moments | form [onSubmit] «Жалоба на комментарий» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0331 | Web | feature:moments | select [onChange] | apps/web-vite/src/features/moments/MomentCommentCard.tsx:215 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0332 | Web | feature:moments | textarea [onChange] | apps/web-vite/src/features/moments/MomentCommentCard.tsx:223 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0333 | Web | feature:moments | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:231 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0334 | Web | feature:moments | form [onSubmit] «Редактирование комментария» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:238 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0335 | Web | feature:moments | textarea [onChange] «comment-text» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0336 | Web | feature:moments | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/moments/MomentCommentCard.tsx:249 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0337 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentCommentCard.tsx:252 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0338 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentCommentCard.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0339 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentComments.tsx:161 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0340 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentComments.tsx:189 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0341 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentComments.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0342 | Web | feature:moments | form [onSubmit] | apps/web-vite/src/features/moments/MomentComments.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0343 | Web | feature:moments | SecondaryButton [onClick] «Отменить ответ» | apps/web-vite/src/features/moments/MomentComments.tsx:201 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0344 | Web | feature:moments | textarea [onChange] | apps/web-vite/src/features/moments/MomentComments.tsx:206 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0345 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentComposer.tsx:488 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0346 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentComposer.tsx:497 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0347 | Web | feature:moments | form [onSubmit] «Сохранение текстового черновика» | apps/web-vite/src/features/moments/MomentComposer.tsx:505 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0348 | Web | feature:moments | textarea [onChange] «Расскажите о своём питомце…» | apps/web-vite/src/features/moments/MomentComposer.tsx:508 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0349 | Web | feature:moments | SecondaryButton [onClick] | apps/web-vite/src/features/moments/MomentComposer.tsx:524 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0350 | Web | feature:moments | input [onChange] «Выбрать фото или видео» | apps/web-vite/src/features/moments/MomentComposer.tsx:539 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0351 | Web | feature:moments | MomentInlinePoll [onChange] | apps/web-vite/src/features/moments/MomentComposer.tsx:563 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0352 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentComposer.tsx:566 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0353 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentComposer.tsx:630 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0354 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentComposer.tsx:645 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0355 | Web | feature:moments | SecondaryButton [onClick] «Удалить черновик» | apps/web-vite/src/features/moments/MomentComposer.tsx:656 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0356 | Web | feature:moments | SecondaryButton [onClick] «Да, удалить публикацию» | apps/web-vite/src/features/moments/MomentComposer.tsx:665 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0357 | Web | feature:moments | SecondaryButton [onClick] «Не удалять» | apps/web-vite/src/features/moments/MomentComposer.tsx:668 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0358 | Web | feature:moments | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/moments/MomentDetails.tsx:67 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0359 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentDetails.tsx:90 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0360 | Web | feature:moments | button [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0361 | Web | feature:moments | button [onClick] «Добавить опрос» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:153 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0362 | Web | feature:moments | button [onClick] «Проверить наличие опроса» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0363 | Web | feature:moments | form [onSubmit] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:159 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0364 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:161 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0365 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:166 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0366 | Web | feature:moments | input [onChange] «poll-correct» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0367 | Web | feature:moments | button [onClick] «Добавить вариант» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0368 | Web | feature:moments | SecondaryButton [onClick] «Убрать последний вариант» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:189 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0369 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:193 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0370 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0371 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:202 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0372 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:205 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0373 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:209 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0374 | Web | feature:moments | button | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:214 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0375 | Web | feature:moments | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/moments/MomentDraftPoll.tsx:217 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0376 | Web | feature:moments | SecondaryButton [onClick] | apps/web-vite/src/features/moments/MomentDrafts.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0377 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentDrafts.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0378 | Web | feature:moments | PrimaryButton [onClick] «Повторить страницу черновиков» | apps/web-vite/src/features/moments/MomentDrafts.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0379 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentDrafts.tsx:88 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0380 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentDrafts.tsx:97 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0381 | Web | feature:moments | button [onClick] «Редактировать текст и вложения» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:341 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0382 | Web | feature:moments | form [onSubmit] | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:368 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0383 | Web | feature:moments | textarea [onChange] | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:370 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0384 | Web | feature:moments | button [onClick] «Выше» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:389 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0385 | Web | feature:moments | button [onClick] «Ниже» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:396 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0386 | Web | feature:moments | SecondaryButton [onClick] «Убрать» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:403 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0387 | Web | feature:moments | button [onClick] «Восстановить состав вложений» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:408 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0388 | Web | feature:moments | input [onChange] «Добавить вложения к публикации» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:423 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0389 | Web | feature:moments | SecondaryButton [onClick] «Убрать новый файл» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:436 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0390 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:456 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0391 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:475 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0392 | Web | feature:moments | button [onClick] «Проверить изменения» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:497 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0393 | Web | feature:moments | SecondaryButton [onClick] «Закрыть редактор» | apps/web-vite/src/features/moments/MomentEditPublishedText.tsx:507 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0394 | Web | feature:moments | SecondaryButton [onClick] «×» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:102 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0395 | Web | feature:moments | button [onClick] «+ Вариант ответа» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:110 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0396 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0397 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:135 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0398 | Web | feature:moments | textarea [onChange] | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:140 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0399 | Web | feature:moments | CaramelButton [onClick] «+ Добавить опрос» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:58 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0400 | Web | feature:moments | SecondaryButton [onClick] «Убрать» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:67 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0401 | Web | feature:moments | input [onChange] «Что вы думаете?» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:72 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0402 | Web | feature:moments | input [onChange] «web4-poll-correct» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0403 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:84 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0404 | Web | feature:moments | SecondaryButton [onClick] «×» | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:87 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0405 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentInlinePoll.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0406 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentLegacyEditRoute.tsx:31 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0407 | Web | feature:moments | SecondaryButton [onClick] | apps/web-vite/src/features/moments/MomentLocalMediaPreview.tsx:45 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0408 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentMediaGallery.tsx:56 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0409 | Web | feature:moments | button [onClick] «Повторить загрузку» | apps/web-vite/src/features/moments/MomentMediaGallery.tsx:63 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0410 | Web | feature:moments | button [onClick] «Выше» | apps/web-vite/src/features/moments/MomentMediaReorder.tsx:47 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0411 | Web | feature:moments | button [onClick] «Ниже» | apps/web-vite/src/features/moments/MomentMediaReorder.tsx:52 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0412 | Web | feature:moments | SecondaryButton [onClick] | apps/web-vite/src/features/moments/MomentPendingPosts.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0413 | Web | feature:moments | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/moments/MomentPendingPosts.tsx:69 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0414 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentPhotoUpload.tsx:101 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0415 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentPhotoUpload.tsx:106 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0416 | Web | feature:moments | button [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentPoll.tsx:300 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0417 | Web | feature:moments | form [onSubmit] | apps/web-vite/src/features/moments/MomentPoll.tsx:304 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0418 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentPoll.tsx:317 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0419 | Web | feature:moments | button [onClick] «Завершить опрос» | apps/web-vite/src/features/moments/MomentPoll.tsx:344 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0420 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentPoll.tsx:350 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0421 | Web | feature:moments | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/moments/MomentPoll.tsx:358 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0422 | Web | feature:moments | button | apps/web-vite/src/features/moments/MomentPoll.tsx:368 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0423 | Web | feature:moments | button [onClick] «Изменить голос» | apps/web-vite/src/features/moments/MomentPoll.tsx:372 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0424 | Web | feature:moments | button | apps/web-vite/src/features/moments/MomentPoll.tsx:376 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0425 | Web | feature:moments | SecondaryButton [onClick] «Отменить изменения» | apps/web-vite/src/features/moments/MomentPoll.tsx:380 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0426 | Web | feature:moments | SecondaryButton [onClick] «Отменить голос» | apps/web-vite/src/features/moments/MomentPoll.tsx:383 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0427 | Web | feature:moments | button [onClick] «Проверить состояние голоса» | apps/web-vite/src/features/moments/MomentPoll.tsx:390 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0428 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentPoll.tsx:51 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0429 | Web | feature:moments | button [onClick] «Показать ещё» | apps/web-vite/src/features/moments/MomentPoll.tsx:63 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0430 | Web | feature:moments | button [onClick] «Действия с публикацией» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0431 | Web | feature:moments | button [onClick] «Скопировать ссылку» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:203 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0432 | Web | feature:moments | SecondaryButton [onClick] «Удалить публикацию» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:218 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0433 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentPostMenu.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0434 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentPostMenu.tsx:225 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0435 | Web | feature:moments | button [onClick] «Не интересно» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:229 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0436 | Web | feature:moments | button [onClick] «Пожаловаться» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:240 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0437 | Web | feature:moments | form [onSubmit] «Жалоба» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0438 | Web | feature:moments | select [onChange] | apps/web-vite/src/features/moments/MomentPostMenu.tsx:248 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0439 | Web | feature:moments | textarea [onChange] | apps/web-vite/src/features/moments/MomentPostMenu.tsx:255 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0440 | Web | feature:moments | button «Отправить жалобу» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:258 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0441 | Web | feature:moments | SecondaryButton [onClick] «Закрыть жалобу» | apps/web-vite/src/features/moments/MomentPostMenu.tsx:261 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0442 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentProcessingStatus.tsx:43 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0443 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentReplies.tsx:55 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0444 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentReplies.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0445 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentReplies.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0446 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentReplies.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0447 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentsCatalog.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0448 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentsCatalog.tsx:251 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0449 | Web | feature:moments | button [onClick] «Настроить» | apps/web-vite/src/features/moments/MomentsCatalog.tsx:256 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0450 | Web | feature:moments | input [onChange] | apps/web-vite/src/features/moments/MomentsCatalog.tsx:275 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0451 | Web | feature:moments | SecondaryButton [onClick] «Сбросить рекомендации» | apps/web-vite/src/features/moments/MomentsCatalog.tsx:282 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0452 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentsCatalog.tsx:311 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0453 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsCatalog.tsx:335 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0454 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsCatalog.tsx:346 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0455 | Web | feature:moments | BackButton [onClick] «К «Моментам»» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:149 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0456 | Web | feature:moments | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:164 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0457 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0458 | Web | feature:moments | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0459 | Web | feature:moments | button [onClick] «Отметить как прочитанное» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0460 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:286 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0461 | Web | feature:moments | PrimaryButton [onClick] «Повторить страницу уведомлений» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:295 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0462 | Web | feature:moments | button [onClick] «История уведомлений (макет)» | apps/web-vite/src/features/moments/MomentsNotificationsOptIn.tsx:366 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0463 | Web | feature:moments | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/moments/MomentsProfile.tsx:130 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0464 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentsProfile.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0465 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsProfile.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0466 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsProfile.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0467 | Web | feature:moments | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/moments/MomentsSaved.tsx:119 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0468 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsSaved.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0469 | Web | feature:moments | PrimaryButton [onClick] | apps/web-vite/src/features/moments/MomentsSaved.tsx:148 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0470 | Web | feature:moments | PrimaryButton [onClick] «Проверить снова» | apps/web-vite/src/features/moments/MomentsSaved.tsx:91 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0471 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/MomentSummary.tsx:46 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0472 | Web | feature:moments | button [onClick] «Просмотреть публикацию (макет)» | apps/web-vite/src/features/moments/PostDetailOptIn.tsx:133 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0473 | Web | feature:moments | BackButton [onClick] «К «Моментам»» | apps/web-vite/src/features/moments/PostDetailOptIn.tsx:55 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0474 | Web | feature:moments | PrimaryButton [onClick] «Повторить публикацию» | apps/web-vite/src/features/moments/PostDetailOptIn.tsx:61 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0475 | Web | feature:moments | PrimaryButton [onClick] «Повторить комментарии» | apps/web-vite/src/features/moments/PostDetailOptIn.tsx:87 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0476 | Web | feature:moments | button [onClick] | apps/web-vite/src/features/moments/PostDetailOptIn.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0477 | Web | feature:partner | BackButton [onClick] «Мой профиль» | apps/web-vite/src/features/partner/PartnerOptIn.tsx:23 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0478 | Web | feature:partner | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/partner/PartnerOptIn.tsx:30 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0479 | Web | feature:partner | input «Ваша партнёрская ссылка» | apps/web-vite/src/features/partner/PartnerOptIn.tsx:35 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0480 | Web | feature:partner | button [onClick] «Партнёрский кабинет (макет)» | apps/web-vite/src/features/partner/PartnerOptIn.tsx:85 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0481 | Web | feature:pets | div [onKeyDown] | apps/web-vite/src/features/pets/PetActionDialog.tsx:44 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0482 | Web | feature:pets | button [onClick] «Изменить фотографию питомца» | apps/web-vite/src/features/pets/PetAvatarConnected.tsx:80 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0483 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetAvatarConnected.tsx:90 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0484 | Web | feature:pets | PrimaryButton [onClick] «Проверить фотографию» | apps/web-vite/src/features/pets/PetAvatarConnected.tsx:99 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0485 | Web | feature:pets | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/pets/PetCollection.tsx:113 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0486 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetCollection.tsx:141 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0487 | Web | feature:pets | button [onClick] «Подробнее» | apps/web-vite/src/features/pets/PetCollection.tsx:187 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0488 | Web | feature:pets | textarea [onChange] | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:272 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0489 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:278 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0490 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:311 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0491 | Web | feature:pets | button [onClick] «g05-refresh-session» | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:322 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0492 | Web | feature:pets | button [onClick] «g05-manual-retry» | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:326 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0493 | Web | feature:pets | button [onClick] «Вернуться» | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:330 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0494 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:341 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0495 | Web | feature:pets | input [onChange] «petType» | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:351 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0496 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetCreateS1Form.tsx:374 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0497 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetDeleteConnected.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0498 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetDeleteConnected.tsx:60 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0499 | Web | feature:pets | SecondaryButton [onClick] «Удалить питомца» | apps/web-vite/src/features/pets/PetDeleteConnected.tsx:64 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0500 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetDetails.tsx:155 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0501 | Web | feature:pets | SecondaryButton [onClick] «Удалить измерение» | apps/web-vite/src/features/pets/PetDetails.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0502 | Web | feature:pets | PrimaryButton [onClick] «Записать вес» | apps/web-vite/src/features/pets/PetDetails.tsx:217 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0503 | Web | feature:pets | CaramelButton [onClick] «Цель» | apps/web-vite/src/features/pets/PetDetails.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0504 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetDetails.tsx:227 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0505 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetDetails.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0506 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetDetails.tsx:235 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0507 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetDetails.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0508 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetDetails.tsx:244 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0509 | Web | feature:pets | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/pets/PetDetails.tsx:346 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0510 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetDocuments.tsx:199 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0511 | Web | feature:pets | PrimaryButton [onClick] «Повторить загрузку» | apps/web-vite/src/features/pets/PetDocuments.tsx:205 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0512 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetDocuments.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0513 | Web | feature:pets | a «Открыть документ в новой вкладке» | apps/web-vite/src/features/pets/PetDocuments.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0514 | Web | feature:pets | PrimaryButton [onClick] «Переименовать» | apps/web-vite/src/features/pets/PetDocuments.tsx:232 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0515 | Web | feature:pets | button [onClick] «Переименовать» | apps/web-vite/src/features/pets/PetDocuments.tsx:238 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0516 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetDocuments.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0517 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetDocuments.tsx:250 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0518 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetDocuments.tsx:254 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0519 | Web | feature:pets | SecondaryButton [onClick] «Удалить» | apps/web-vite/src/features/pets/PetDocuments.tsx:256 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0520 | Web | feature:pets | SecondaryButton [onClick] «Удалить» | apps/web-vite/src/features/pets/PetDocuments.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0521 | Web | feature:pets | SecondaryButton [onClick] «Да, удалить документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:268 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0522 | Web | feature:pets | SecondaryButton [onClick] «Не удалять» | apps/web-vite/src/features/pets/PetDocuments.tsx:276 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0523 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetDocuments.tsx:284 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0524 | Web | feature:pets | PrimaryButton [onClick] «+ Добавить документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:310 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0525 | Web | feature:pets | input [onChange] «Выбрать документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0526 | Web | feature:pets | input [onChange] «Введите название документа» | apps/web-vite/src/features/pets/PetDocuments.tsx:332 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0527 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetDocuments.tsx:338 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0528 | Web | feature:pets | PrimaryButton [onClick] «Проверить список перед новой отправкой» | apps/web-vite/src/features/pets/PetDocuments.tsx:349 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0529 | Web | feature:pets | button [onClick] «Поделиться» | apps/web-vite/src/features/pets/PetDocuments.tsx:370 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0530 | Web | feature:pets | a «Скачать» | apps/web-vite/src/features/pets/PetDocuments.tsx:374 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0531 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetDocuments.tsx:376 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0532 | Web | feature:pets | SecondaryButton [onClick] «Закрыть просмотр» | apps/web-vite/src/features/pets/PetDocuments.tsx:379 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0533 | Web | feature:pets | input «Ссылка на документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:386 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0534 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetDocuments.tsx:388 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0535 | Web | feature:pets | button [onClick] «Предыдущий документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:412 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0536 | Web | feature:pets | button [onClick] «Следующий документ» | apps/web-vite/src/features/pets/PetDocuments.tsx:415 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0537 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:102 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0538 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:111 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0539 | Web | feature:pets | textarea [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:117 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0540 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:122 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0541 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetEditConnected.tsx:130 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0542 | Web | feature:pets | SecondaryButton [onClick] «Закрыть редактирование» | apps/web-vite/src/features/pets/PetEditConnected.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0543 | Web | feature:pets | PrimaryButton [onClick] | apps/web-vite/src/features/pets/PetEditConnected.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0544 | Web | feature:pets | SecondaryButton [onClick] | apps/web-vite/src/features/pets/PetEditConnected.tsx:139 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0545 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetEditConnected.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0546 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:83 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0547 | Web | feature:pets | select [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0548 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditConnected.tsx:96 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0549 | Web | feature:pets | input [onChange] «breed» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:102 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0550 | Web | feature:pets | input [onChange] «birthDate» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:105 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0551 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetEditOptIn.tsx:109 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0552 | Web | feature:pets | textarea [onChange] «notes» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0553 | Web | feature:pets | input [onChange] «showInProfile» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:117 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0554 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:127 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0555 | Web | feature:pets | button [onClick] «Редактировать питомца (макет)» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:159 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0556 | Web | feature:pets | PrimaryButton [onClick] «Проверить карточку (макет)» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:75 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0557 | Web | feature:pets | button [onClick] «К карточке питомца» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:85 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0558 | Web | feature:pets | form [onSubmit] «Редактирование питомца» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0559 | Web | feature:pets | input [onChange] «name» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0560 | Web | feature:pets | select [onChange] «type» | apps/web-vite/src/features/pets/PetEditOptIn.tsx:97 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0561 | Web | feature:pets | form [onSubmit] | apps/web-vite/src/features/pets/PetPrevention.tsx:139 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0562 | Web | feature:pets | select [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:147 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0563 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0564 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0565 | Web | feature:pets | textarea [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:160 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0566 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0567 | Web | feature:pets | select [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:171 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0568 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:178 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0569 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:182 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0570 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetPrevention.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0571 | Web | feature:pets | SecondaryButton [onClick] | apps/web-vite/src/features/pets/PetPrevention.tsx:198 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0572 | Web | feature:pets | button [onClick] «Ещё одно напоминание» | apps/web-vite/src/features/pets/PetPrevention.tsx:211 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0573 | Web | feature:pets | PrimaryButton [onClick] «Добавить время» | apps/web-vite/src/features/pets/PetPrevention.tsx:215 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0574 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetPrevention.tsx:223 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0575 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetPrevention.tsx:229 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0576 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetPrevention.tsx:235 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0577 | Web | feature:pets | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/pets/PetPrevention.tsx:242 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0578 | Web | feature:pets | PrimaryButton [onClick] «Перечитать журнал без повторной записи» | apps/web-vite/src/features/pets/PetPrevention.tsx:247 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0579 | Web | feature:pets | PrimaryButton [onClick] «Добавить запись» | apps/web-vite/src/features/pets/PetPrevention.tsx:252 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0580 | Web | feature:pets | CaramelButton [onClick] «Редактировать» | apps/web-vite/src/features/pets/PetPrevention.tsx:264 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0581 | Web | feature:pets | SecondaryButton [onClick] «Удалить» | apps/web-vite/src/features/pets/PetPrevention.tsx:266 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0582 | Web | feature:pets | SecondaryButton [onClick] «Да, удалить запись» | apps/web-vite/src/features/pets/PetPrevention.tsx:271 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0583 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetPrevention.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0584 | Web | feature:pets | PrimaryButton [onClick] «Добавить запись» | apps/web-vite/src/features/pets/PetPrevention.tsx:277 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0585 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetProfileVisibilityConnected.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0586 | Web | feature:pets | PrimaryButton [onClick] «Перепроверить видимость» | apps/web-vite/src/features/pets/PetProfileVisibilityConnected.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0587 | Web | feature:pets | PetVetVisitsConnected [onSelect] | apps/web-vite/src/features/pets/PetVetVisits.tsx:105 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0588 | Web | feature:pets | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/pets/PetVetVisits.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0589 | Web | feature:pets | a | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0590 | Web | feature:pets | a «Скачать оригинал» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0591 | Web | feature:pets | SecondaryButton [onClick] «Удалить вложение» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0592 | Web | feature:pets | button [onClick] «Изменить» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0593 | Web | feature:pets | SecondaryButton [onClick] «Удалить запись» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:172 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0594 | Web | feature:pets | button [onClick] «К истории» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:179 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0595 | Web | feature:pets | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:204 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0596 | Web | feature:pets | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:550 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0597 | Web | feature:pets | PrimaryButton [onClick] «Добавить запись» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:572 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0598 | Web | feature:pets | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:583 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0599 | Web | feature:pets | PrimaryButton [onClick] «Перечитать историю без повторной записи» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:590 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0600 | Web | feature:pets | form [onSubmit] «Форма посещения врача» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:595 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0601 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:601 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0602 | Web | feature:pets | input [onChange] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:615 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0603 | Web | feature:pets | textarea [onChange] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:622 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0604 | Web | feature:pets | SecondaryButton [onClick] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:655 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0605 | Web | feature:pets | SecondaryButton [onClick] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:667 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0606 | Web | feature:pets | input [onChange] «Выбрать вложения» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:680 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0607 | Web | feature:pets | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:743 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0608 | Web | feature:pets | PrimaryButton [onClick] «Добавить первую запись» | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:774 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0609 | Web | feature:pets | summary [onClick] | apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx:782 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0610 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/PetWeightChart.tsx:41 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0611 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:107 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0612 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:111 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0613 | Web | feature:pets | button [onClick] | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0614 | Web | feature:pets | Visits [onSelect] | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:157 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0615 | Web | feature:pets | Bound [onSelect] | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0616 | Web | feature:pets | BackButton [onClick] «К карточке питомца» | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0617 | Web | feature:pets | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0618 | Web | feature:pets | PrimaryButton [onClick] «Повторить чтение посещения» | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:94 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0619 | Web | feature:pets | BackButton [onClick] «К истории посещений» | apps/web-vite/src/features/pets/VetVisitsReadOptIn.tsx:98 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0620 | Web | feature:profile | button [onClick] «Повторить проверку email» | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:251 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0621 | Web | feature:profile | button [onClick] «Отправить код на email» | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:267 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0622 | Web | feature:profile | form [onSubmit] | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0623 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:275 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0624 | Web | feature:profile | button «Продолжить» | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:288 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0625 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:301 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0626 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:310 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0627 | Web | feature:profile | SecondaryButton [onClick] «Удалить навсегда» | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:317 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0628 | Web | feature:profile | button [onClick] «Вернуться к коду» | apps/web-vite/src/features/profile/AccountDeleteConnected.tsx:326 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0629 | Web | feature:profile | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/profile/AccountDeleteOptIn.tsx:57 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0630 | Web | feature:profile | SecondaryButton [onClick] «Удаление аккаунта (макет)» | apps/web-vite/src/features/profile/AccountDeleteOptIn.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0631 | Web | feature:profile | button [onClick] «Повторить» | apps/web-vite/src/features/profile/EmbeddedProfileActivity.tsx:47 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0632 | Web | feature:profile | SecondaryButton [onClick] | apps/web-vite/src/features/profile/LegacyNotificationStatus.tsx:211 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0633 | Web | feature:profile | PrimaryButton [onClick] | apps/web-vite/src/features/profile/LegacyNotificationStatus.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0634 | Web | feature:profile | PrimaryButton [onClick] | apps/web-vite/src/features/profile/LegacyNotificationStatus.tsx:250 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0635 | Web | feature:profile | SecondaryButton [onClick] | apps/web-vite/src/features/profile/LegacyNotificationStatus.tsx:255 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0636 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.tsx:124 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0637 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.tsx:128 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0638 | Web | feature:profile | button [onClick] «Обновить статус» | apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.tsx:132 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0639 | Web | feature:profile | button [onClick] «Повторить» | apps/web-vite/src/features/profile/LegacyPremiumConnectedCard.tsx:87 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0640 | Web | feature:profile | button [onClick] «Изменить аватар» | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:281 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0641 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:298 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0642 | Web | feature:profile | PrimaryButton [onClick] «Сохранить аватар» | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:324 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0643 | Web | feature:profile | PrimaryButton [onClick] «Проверить аватар» | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:329 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0644 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:333 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0645 | Web | feature:profile | PrimaryButtonLink [onClick] «Редактировать профиль» | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:464 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0646 | Web | feature:profile | a | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:485 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0647 | Web | feature:profile | a | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:504 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0648 | Web | feature:profile | a | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:523 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0649 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LegacyProfilePresentation.tsx:598 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0650 | Web | feature:profile | a | apps/web-vite/src/features/profile/LegacyProfileSettings.tsx:22 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0651 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LegacyProfileSettings.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0652 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LegacyProfileSettings.tsx:86 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0653 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LegacyProfileSettings.tsx:93 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0654 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/LogoutAllSessionsAction.tsx:45 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0655 | Web | feature:profile | SecondaryButton [onClick] | apps/web-vite/src/features/profile/LogoutAllSessionsAction.tsx:54 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0656 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/LogoutAllSessionsAction.tsx:58 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0657 | Web | feature:profile | a «Подробнее» | apps/web-vite/src/features/profile/NextCookieConsent.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0658 | Web | feature:profile | button [onClick] «Принять» | apps/web-vite/src/features/profile/NextCookieConsent.tsx:87 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0659 | Web | feature:profile | SecondaryButton [onClick] «Отклонить» | apps/web-vite/src/features/profile/NextCookieConsent.tsx:89 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0660 | Web | feature:profile | SecondaryButton [onClick] «Пропустить» | apps/web-vite/src/features/profile/NextTourHost.tsx:260 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0661 | Web | feature:profile | PrimaryButton [onClick] | apps/web-vite/src/features/profile/NextTourHost.tsx:263 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0662 | Web | feature:profile | form [onSubmit] «Редактирование профиля» | apps/web-vite/src/features/profile/ProfileOverview.tsx:155 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0663 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/ProfileOverview.tsx:160 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0664 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/ProfileOverview.tsx:168 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0665 | Web | feature:profile | textarea [onChange] | apps/web-vite/src/features/profile/ProfileOverview.tsx:176 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0666 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/ProfileOverview.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0667 | Web | feature:profile | input [onChange] «username или @username» | apps/web-vite/src/features/profile/ProfileOverview.tsx:193 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0668 | Web | feature:profile | input [onChange] «username» | apps/web-vite/src/features/profile/ProfileOverview.tsx:198 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0669 | Web | feature:profile | input [onChange] «example.com» | apps/web-vite/src/features/profile/ProfileOverview.tsx:203 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0670 | Web | feature:profile | button | apps/web-vite/src/features/profile/ProfileOverview.tsx:212 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0671 | Web | feature:profile | PrimaryButton [onClick] «Проверить профиль» | apps/web-vite/src/features/profile/ProfileOverview.tsx:218 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0672 | Web | feature:profile | SecondaryButton [onClick] | apps/web-vite/src/features/profile/ProfileOverview.tsx:222 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0673 | Web | feature:profile | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/profile/ProfileOverview.tsx:389 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0674 | Web | feature:profile | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/profile/ProfileOverview.tsx:449 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0675 | Web | feature:profile | button [onClick] «Питомцы: посмотреть и изменить (макет)» | apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx:45 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0676 | Web | feature:profile | BackButton [onClick] «Вернуться к профилю» | apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0677 | Web | feature:profile | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx:54 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0678 | Web | feature:profile | button [onClick] «Открыть» | apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx:62 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0679 | Web | feature:profile | BackButton [onClick] «К списку питомцев» | apps/web-vite/src/features/profile/ProfilePetEditOptIn.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0680 | Web | feature:profile | button [onClick] «Показать публикации и вопросы» | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:136 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0681 | Web | feature:profile | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:147 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0682 | Web | feature:profile | PrimaryButton [onClick] «Повторить публикации» | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0683 | Web | feature:profile | PrimaryButton [onClick] | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0684 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:178 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0685 | Web | feature:profile | PrimaryButton [onClick] «Повторить вопросы» | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:194 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0686 | Web | feature:profile | PrimaryButton [onClick] | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:209 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0687 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/PublicAuthorActivityRead.tsx:215 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0688 | Web | feature:profile | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/profile/PublicProfileView.tsx:149 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0689 | Web | feature:profile | PrimaryButton [onClick] «Написать сообщение» | apps/web-vite/src/features/profile/PublicProfileView.tsx:195 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0690 | Web | feature:profile | a | apps/web-vite/src/features/profile/PublicProfileView.tsx:209 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0691 | Web | feature:profile | a | apps/web-vite/src/features/profile/PublicProfileView.tsx:225 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0692 | Web | feature:profile | a | apps/web-vite/src/features/profile/PublicProfileView.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0693 | Web | feature:profile | a | apps/web-vite/src/features/profile/PublicProfileView.tsx:320 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0694 | Web | feature:profile | button [onClick,onKeyDown] «@» | apps/web-vite/src/features/profile/PublicProfileView.tsx:378 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0695 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:101 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0696 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:108 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0697 | Web | feature:profile | SecondaryButton [onClick] «Удалить» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:112 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0698 | Web | feature:profile | button [onClick] «Закрыть» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:202 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0699 | Web | feature:profile | button [onClick] «Закрыть» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:206 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0700 | Web | feature:profile | button [onClick] «Повторить загрузку» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:210 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0701 | Web | feature:profile | SecondaryButton [onClick] «Да, удалить» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:231 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0702 | Web | feature:profile | SecondaryButton [onClick] «Не удалять» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0703 | Web | feature:profile | form [onSubmit] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:237 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0704 | Web | feature:profile | ReminderFields [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:241 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0705 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:248 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0706 | Web | feature:profile | SecondaryButton [onClick] «Отменить добавление» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:256 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0707 | Web | feature:profile | PrimaryButton [onClick] «+ Добавить напоминание ( /5)» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:261 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0708 | Web | feature:profile | CaramelButton [onClick] «Обновить список» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:267 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0709 | Web | feature:profile | form [onSubmit] «Создать напоминание» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:276 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0710 | Web | feature:profile | ReminderFields [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:280 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0711 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:283 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0712 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:52 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0713 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:56 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0714 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:63 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0715 | Web | feature:profile | select [onChange] | apps/web-vite/src/features/profile/RemindersConnectedPage.tsx:71 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0716 | Web | feature:profile | form [onSubmit] «Создать напоминание» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:298 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0717 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:300 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0718 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:307 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0719 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0720 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:327 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0721 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:349 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0722 | Web | feature:profile | PrimaryButton [onClick] «Проверить операцию у владельца (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:400 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0723 | Web | feature:profile | PrimaryButton [onClick] «Проверить список (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:405 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0724 | Web | feature:profile | button [onClick] «К списку напоминаний» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:424 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0725 | Web | feature:profile | button [onClick] «Напоминания о тренировках (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:498 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0726 | Web | feature:profile | BackButton [onClick] «Мой профиль» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:713 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0727 | Web | feature:profile | PrimaryButton [onClick] «Повторить загрузку» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:720 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0728 | Web | feature:profile | PrimaryButton [onClick] «Добавить напоминание (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:742 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0729 | Web | feature:profile | button [onClick] «Настроить» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:777 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0730 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:784 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0731 | Web | feature:profile | SecondaryButton [onClick] «Удалить (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:792 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0732 | Web | feature:profile | form [onSubmit] «Изменить напоминание» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:811 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0733 | Web | feature:profile | input [onChange] «name» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:814 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0734 | Web | feature:profile | input [onChange] «reminderTime» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:823 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0735 | Web | feature:profile | input [onChange] «timezone» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:832 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0736 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersOptIn.tsx:848 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0737 | Web | feature:profile | input [onChange] «enabled» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:871 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0738 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:885 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0739 | Web | feature:profile | SecondaryButton [onClick] «Подтвердить удаление (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:903 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0740 | Web | feature:profile | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:906 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0741 | Web | feature:profile | PrimaryButton [onClick] «Проверить настройку (макет)» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:930 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0742 | Web | feature:profile | button [onClick] «К списку напоминаний» | apps/web-vite/src/features/profile/RemindersOptIn.tsx:948 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0743 | Web | feature:profile | input [onChange] | apps/web-vite/src/features/profile/RemindersReadOnly.tsx:18 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0744 | Web | feature:profile | input «Название напоминания» | apps/web-vite/src/features/profile/RemindersReadOnly.tsx:22 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0745 | Web | feature:profile | button [onClick] | apps/web-vite/src/features/profile/RemindersReadOnly.tsx:25 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0746 | Web | feature:profile | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/profile/RemindersReadOnly.tsx:82 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0747 | Web | feature:profile | PrimaryButton [onClick] «Повторить загрузку заметок» | apps/web-vite/src/features/profile/StudentNotesPanel.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0748 | Web | feature:questions | button [onClick] «Ответить на комментарий» | apps/web-vite/src/features/questions/AnswerActionBar.tsx:55 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0749 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/AnswerHeart.tsx:46 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0750 | Web | feature:questions | button [onClick] «Обновить состояние сердечка» | apps/web-vite/src/features/questions/AnswerHeart.tsx:62 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0751 | Web | feature:questions | button [onClick] «Редактировать ответ» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:116 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0752 | Web | feature:questions | form [onSubmit] «Редактирование ответа» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:124 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0753 | Web | feature:questions | textarea [onChange] | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:127 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0754 | Web | feature:questions | button [onClick] «Отцепить фото» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:137 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0755 | Web | feature:questions | QuestionPhotoPicker [onChange] | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0756 | Web | feature:questions | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:150 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0757 | Web | feature:questions | SecondaryButton [onClick] «Удалить ответ» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0758 | Web | feature:questions | SecondaryButton [onClick] «Да, удалить ответ» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0759 | Web | feature:questions | SecondaryButton [onClick] «Не удалять ответ» | apps/web-vite/src/features/questions/AnswerOwnerControls.tsx:167 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0760 | Web | feature:questions | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/questions/MyQuestionsPanel.tsx:56 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0761 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/MyQuestionsPanel.tsx:65 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0762 | Web | feature:questions | input [onChange] «Поиск вопросов» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:123 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0763 | Web | feature:questions | select [onChange] «Категория» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:129 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0764 | Web | feature:questions | select [onChange] «Статус вопроса» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:138 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0765 | Web | feature:questions | button [onClick] «Все вопросы» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:150 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0766 | Web | feature:questions | button [onClick] «Мои вопросы» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:153 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0767 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionCatalog.tsx:159 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0768 | Web | feature:questions | select [onChange] | apps/web-vite/src/features/questions/QuestionCatalog.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0769 | Web | feature:questions | button [onClick] «Сбросить фильтры» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0770 | Web | feature:questions | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/questions/QuestionCatalog.tsx:201 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0771 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionCatalog.tsx:227 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0772 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionCatalog.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0773 | Web | feature:questions | PrimaryButton [onClick] «Проверить снова» | apps/web-vite/src/features/questions/QuestionCreate.tsx:115 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0774 | Web | feature:questions | form [onSubmit] | apps/web-vite/src/features/questions/QuestionCreate.tsx:126 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0775 | Web | feature:questions | input [onChange] «Что вы хотите узнать?» | apps/web-vite/src/features/questions/QuestionCreate.tsx:130 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0776 | Web | feature:questions | textarea [onChange] «Опишите ситуацию и что уже пробовали» | apps/web-vite/src/features/questions/QuestionCreate.tsx:136 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0777 | Web | feature:questions | select [onChange] | apps/web-vite/src/features/questions/QuestionCreate.tsx:144 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0778 | Web | feature:questions | input [onChange] «щенок, прогулка, поводок» | apps/web-vite/src/features/questions/QuestionCreate.tsx:151 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0779 | Web | feature:questions | QuestionPhotoPicker [onChange] | apps/web-vite/src/features/questions/QuestionCreate.tsx:160 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0780 | Web | feature:questions | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/questions/QuestionDetails.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0781 | Web | feature:questions | PrimaryButton [onClick] «Ответить» | apps/web-vite/src/features/questions/QuestionDetails.tsx:266 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0782 | Web | feature:questions | button [onClick] «Поделиться вопросом» | apps/web-vite/src/features/questions/QuestionDetails.tsx:273 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0783 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionDetails.tsx:313 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0784 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionDetails.tsx:422 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0785 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionDetails.tsx:433 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0786 | Web | feature:questions | form [onSubmit] | apps/web-vite/src/features/questions/QuestionDetails.tsx:440 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0787 | Web | feature:questions | SecondaryButton [onClick] «Отменить ответ» | apps/web-vite/src/features/questions/QuestionDetails.tsx:448 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0788 | Web | feature:questions | textarea [onChange] «Поделитесь своим опытом или советом…» | apps/web-vite/src/features/questions/QuestionDetails.tsx:459 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0789 | Web | feature:questions | QuestionPhotoPicker [onChange] | apps/web-vite/src/features/questions/QuestionDetails.tsx:473 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0790 | Web | feature:questions | SecondaryButton [onClick] | apps/web-vite/src/features/questions/QuestionManagement.tsx:39 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0791 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionManagement.tsx:78 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0792 | Web | feature:questions | PurpleButton [onClick] «Редактировать вопрос» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0793 | Web | feature:questions | form [onSubmit] «Редактирование вопроса» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:166 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0794 | Web | feature:questions | input [onChange] | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0795 | Web | feature:questions | textarea [onChange] | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:178 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0796 | Web | feature:questions | select [onChange] | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:182 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0797 | Web | feature:questions | input [onChange] «щенок, прогулка, поводок» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:187 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0798 | Web | feature:questions | SecondaryButton [onClick] «Отцепить фото» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0799 | Web | feature:questions | QuestionPhotoPicker [onChange] | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:208 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0800 | Web | feature:questions | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:216 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0801 | Web | feature:questions | SecondaryButton [onClick] «Удалить вопрос» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:224 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0802 | Web | feature:questions | SecondaryButton [onClick] «Да, удалить вопрос» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:248 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0803 | Web | feature:questions | SecondaryButton [onClick] «Не удалять» | apps/web-vite/src/features/questions/QuestionOwnerControls.tsx:251 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0804 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:186 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0805 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0806 | Web | feature:questions | button [onClick] «Повторить» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:230 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0807 | Web | feature:questions | div [onClick] «Просмотр фотографий» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:233 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0808 | Web | feature:questions | button [onClick] «Закрыть просмотр» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0809 | Web | feature:questions | button [onClick] «Повторить загрузку» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:256 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0810 | Web | feature:questions | button [onClick] «Предыдущая фотография» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:281 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0811 | Web | feature:questions | button [onClick] «Следующая фотография» | apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx:286 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0812 | Web | feature:questions | SecondaryButton [onClick] | apps/web-vite/src/features/questions/QuestionPhotoPicker.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0813 | Web | feature:questions | SecondaryButton [onClick] | apps/web-vite/src/features/questions/QuestionPhotoPicker.tsx:169 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0814 | Web | feature:questions | input [onChange] «Выбрать фотографии» | apps/web-vite/src/features/questions/QuestionPhotoPicker.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0815 | Web | feature:questions | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/questions/QuestionReport.tsx:103 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0816 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionReport.tsx:67 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0817 | Web | feature:questions | form [onSubmit] | apps/web-vite/src/features/questions/QuestionReport.tsx:84 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0818 | Web | feature:questions | select [onChange] | apps/web-vite/src/features/questions/QuestionReport.tsx:87 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0819 | Web | feature:questions | textarea [onChange] | apps/web-vite/src/features/questions/QuestionReport.tsx:97 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0820 | Web | feature:questions | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/questions/QuestionThreadReplies.tsx:119 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0821 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionThreadReplies.tsx:165 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0822 | Web | feature:questions | PrimaryButton [onClick] | apps/web-vite/src/features/questions/QuestionThreadReplies.tsx:176 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0823 | Web | feature:questions | button [onClick] | apps/web-vite/src/features/questions/QuestionThreadReplies.tsx:96 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0824 | Web | feature:training | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:104 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0825 | Web | feature:training | button [onClick] «Назад» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:146 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0826 | Web | feature:training | button [onClick] «Далее» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:156 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0827 | Web | feature:training | form [onSubmit] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:175 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0828 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:180 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0829 | Web | feature:training | textarea [onChange] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:185 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0830 | Web | feature:training | PrimaryButton [onClick] «Проверить отзыв» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0831 | Web | feature:training | button [onClick] «Редактировать отзыв» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:309 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0832 | Web | feature:training | form [onSubmit] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0833 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:317 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0834 | Web | feature:training | textarea [onChange] | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:321 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0835 | Web | feature:training | SecondaryButton [onClick] «Отмена» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:327 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0836 | Web | feature:training | SecondaryButton [onClick] «Удалить отзыв» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:331 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0837 | Web | feature:training | PrimaryButton [onClick] «Проверить изменения отзыва» | apps/web-vite/src/features/training/CourseReviewsPanel.tsx:335 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0838 | Web | feature:training | PrimaryButton [onClick] | apps/web-vite/src/features/training/CourseShareButton.tsx:50 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0839 | Web | feature:training | input «Ссылка на курс» | apps/web-vite/src/features/training/CourseShareButton.tsx:61 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0840 | Web | feature:training | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/training/DiaryEditor.tsx:147 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0841 | Web | feature:training | form [onSubmit] «Дневник обучения» | apps/web-vite/src/features/training/DiaryEditor.tsx:163 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0842 | Web | feature:training | textarea [onChange] «Запись дневника» | apps/web-vite/src/features/training/DiaryEditor.tsx:169 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0843 | Web | feature:training | PrimaryButton [onClick] «Проверить состояние записи» | apps/web-vite/src/features/training/DiaryEditor.tsx:186 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0844 | Web | feature:training | PrimaryButton [onClick] «Повторить» | apps/web-vite/src/features/training/PaidTrainingPreview.tsx:63 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0845 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/PaidTrainingPreview.tsx:68 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0846 | Web | feature:training | a | apps/web-vite/src/features/training/SafeCourseDescriptionMarkdown.tsx:70 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0847 | Web | feature:training | input | apps/web-vite/src/features/training/SafeCourseDescriptionMarkdown.tsx:79 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0848 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingDayViewer.tsx:113 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0849 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingDayViewer.tsx:162 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0850 | Web | feature:training | a «Открыть PDF» | apps/web-vite/src/features/training/TrainingDayViewer.tsx:224 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0851 | Web | feature:training | button [onClick] «Я дочитал шаг» | apps/web-vite/src/features/training/TrainingDayViewer.tsx:246 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0852 | Web | feature:training | BackButton [onClick] «К списку блоков» | apps/web-vite/src/features/training/TrainingDayViewer.tsx:425 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0853 | Web | feature:training | button [onClick] «Повторить загрузку» | apps/web-vite/src/features/training/TrainingDayViewer.tsx:453 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0854 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingDayViewer.tsx:471 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0855 | Web | feature:training | button «Не подтверждена позиция шага» | apps/web-vite/src/features/training/TrainingDayViewer.tsx:550 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0856 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingDayViewer.tsx:559 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0857 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingExamStep.tsx:245 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0858 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingExamStep.tsx:270 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0859 | Web | feature:training | form [onSubmit] | apps/web-vite/src/features/training/TrainingExamStep.tsx:275 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0860 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingExamStep.tsx:286 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0861 | Web | feature:training | button [onClick] «Перепройти тест» | apps/web-vite/src/features/training/TrainingExamStep.tsx:305 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0862 | Web | feature:training | form [onSubmit] | apps/web-vite/src/features/training/TrainingExamStep.tsx:315 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0863 | Web | feature:training | textarea [onChange] «Напишите, что было полезным и о чём вы хотели бы спросить…» | apps/web-vite/src/features/training/TrainingExamStep.tsx:324 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0864 | Web | feature:training | form [onSubmit] | apps/web-vite/src/features/training/TrainingExamStep.tsx:339 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0865 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingExamStep.tsx:348 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0866 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingIndex.tsx:111 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0867 | Web | feature:training | section [onKeyDown] | apps/web-vite/src/features/training/TrainingIndex.tsx:121 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0868 | Web | feature:training | button [onClick] «Понятно» | apps/web-vite/src/features/training/TrainingIndex.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0869 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingIndex.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0870 | Web | feature:training | button [onClick] «Открыть шаги блока →» | apps/web-vite/src/features/training/TrainingIndex.tsx:177 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0871 | Web | feature:training | PrimaryButton [onClick] «Повторить загрузку» | apps/web-vite/src/features/training/TrainingIndex.tsx:314 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0872 | Web | feature:training | CaramelButton [onClick] «Изменить персонализацию» | apps/web-vite/src/features/training/TrainingIndex.tsx:340 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0873 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingIndex.tsx:352 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0874 | Web | feature:training | form [onSubmit] «Форма персонализации курса» | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0875 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0876 | Web | feature:training | select [onChange] | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0877 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:164 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0878 | Web | feature:training | select [onChange] | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:168 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0879 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:177 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0880 | Web | feature:training | button [onClick] «Проверить сохранение» | apps/web-vite/src/features/training/TrainingPersonalizationForm.tsx:186 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0881 | Web | feature:training | PrimaryButton [onClick] «Повторить чтение» | apps/web-vite/src/features/training/TrainingProgressConnected.tsx:425 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0882 | Web | feature:training | button [onClick] «Перечитать день» | apps/web-vite/src/features/training/TrainingProgressConnected.tsx:432 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0883 | Web | feature:training | PrimaryButton [onClick] «Я выполнил» | apps/web-vite/src/features/training/TrainingProgressConnected.tsx:491 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0884 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingProgressConnected.tsx:496 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0885 | Web | feature:training | button [onClick] «Обновить прогресс» | apps/web-vite/src/features/training/TrainingProgressConnected.tsx:507 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0886 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingStepImage.tsx:39 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0887 | Web | feature:training | button [onClick] «Закрыть изображение» | apps/web-vite/src/features/training/TrainingStepImage.tsx:53 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0888 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingStepUnlock.tsx:158 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0889 | Web | feature:training | PrimaryButton [onClick] | apps/web-vite/src/features/training/TrainingStepUnlock.tsx:168 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0890 | Web | feature:training | button [onClick] «Проверить доступ на сервере» | apps/web-vite/src/features/training/TrainingStepUnlock.tsx:173 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0891 | Web | feature:training | button [onClick] «Повторить видео» | apps/web-vite/src/features/training/TrainingStepVideo.tsx:383 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0892 | Web | feature:training | button [onClick] | apps/web-vite/src/features/training/TrainingStepVideo.tsx:386 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0893 | Web | feature:training | a «Открыть у видеохостинга» | apps/web-vite/src/features/training/TrainingStepVideo.tsx:400 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0894 | Web | feature:training | button [onClick] «Проверить анкету» | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:221 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0895 | Web | feature:training | form [onSubmit] «Анкета» | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:224 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0896 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:257 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0897 | Web | feature:training | textarea [onChange] | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:262 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0898 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:271 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0899 | Web | feature:training | input [onChange] | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:287 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0900 | Web | feature:training | button [onClick] «Проверить сохранение» | apps/web-vite/src/features/training/TrainingSurveyStep.tsx:311 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0901 | Web | feature:vk-consent | input [onChange] | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:101 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0902 | Web | feature:vk-consent | PrimaryButton [onClick] «Проверить статус вручную» | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:115 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0903 | Web | feature:vk-consent | button [onClick] «Согласия VK (макет)» | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:143 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0904 | Web | feature:vk-consent | BackButton [onClick] «К регистрации» | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0905 | Web | feature:vk-consent | PrimaryButton [onClick] «Повторить проверку» | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:81 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0906 | Web | feature:vk-consent | form [onSubmit] | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:86 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0907 | Web | feature:vk-consent | input [onChange] | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:95 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0908 | Web | feature:vk-consent | a | apps/web-vite/src/features/vk-consent/VkConsentOptIn.tsx:98 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0909 | Web | shared-or-app | SecondaryButton [onClick] «Выйти» | apps/web-vite/src/shared/auth/AuthPanel.tsx:39 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0910 | Web | shared-or-app | form [onSubmit] | apps/web-vite/src/shared/auth/AuthPanel.tsx:73 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0911 | Web | shared-or-app | input [onChange] «Имя пользователя» | apps/web-vite/src/shared/auth/AuthPanel.tsx:75 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0912 | Web | shared-or-app | PasswordVisibilityField [onChange] «Пароль» | apps/web-vite/src/shared/auth/AuthPanel.tsx:77 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0913 | Web | shared-or-app | button «Войти» | apps/web-vite/src/shared/auth/AuthPanel.tsx:84 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0914 | Web | shared-or-app | form [onSubmit] | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:126 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0915 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:128 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0916 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:131 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0917 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:135 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0918 | Web | shared-or-app | form [onSubmit] | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:35 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0919 | Web | shared-or-app | input [onChange] «Email» | apps/web-vite/src/shared/auth/PasswordRecovery.tsx:37 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0920 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/PasswordVisibilityField.tsx:19 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0921 | Web | shared-or-app | button [onClick] | apps/web-vite/src/shared/auth/PasswordVisibilityField.tsx:23 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0922 | Web | shared-or-app | form [onSubmit] | apps/web-vite/src/shared/auth/RegisterPanel.tsx:152 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0923 | Web | shared-or-app | input [onChange] «Имя пользователя» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:154 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0924 | Web | shared-or-app | input [onChange,onBlur] «email@example.com» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:160 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0925 | Web | shared-or-app | PrimaryButton [onClick] «Исправить» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:174 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0926 | Web | shared-or-app | input [onChange] «Промокод (необязательно)» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:181 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0927 | Web | shared-or-app | PrimaryButton [onClick] | apps/web-vite/src/shared/auth/RegisterPanel.tsx:191 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0928 | Web | shared-or-app | PasswordVisibilityField [onChange] «Пароль» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:197 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0929 | Web | shared-or-app | PasswordVisibilityField [onChange] «Повторите пароль» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:200 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0930 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/RegisterPanel.tsx:206 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0931 | Web | shared-or-app | a | apps/web-vite/src/shared/auth/RegisterPanel.tsx:215 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0932 | Web | shared-or-app | button [onClick] «Войти» | apps/web-vite/src/shared/auth/RegisterPanel.tsx:226 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0933 | Web | shared-or-app | form [onSubmit] | apps/web-vite/src/shared/auth/VkConsentWeb.tsx:66 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0934 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/VkConsentWeb.tsx:68 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0935 | Web | shared-or-app | a | apps/web-vite/src/shared/auth/VkConsentWeb.tsx:72 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0936 | Web | shared-or-app | input [onChange] | apps/web-vite/src/shared/auth/VkConsentWeb.tsx:76 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0937 | Web | shared-or-app | a [onClick] | apps/web-vite/src/shared/router/location.tsx:509 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0938 | Web | shared-or-app | button | apps/web-vite/src/shared/ui/BackButton.tsx:29 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0939 | Web | shared-or-app | button | apps/web-vite/src/shared/ui/Buttons.tsx:114 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0940 | Web | shared-or-app | button | apps/web-vite/src/shared/ui/Buttons.tsx:133 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0941 | Web | shared-or-app | button | apps/web-vite/src/shared/ui/Buttons.tsx:142 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0942 | Web | shared-or-app | a [onClick] | apps/web-vite/src/shared/ui/Buttons.tsx:41 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0943 | Web | shared-or-app | button | apps/web-vite/src/shared/ui/Buttons.tsx:72 | NOT RUN | NOT RUN | NOT RUN |
| UI-WEB-0944 | Web | shared-or-app | SecondaryButtonLink [onClick] «Отмена» | apps/web-vite/src/shared/ui/CancelNavigationLink.tsx:17 | NOT RUN | NOT RUN | NOT RUN |

Статических JSX кандидатов: 1347 ({"Admin":214,"Trainer":189,"Web":944}). Все NOT RUN. Элементы в сторонних UI-библиотеках, динамически генерируемые, API и Native Mobile этим сканером не обнаруживаются.

<!-- UI_CANDIDATES_END -->

<!-- API_CANDIDATES_BEGIN -->

## Статическая инвентаризация API

HTTP handlers из TypeScript AST. Относительные paths могут быть смонтированы под другими префиксами. Реальность endpoint, права доступа, тело, ответы, изменение БД и побочные эффекты требуют integration/API тестов. Ни один не проверен этим сканером.

| ID | Приложение | Метод | Относительный путь | Исходник | Integration/API | Статус |
|---|---|---|---|---|---|---|
| API-0001 | Backend | GET | /healthz | apps/api/src/chat2-v2-cloud-core.ts:48 | NOT RUN | NOT RUN |
| API-0002 | Backend | GET | /training-dates | apps/api/src/routes/v1/achievements.ts:48 | NOT RUN | NOT RUN |
| API-0003 | Backend | GET | / | apps/api/src/routes/v1/achievements.ts:63 | NOT RUN | NOT RUN |
| API-0004 | Backend | GET | /reengagement | apps/api/src/routes/v1/admin-analytics.ts:20 | NOT RUN | NOT RUN |
| API-0005 | Backend | GET | /rewarded-ads | apps/api/src/routes/v1/admin-analytics.ts:34 | NOT RUN | NOT RUN |
| API-0006 | Backend | GET | /preview | apps/api/src/routes/v1/admin-broadcasts.ts:33 | NOT RUN | NOT RUN |
| API-0007 | Backend | POST | / | apps/api/src/routes/v1/admin-broadcasts.ts:56 | NOT RUN | NOT RUN |
| API-0008 | Backend | GET | / | apps/api/src/routes/v1/admin-cache.ts:20 | NOT RUN | NOT RUN |
| API-0009 | Backend | POST | /courses/refresh | apps/api/src/routes/v1/admin-cache.ts:36 | NOT RUN | NOT RUN |
| API-0010 | Backend | DELETE | /:trainerId/day-offs/:dayOffId | apps/api/src/routes/v1/admin-consultation-schedules.ts:103 | NOT RUN | NOT RUN |
| API-0011 | Backend | POST | /:trainerId/exceptions | apps/api/src/routes/v1/admin-consultation-schedules.ts:117 | NOT RUN | NOT RUN |
| API-0012 | Backend | DELETE | /:trainerId/exceptions/:exceptionId | apps/api/src/routes/v1/admin-consultation-schedules.ts:131 | NOT RUN | NOT RUN |
| API-0013 | Backend | GET | /:trainerId | apps/api/src/routes/v1/admin-consultation-schedules.ts:56 | NOT RUN | NOT RUN |
| API-0014 | Backend | PUT | /:trainerId | apps/api/src/routes/v1/admin-consultation-schedules.ts:77 | NOT RUN | NOT RUN |
| API-0015 | Backend | POST | /:trainerId/day-offs | apps/api/src/routes/v1/admin-consultation-schedules.ts:90 | NOT RUN | NOT RUN |
| API-0016 | Backend | GET | / | apps/api/src/routes/v1/admin-feature-flags.ts:42 | NOT RUN | NOT RUN |
| API-0017 | Backend | PUT | / | apps/api/src/routes/v1/admin-feature-flags.ts:54 | NOT RUN | NOT RUN |
| API-0018 | Backend | POST | /legacy/import | apps/api/src/routes/v1/admin-gafus-operations.ts:100 | NOT RUN | NOT RUN |
| API-0019 | Backend | GET | /fraud | apps/api/src/routes/v1/admin-gafus-operations.ts:54 | NOT RUN | NOT RUN |
| API-0020 | Backend | POST | /fraud/:signalId/review | apps/api/src/routes/v1/admin-gafus-operations.ts:69 | NOT RUN | NOT RUN |
| API-0021 | Backend | GET | /legacy/preflight | apps/api/src/routes/v1/admin-gafus-operations.ts:89 | NOT RUN | NOT RUN |
| API-0022 | Backend | GET | / | apps/api/src/routes/v1/admin-mail.ts:13 | NOT RUN | NOT RUN |
| API-0023 | Backend | GET | /alerts | apps/api/src/routes/v1/admin-mail.ts:24 | NOT RUN | NOT RUN |
| API-0024 | Backend | GET | /stats | apps/api/src/routes/v1/admin-media.ts:9 | NOT RUN | NOT RUN |
| API-0025 | Backend | GET | /feed/reports | apps/api/src/routes/v1/admin-moderation.ts:42 | NOT RUN | NOT RUN |
| API-0026 | Backend | POST | /feed/reports/:reportId | apps/api/src/routes/v1/admin-moderation.ts:56 | NOT RUN | NOT RUN |
| API-0027 | Backend | GET | /questions/reports | apps/api/src/routes/v1/admin-moderation.ts:71 | NOT RUN | NOT RUN |
| API-0028 | Backend | POST | /questions/reports | apps/api/src/routes/v1/admin-moderation.ts:83 | NOT RUN | NOT RUN |
| API-0029 | Backend | DELETE | /questions/blocks/:userId | apps/api/src/routes/v1/admin-moderation.ts:96 | NOT RUN | NOT RUN |
| API-0030 | Backend | GET | / | apps/api/src/routes/v1/admin-partners.ts:29 | NOT RUN | NOT RUN |
| API-0031 | Backend | GET | /:partnerId | apps/api/src/routes/v1/admin-partners.ts:38 | NOT RUN | NOT RUN |
| API-0032 | Backend | POST | /:partnerId/mark-paid | apps/api/src/routes/v1/admin-partners.ts:52 | NOT RUN | NOT RUN |
| API-0033 | Backend | GET | / | apps/api/src/routes/v1/admin-profit.ts:55 | NOT RUN | NOT RUN |
| API-0034 | Backend | POST | /video-expenses | apps/api/src/routes/v1/admin-profit.ts:77 | NOT RUN | NOT RUN |
| API-0035 | Backend | POST | /video-expenses/cancel | apps/api/src/routes/v1/admin-profit.ts:92 | NOT RUN | NOT RUN |
| API-0036 | Backend | POST | /run | apps/api/src/routes/v1/admin-reengagement-trigger.ts:18 | NOT RUN | NOT RUN |
| API-0037 | Backend | GET | /subscriptions | apps/api/src/routes/v1/admin-settings.ts:35 | NOT RUN | NOT RUN |
| API-0038 | Backend | PUT | /subscriptions | apps/api/src/routes/v1/admin-settings.ts:59 | NOT RUN | NOT RUN |
| API-0039 | Backend | POST | /promo-codes | apps/api/src/routes/v1/admin-subscriptions.ts:119 | NOT RUN | NOT RUN |
| API-0040 | Backend | PATCH | /promo-codes/:id | apps/api/src/routes/v1/admin-subscriptions.ts:133 | NOT RUN | NOT RUN |
| API-0041 | Backend | DELETE | /promo-codes/:id | apps/api/src/routes/v1/admin-subscriptions.ts:149 | NOT RUN | NOT RUN |
| API-0042 | Backend | POST | /npd/:receiptId/retry | apps/api/src/routes/v1/admin-subscriptions.ts:163 | NOT RUN | NOT RUN |
| API-0043 | Backend | POST | /npd/:receiptId/reconcile | apps/api/src/routes/v1/admin-subscriptions.ts:181 | NOT RUN | NOT RUN |
| API-0044 | Backend | GET | / | apps/api/src/routes/v1/admin-subscriptions.ts:45 | NOT RUN | NOT RUN |
| API-0045 | Backend | DELETE | /:userId | apps/api/src/routes/v1/admin-users.ts:100 | NOT RUN | NOT RUN |
| API-0046 | Backend | GET | /:userId/app-subscription | apps/api/src/routes/v1/admin-users.ts:128 | NOT RUN | NOT RUN |
| API-0047 | Backend | POST | /:userId/app-subscription | apps/api/src/routes/v1/admin-users.ts:146 | NOT RUN | NOT RUN |
| API-0048 | Backend | GET | / | apps/api/src/routes/v1/admin-users.ts:22 | NOT RUN | NOT RUN |
| API-0049 | Backend | PATCH | /:userId | apps/api/src/routes/v1/admin-users.ts:74 | NOT RUN | NOT RUN |
| API-0050 | Backend | GET | /offer | apps/api/src/routes/v1/app-subscription.ts:107 | NOT RUN | NOT RUN |
| API-0051 | Backend | POST | /promo-code/preview | apps/api/src/routes/v1/app-subscription.ts:119 | NOT RUN | NOT RUN |
| API-0052 | Backend | POST | /yookassa/start | apps/api/src/routes/v1/app-subscription.ts:149 | NOT RUN | NOT RUN |
| API-0053 | Backend | POST | /yookassa/cancel | apps/api/src/routes/v1/app-subscription.ts:228 | NOT RUN | NOT RUN |
| API-0054 | Backend | POST | /apple/verify | apps/api/src/routes/v1/app-subscription.ts:250 | NOT RUN | NOT RUN |
| API-0055 | Backend | POST | /apple/restore | apps/api/src/routes/v1/app-subscription.ts:262 | NOT RUN | NOT RUN |
| API-0056 | Backend | GET | /status | apps/api/src/routes/v1/app-subscription.ts:94 | NOT RUN | NOT RUN |
| API-0057 | Backend | POST | /:slug/view | apps/api/src/routes/v1/articles.ts:104 | NOT RUN | NOT RUN |
| API-0058 | Backend | GET | /:slug | apps/api/src/routes/v1/articles.ts:131 | NOT RUN | NOT RUN |
| API-0059 | Backend | GET | / | apps/api/src/routes/v1/articles.ts:42 | NOT RUN | NOT RUN |
| API-0060 | Backend | POST | /:id/like | apps/api/src/routes/v1/articles.ts:64 | NOT RUN | NOT RUN |
| API-0061 | Backend | POST | /start | apps/api/src/routes/v1/auth-vk-web.ts:127 | NOT RUN | NOT RUN |
| API-0062 | Backend | GET | /callback | apps/api/src/routes/v1/auth-vk-web.ts:157 | NOT RUN | NOT RUN |
| API-0063 | Backend | GET | /consent | apps/api/src/routes/v1/auth-vk-web.ts:195 | NOT RUN | NOT RUN |
| API-0064 | Backend | POST | /consent | apps/api/src/routes/v1/auth-vk-web.ts:207 | NOT RUN | NOT RUN |
| API-0065 | Backend | POST | /set-password | apps/api/src/routes/v1/auth.ts:1012 | NOT RUN | NOT RUN |
| API-0066 | Backend | POST | /change-password | apps/api/src/routes/v1/auth.ts:1047 | NOT RUN | NOT RUN |
| API-0067 | Backend | GET | /username-available | apps/api/src/routes/v1/auth.ts:1094 | NOT RUN | NOT RUN |
| API-0068 | Backend | POST | /username-change | apps/api/src/routes/v1/auth.ts:1119 | NOT RUN | NOT RUN |
| API-0069 | Backend | POST | /login | apps/api/src/routes/v1/auth.ts:175 | NOT RUN | NOT RUN |
| API-0070 | Backend | POST | /register | apps/api/src/routes/v1/auth.ts:238 | NOT RUN | NOT RUN |
| API-0071 | Backend | POST | /registration-promo-preview | apps/api/src/routes/v1/auth.ts:334 | NOT RUN | NOT RUN |
| API-0072 | Backend | GET | /me | apps/api/src/routes/v1/auth.ts:350 | NOT RUN | NOT RUN |
| API-0073 | Backend | POST | /refresh | apps/api/src/routes/v1/auth.ts:358 | NOT RUN | NOT RUN |
| API-0074 | Backend | POST | /logout | apps/api/src/routes/v1/auth.ts:449 | NOT RUN | NOT RUN |
| API-0075 | Backend | POST | /logout-all | apps/api/src/routes/v1/auth.ts:485 | NOT RUN | NOT RUN |
| API-0076 | Backend | POST | /check-phone-match | apps/api/src/routes/v1/auth.ts:500 | NOT RUN | NOT RUN |
| API-0077 | Backend | POST | /password-reset-request | apps/api/src/routes/v1/auth.ts:512 | NOT RUN | NOT RUN |
| API-0078 | Backend | POST | /reset-password | apps/api/src/routes/v1/auth.ts:536 | NOT RUN | NOT RUN |
| API-0079 | Backend | POST | /email-change-request | apps/api/src/routes/v1/auth.ts:564 | NOT RUN | NOT RUN |
| API-0080 | Backend | POST | /email-change-confirm | apps/api/src/routes/v1/auth.ts:607 | NOT RUN | NOT RUN |
| API-0081 | Backend | GET | /vk-consent/:contextToken | apps/api/src/routes/v1/auth.ts:668 | NOT RUN | NOT RUN |
| API-0082 | Backend | POST | /vk | apps/api/src/routes/v1/auth.ts:695 | NOT RUN | NOT RUN |
| API-0083 | Backend | POST | /vk-consent | apps/api/src/routes/v1/auth.ts:819 | NOT RUN | NOT RUN |
| API-0084 | Backend | POST | /vk-phone-set | apps/api/src/routes/v1/auth.ts:913 | NOT RUN | NOT RUN |
| API-0085 | Backend | POST | /vk-link | apps/api/src/routes/v1/auth.ts:940 | NOT RUN | NOT RUN |
| API-0086 | Backend | GET | /discover | apps/api/src/routes/v1/chats.ts:104 | NOT RUN | NOT RUN |
| API-0087 | Backend | POST | /direct | apps/api/src/routes/v1/chats.ts:110 | NOT RUN | NOT RUN |
| API-0088 | Backend | POST | /cynologist | apps/api/src/routes/v1/chats.ts:133 | NOT RUN | NOT RUN |
| API-0089 | Backend | POST | /community | apps/api/src/routes/v1/chats.ts:134 | NOT RUN | NOT RUN |
| API-0090 | Backend | GET | /courses | apps/api/src/routes/v1/chats.ts:135 | NOT RUN | NOT RUN |
| API-0091 | Backend | POST | /courses/:courseId | apps/api/src/routes/v1/chats.ts:136 | NOT RUN | NOT RUN |
| API-0092 | Backend | POST | /groups | apps/api/src/routes/v1/chats.ts:139 | NOT RUN | NOT RUN |
| API-0093 | Backend | POST | /block | apps/api/src/routes/v1/chats.ts:142 | NOT RUN | NOT RUN |
| API-0094 | Backend | GET | /:id | apps/api/src/routes/v1/chats.ts:149 | NOT RUN | NOT RUN |
| API-0095 | Backend | GET | /:id/messages | apps/api/src/routes/v1/chats.ts:152 | NOT RUN | NOT RUN |
| API-0096 | Backend | POST | /:id/messages | apps/api/src/routes/v1/chats.ts:168 | NOT RUN | NOT RUN |
| API-0097 | Backend | PATCH | /:id/messages/:messageId | apps/api/src/routes/v1/chats.ts:174 | NOT RUN | NOT RUN |
| API-0098 | Backend | DELETE | /:id/messages/:messageId | apps/api/src/routes/v1/chats.ts:190 | NOT RUN | NOT RUN |
| API-0099 | Backend | POST | /:id/read | apps/api/src/routes/v1/chats.ts:201 | NOT RUN | NOT RUN |
| API-0100 | Backend | POST | /:id/media/v2/reserve | apps/api/src/routes/v1/chats.ts:211 | NOT RUN | NOT RUN |
| API-0101 | Backend | POST | /:id/media/v2/:mediaId/confirm | apps/api/src/routes/v1/chats.ts:216 | NOT RUN | NOT RUN |
| API-0102 | Backend | GET | /:id/media/v2/:mediaId | apps/api/src/routes/v1/chats.ts:219 | NOT RUN | NOT RUN |
| API-0103 | Backend | POST | /:id/media/v2/:mediaId/attach | apps/api/src/routes/v1/chats.ts:223 | NOT RUN | NOT RUN |
| API-0104 | Backend | POST | /:id/attachments | apps/api/src/routes/v1/chats.ts:227 | NOT RUN | NOT RUN |
| API-0105 | Backend | GET | /:id/attachments/:attachmentId | apps/api/src/routes/v1/chats.ts:261 | NOT RUN | NOT RUN |
| API-0106 | Backend | DELETE | /:id/attachments/:attachmentId | apps/api/src/routes/v1/chats.ts:272 | NOT RUN | NOT RUN |
| API-0107 | Backend | POST | /:id/join | apps/api/src/routes/v1/chats.ts:283 | NOT RUN | NOT RUN |
| API-0108 | Backend | POST | /:id/leave | apps/api/src/routes/v1/chats.ts:286 | NOT RUN | NOT RUN |
| API-0109 | Backend | POST | /:id/invite | apps/api/src/routes/v1/chats.ts:289 | NOT RUN | NOT RUN |
| API-0110 | Backend | POST | /:id/avatar | apps/api/src/routes/v1/chats.ts:297 | NOT RUN | NOT RUN |
| API-0111 | Backend | DELETE | /:id/avatar | apps/api/src/routes/v1/chats.ts:315 | NOT RUN | NOT RUN |
| API-0112 | Backend | PATCH | /:id/group | apps/api/src/routes/v1/chats.ts:318 | NOT RUN | NOT RUN |
| API-0113 | Backend | POST | /:id/moderate | apps/api/src/routes/v1/chats.ts:330 | NOT RUN | NOT RUN |
| API-0114 | Backend | POST | /:id/transfer-owner | apps/api/src/routes/v1/chats.ts:339 | NOT RUN | NOT RUN |
| API-0115 | Backend | POST | /:id/mute | apps/api/src/routes/v1/chats.ts:346 | NOT RUN | NOT RUN |
| API-0116 | Backend | POST | /:id/messages/:messageId/report | apps/api/src/routes/v1/chats.ts:354 | NOT RUN | NOT RUN |
| API-0117 | Backend | GET | /moderation/reports | apps/api/src/routes/v1/chats.ts:375 | NOT RUN | NOT RUN |
| API-0118 | Backend | POST | /moderation/reports/:reportId/resolve | apps/api/src/routes/v1/chats.ts:378 | NOT RUN | NOT RUN |
| API-0119 | Backend | GET | /:id/reports | apps/api/src/routes/v1/chats.ts:388 | NOT RUN | NOT RUN |
| API-0120 | Backend | POST | /:id/reports/:reportId/resolve | apps/api/src/routes/v1/chats.ts:391 | NOT RUN | NOT RUN |
| API-0121 | Backend | GET | / | apps/api/src/routes/v1/chats.ts:81 | NOT RUN | NOT RUN |
| API-0122 | Backend | GET | /realtime/connect | apps/api/src/routes/v1/chats.ts:82 | NOT RUN | NOT RUN |
| API-0123 | Backend | GET | /:id/realtime | apps/api/src/routes/v1/chats.ts:83 | NOT RUN | NOT RUN |
| API-0124 | Backend | GET | /users | apps/api/src/routes/v1/chats.ts:86 | NOT RUN | NOT RUN |
| API-0125 | Backend | POST | /bookings/:bookingId/voximplant/prepare | apps/api/src/routes/v1/consultations.ts:186 | NOT RUN | NOT RUN |
| API-0126 | Backend | POST | /bookings/:bookingId/voximplant/admission | apps/api/src/routes/v1/consultations.ts:197 | NOT RUN | NOT RUN |
| API-0127 | Backend | POST | /bookings/:bookingId/voximplant/sign | apps/api/src/routes/v1/consultations.ts:207 | NOT RUN | NOT RUN |
| API-0128 | Backend | GET | /cynologists | apps/api/src/routes/v1/consultations.ts:231 | NOT RUN | NOT RUN |
| API-0129 | Backend | GET | /cynologists/:cynologistUserId/slots/:slotId/verify | apps/api/src/routes/v1/consultations.ts:243 | NOT RUN | NOT RUN |
| API-0130 | Backend | GET | /cynologists/:cynologistUserId/slots | apps/api/src/routes/v1/consultations.ts:258 | NOT RUN | NOT RUN |
| API-0131 | Backend | POST | /book/lookup | apps/api/src/routes/v1/consultations.ts:298 | NOT RUN | NOT RUN |
| API-0132 | Backend | POST | /book | apps/api/src/routes/v1/consultations.ts:316 | NOT RUN | NOT RUN |
| API-0133 | Backend | GET | /my | apps/api/src/routes/v1/consultations.ts:338 | NOT RUN | NOT RUN |
| API-0134 | Backend | POST | /bookings/:bookingId/cancel | apps/api/src/routes/v1/consultations.ts:349 | NOT RUN | NOT RUN |
| API-0135 | Backend | GET | /trainer/bookings | apps/api/src/routes/v1/consultations.ts:364 | NOT RUN | NOT RUN |
| API-0136 | Backend | POST | /trainer/bookings/:bookingId/confirm | apps/api/src/routes/v1/consultations.ts:374 | NOT RUN | NOT RUN |
| API-0137 | Backend | POST | /trainer/bookings/:bookingId/complete | apps/api/src/routes/v1/consultations.ts:389 | NOT RUN | NOT RUN |
| API-0138 | Backend | POST | /trainer/bookings/:bookingId/no-show | apps/api/src/routes/v1/consultations.ts:404 | NOT RUN | NOT RUN |
| API-0139 | Backend | POST | /trainer/bookings/:bookingId/reject | apps/api/src/routes/v1/consultations.ts:419 | NOT RUN | NOT RUN |
| API-0140 | Backend | GET | /trainer/availability | apps/api/src/routes/v1/consultations.ts:436 | NOT RUN | NOT RUN |
| API-0141 | Backend | PUT | /trainer/availability | apps/api/src/routes/v1/consultations.ts:446 | NOT RUN | NOT RUN |
| API-0142 | Backend | POST | /trainer/day-offs | apps/api/src/routes/v1/consultations.ts:462 | NOT RUN | NOT RUN |
| API-0143 | Backend | DELETE | /trainer/day-offs/:dayOffId | apps/api/src/routes/v1/consultations.ts:478 | NOT RUN | NOT RUN |
| API-0144 | Backend | POST | /trainer/exceptions | apps/api/src/routes/v1/consultations.ts:493 | NOT RUN | NOT RUN |
| API-0145 | Backend | DELETE | /trainer/exceptions/:exceptionId | apps/api/src/routes/v1/consultations.ts:509 | NOT RUN | NOT RUN |
| API-0146 | Backend | GET | /admin/cynologists | apps/api/src/routes/v1/consultations.ts:524 | NOT RUN | NOT RUN |
| API-0147 | Backend | PUT | /admin/cynologists/listed | apps/api/src/routes/v1/consultations.ts:533 | NOT RUN | NOT RUN |
| API-0148 | Backend | GET | /admin/bookings | apps/api/src/routes/v1/consultations.ts:549 | NOT RUN | NOT RUN |
| API-0149 | Backend | POST | /favorites | apps/api/src/routes/v1/courses.ts:113 | NOT RUN | NOT RUN |
| API-0150 | Backend | POST | /personalization | apps/api/src/routes/v1/courses.ts:146 | NOT RUN | NOT RUN |
| API-0151 | Backend | GET | /metadata | apps/api/src/routes/v1/courses.ts:177 | NOT RUN | NOT RUN |
| API-0152 | Backend | GET | /reviews | apps/api/src/routes/v1/courses.ts:215 | NOT RUN | NOT RUN |
| API-0153 | Backend | GET | / | apps/api/src/routes/v1/courses.ts:24 | NOT RUN | NOT RUN |
| API-0154 | Backend | POST | /reviews | apps/api/src/routes/v1/courses.ts:245 | NOT RUN | NOT RUN |
| API-0155 | Backend | PATCH | /reviews | apps/api/src/routes/v1/courses.ts:277 | NOT RUN | NOT RUN |
| API-0156 | Backend | DELETE | /reviews | apps/api/src/routes/v1/courses.ts:306 | NOT RUN | NOT RUN |
| API-0157 | Backend | GET | /access | apps/api/src/routes/v1/courses.ts:63 | NOT RUN | NOT RUN |
| API-0158 | Backend | GET | /favorites | apps/api/src/routes/v1/courses.ts:94 | NOT RUN | NOT RUN |
| API-0159 | Backend | POST | / | apps/api/src/routes/v1/cynologist-chat.ts:20 | NOT RUN | NOT RUN |
| API-0160 | Backend | GET | /today | apps/api/src/routes/v1/daily-course.ts:103 | NOT RUN | NOT RUN |
| API-0161 | Backend | GET | /day | apps/api/src/routes/v1/daily-course.ts:116 | NOT RUN | NOT RUN |
| API-0162 | Backend | POST | /step/start | apps/api/src/routes/v1/daily-course.ts:155 | NOT RUN | NOT RUN |
| API-0163 | Backend | POST | /step/pause | apps/api/src/routes/v1/daily-course.ts:182 | NOT RUN | NOT RUN |
| API-0164 | Backend | POST | /step/resume | apps/api/src/routes/v1/daily-course.ts:209 | NOT RUN | NOT RUN |
| API-0165 | Backend | POST | /step/reset | apps/api/src/routes/v1/daily-course.ts:233 | NOT RUN | NOT RUN |
| API-0166 | Backend | POST | /step/complete | apps/api/src/routes/v1/daily-course.ts:257 | NOT RUN | NOT RUN |
| API-0167 | Backend | POST | /submit | apps/api/src/routes/v1/exam.ts:123 | NOT RUN | NOT RUN |
| API-0168 | Backend | POST | /upload-video | apps/api/src/routes/v1/exam.ts:167 | NOT RUN | NOT RUN |
| API-0169 | Backend | GET | /result | apps/api/src/routes/v1/exam.ts:78 | NOT RUN | NOT RUN |
| API-0170 | Backend | POST | /apple/token/initialize | apps/api/src/routes/v1/g1-apple-token-initialization.review.ts:17 | NOT RUN | NOT RUN |
| API-0171 | Backend | POST | /create/lookup | apps/api/src/routes/v1/g1-reminder-create-lookup.review.ts:15 | NOT RUN | NOT RUN |
| API-0172 | Backend | GET | /operations/:idempotencyKey | apps/api/src/routes/v1/g1-reminder-operation-lookupAG4.review.ts:8 | NOT RUN | NOT RUN |
| API-0173 | Backend | PUT | /:id | apps/api/src/routes/v1/g1-reminder-private-error-log.candidate.review.ts:121 | NOT RUN | NOT RUN |
| API-0174 | Backend | DELETE | /:id | apps/api/src/routes/v1/g1-reminder-private-error-log.candidate.review.ts:147 | NOT RUN | NOT RUN |
| API-0175 | Backend | GET | / | apps/api/src/routes/v1/g1-reminder-private-error-log.candidate.review.ts:65 | NOT RUN | NOT RUN |
| API-0176 | Backend | POST | / | apps/api/src/routes/v1/g1-reminder-private-error-log.candidate.review.ts:76 | NOT RUN | NOT RUN |
| API-0177 | Backend | PUT | /:id | apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts:122 | NOT RUN | NOT RUN |
| API-0178 | Backend | DELETE | /:id | apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts:148 | NOT RUN | NOT RUN |
| API-0179 | Backend | GET | / | apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts:66 | NOT RUN | NOT RUN |
| API-0180 | Backend | POST | / | apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts:77 | NOT RUN | NOT RUN |
| API-0181 | Backend | GET | /:petId/vet-visits/:visitId | apps/api/src/routes/v1/g1-vet-visits-detail.review.ts:8 | NOT RUN | NOT RUN |
| API-0182 | Backend | GET | /dashboard | apps/api/src/routes/v1/gafus-admin.ts:66 | NOT RUN | NOT RUN |
| API-0183 | Backend | PATCH | /settings | apps/api/src/routes/v1/gafus-admin.ts:75 | NOT RUN | NOT RUN |
| API-0184 | Backend | POST | /adjust | apps/api/src/routes/v1/gafus-admin.ts:90 | NOT RUN | NOT RUN |
| API-0185 | Backend | POST | /unlock | apps/api/src/routes/v1/gafus.ts:112 | NOT RUN | NOT RUN |
| API-0186 | Backend | GET | /reaction-progress/:postId | apps/api/src/routes/v1/gafus.ts:129 | NOT RUN | NOT RUN |
| API-0187 | Backend | GET | /mini-guides | apps/api/src/routes/v1/gafus.ts:141 | NOT RUN | NOT RUN |
| API-0188 | Backend | GET | /mini-guide/:courseId | apps/api/src/routes/v1/gafus.ts:150 | NOT RUN | NOT RUN |
| API-0189 | Backend | GET | /status | apps/api/src/routes/v1/gafus.ts:78 | NOT RUN | NOT RUN |
| API-0190 | Backend | GET | /history | apps/api/src/routes/v1/gafus.ts:88 | NOT RUN | NOT RUN |
| API-0191 | Backend | GET | /health | apps/api/src/routes/v1/health.ts:22 | NOT RUN | NOT RUN |
| API-0192 | Backend | GET | /ready | apps/api/src/routes/v1/health.ts:30 | NOT RUN | NOT RUN |
| API-0193 | Backend | GET | /metrics/course-cache | apps/api/src/routes/v1/health.ts:42 | NOT RUN | NOT RUN |
| API-0194 | Backend | GET | / | apps/api/src/routes/v1/media-cdn-probe.ts:11 | NOT RUN | NOT RUN |
| API-0195 | Backend | GET | /status | apps/api/src/routes/v1/media-delivery.ts:10 | NOT RUN | NOT RUN |
| API-0196 | Backend | POST | /events | apps/api/src/routes/v1/mobile-intro.ts:47 | NOT RUN | NOT RUN |
| API-0197 | Backend | POST | /auth-outcome | apps/api/src/routes/v1/mobile-intro.ts:53 | NOT RUN | NOT RUN |
| API-0198 | Backend | GET | /admin/report | apps/api/src/routes/v1/mobile-intro.ts:64 | NOT RUN | NOT RUN |
| API-0199 | Backend | GET | /student | apps/api/src/routes/v1/notes.ts:18 | NOT RUN | NOT RUN |
| API-0200 | Backend | POST | /mutations | apps/api/src/routes/v1/offline.ts:244 | NOT RUN | NOT RUN |
| API-0201 | Backend | GET | /mutations/:eventId | apps/api/src/routes/v1/offline.ts:304 | NOT RUN | NOT RUN |
| API-0202 | Backend | GET | /course/version | apps/api/src/routes/v1/offline.ts:34 | NOT RUN | NOT RUN |
| API-0203 | Backend | GET | /course/updates | apps/api/src/routes/v1/offline.ts:57 | NOT RUN | NOT RUN |
| API-0204 | Backend | GET | /course/download | apps/api/src/routes/v1/offline.ts:85 | NOT RUN | NOT RUN |
| API-0205 | Backend | GET | /me | apps/api/src/routes/v1/partners.ts:29 | NOT RUN | NOT RUN |
| API-0206 | Backend | POST | /attribution | apps/api/src/routes/v1/partners.ts:47 | NOT RUN | NOT RUN |
| API-0207 | Backend | POST | /payouts | apps/api/src/routes/v1/partners.ts:53 | NOT RUN | NOT RUN |
| API-0208 | Backend | POST | /api/v1/payments/webhook | apps/api/src/routes/v1/payment-provider-webhooks.ts:35 | NOT RUN | NOT RUN |
| API-0209 | Backend | POST | /api/v1/app-subscription/apple/notifications | apps/api/src/routes/v1/payment-provider-webhooks.ts:89 | NOT RUN | NOT RUN |
| API-0210 | Backend | POST | /create | apps/api/src/routes/v1/payments.ts:14 | NOT RUN | NOT RUN |
| API-0211 | Backend | POST | /apple/verify | apps/api/src/routes/v1/payments.ts:15 | NOT RUN | NOT RUN |
| API-0212 | Backend | GET | /apple/course-metadata | apps/api/src/routes/v1/payments.ts:16 | NOT RUN | NOT RUN |
| API-0213 | Backend | DELETE | /:petId/prevention/:entryId | apps/api/src/routes/v1/pet-prevention.ts:117 | NOT RUN | NOT RUN |
| API-0214 | Backend | GET | /:petId/prevention | apps/api/src/routes/v1/pet-prevention.ts:22 | NOT RUN | NOT RUN |
| API-0215 | Backend | POST | /:petId/prevention | apps/api/src/routes/v1/pet-prevention.ts:41 | NOT RUN | NOT RUN |
| API-0216 | Backend | POST | /:petId/prevention/batch | apps/api/src/routes/v1/pet-prevention.ts:65 | NOT RUN | NOT RUN |
| API-0217 | Backend | PUT | /:petId/prevention/:entryId | apps/api/src/routes/v1/pet-prevention.ts:92 | NOT RUN | NOT RUN |
| API-0218 | Backend | ALL | /:petId/vet-visits | apps/api/src/routes/v1/pet-vet-visits.ts:5 | NOT RUN | NOT RUN |
| API-0219 | Backend | ALL | /:petId/vet-visits/* | apps/api/src/routes/v1/pet-vet-visits.ts:8 | NOT RUN | NOT RUN |
| API-0220 | Backend | GET | / | apps/api/src/routes/v1/pets.ts:199 | NOT RUN | NOT RUN |
| API-0221 | Backend | POST | / | apps/api/src/routes/v1/pets.ts:216 | NOT RUN | NOT RUN |
| API-0222 | Backend | GET | /:petId/weight | apps/api/src/routes/v1/pets.ts:295 | NOT RUN | NOT RUN |
| API-0223 | Backend | POST | /:petId/weight | apps/api/src/routes/v1/pets.ts:303 | NOT RUN | NOT RUN |
| API-0224 | Backend | DELETE | /:petId/weight/:entryId | apps/api/src/routes/v1/pets.ts:320 | NOT RUN | NOT RUN |
| API-0225 | Backend | PUT | /:petId/weight/target | apps/api/src/routes/v1/pets.ts:328 | NOT RUN | NOT RUN |
| API-0226 | Backend | GET | /:petId | apps/api/src/routes/v1/pets.ts:341 | NOT RUN | NOT RUN |
| API-0227 | Backend | POST | /:petId/photo | apps/api/src/routes/v1/pets.ts:366 | NOT RUN | NOT RUN |
| API-0228 | Backend | GET | /:petId/documents | apps/api/src/routes/v1/pets.ts:436 | NOT RUN | NOT RUN |
| API-0229 | Backend | POST | /:petId/documents | apps/api/src/routes/v1/pets.ts:456 | NOT RUN | NOT RUN |
| API-0230 | Backend | DELETE | /:petId/documents/:documentId | apps/api/src/routes/v1/pets.ts:504 | NOT RUN | NOT RUN |
| API-0231 | Backend | PUT | /:petId/documents/:documentId | apps/api/src/routes/v1/pets.ts:528 | NOT RUN | NOT RUN |
| API-0232 | Backend | GET | /:petId/documents/:documentId/download | apps/api/src/routes/v1/pets.ts:536 | NOT RUN | NOT RUN |
| API-0233 | Backend | PUT | /:petId | apps/api/src/routes/v1/pets.ts:563 | NOT RUN | NOT RUN |
| API-0234 | Backend | DELETE | /:petId | apps/api/src/routes/v1/pets.ts:591 | NOT RUN | NOT RUN |
| API-0235 | Backend | GET | / | apps/api/src/routes/v1/public-articles.ts:17 | NOT RUN | NOT RUN |
| API-0236 | Backend | GET | /:slug | apps/api/src/routes/v1/public-articles.ts:34 | NOT RUN | NOT RUN |
| API-0237 | Backend | POST | /:slug/view | apps/api/src/routes/v1/public-articles.ts:61 | NOT RUN | NOT RUN |
| API-0238 | Backend | GET | / | apps/api/src/routes/v1/public-courses.ts:16 | NOT RUN | NOT RUN |
| API-0239 | Backend | GET | /mobile-app | apps/api/src/routes/v1/public-mobile.ts:14 | NOT RUN | NOT RUN |
| API-0240 | Backend | GET | /:courseType | apps/api/src/routes/v1/public-paid-course-outline.ts:14 | NOT RUN | NOT RUN |
| API-0241 | Backend | GET | / | apps/api/src/routes/v1/public-stats.ts:14 | NOT RUN | NOT RUN |
| API-0242 | Backend | POST | /photos/reservations | apps/api/src/routes/v1/questions.ts:32 | NOT RUN | NOT RUN |
| API-0243 | Backend | POST | /photos/:id/confirm | apps/api/src/routes/v1/questions.ts:37 | NOT RUN | NOT RUN |
| API-0244 | Backend | GET | /photos/:id/status | apps/api/src/routes/v1/questions.ts:42 | NOT RUN | NOT RUN |
| API-0245 | Backend | DELETE | /photos/:id | apps/api/src/routes/v1/questions.ts:47 | NOT RUN | NOT RUN |
| API-0246 | Backend | POST | /photos | apps/api/src/routes/v1/questions.ts:53 | NOT RUN | NOT RUN |
| API-0247 | Backend | PUT | /:id | apps/api/src/routes/v1/reminders.ts:121 | NOT RUN | NOT RUN |
| API-0248 | Backend | DELETE | /:id | apps/api/src/routes/v1/reminders.ts:147 | NOT RUN | NOT RUN |
| API-0249 | Backend | GET | / | apps/api/src/routes/v1/reminders.ts:65 | NOT RUN | NOT RUN |
| API-0250 | Backend | POST | / | apps/api/src/routes/v1/reminders.ts:76 | NOT RUN | NOT RUN |
| API-0251 | Backend | GET | /status | apps/api/src/routes/v1/rewarded-ads.ts:156 | NOT RUN | NOT RUN |
| API-0252 | Backend | POST | /session | apps/api/src/routes/v1/rewarded-ads.ts:175 | NOT RUN | NOT RUN |
| API-0253 | Backend | POST | /events | apps/api/src/routes/v1/rewarded-ads.ts:194 | NOT RUN | NOT RUN |
| API-0254 | Backend | POST | /grant | apps/api/src/routes/v1/rewarded-ads.ts:213 | NOT RUN | NOT RUN |
| API-0255 | Backend | POST | /push | apps/api/src/routes/v1/subscriptions.ts:110 | NOT RUN | NOT RUN |
| API-0256 | Backend | POST | /push/device-status | apps/api/src/routes/v1/subscriptions.ts:135 | NOT RUN | NOT RUN |
| API-0257 | Backend | DELETE | /push | apps/api/src/routes/v1/subscriptions.ts:151 | NOT RUN | NOT RUN |
| API-0258 | Backend | GET | /push/public-key | apps/api/src/routes/v1/subscriptions.ts:88 | NOT RUN | NOT RUN |
| API-0259 | Backend | GET | /push | apps/api/src/routes/v1/subscriptions.ts:99 | NOT RUN | NOT RUN |
| API-0260 | Backend | POST | /:slug/response | apps/api/src/routes/v1/surveys.ts:124 | NOT RUN | NOT RUN |
| API-0261 | Backend | GET | /comparison | apps/api/src/routes/v1/surveys.ts:83 | NOT RUN | NOT RUN |
| API-0262 | Backend | GET | /:slug | apps/api/src/routes/v1/surveys.ts:98 | NOT RUN | NOT RUN |
| API-0263 | Backend | GET | /:id | apps/api/src/routes/v1/trainer-articles-manage.ts:55 | NOT RUN | NOT RUN |
| API-0264 | Backend | PUT | /:id | apps/api/src/routes/v1/trainer-articles-manage.ts:77 | NOT RUN | NOT RUN |
| API-0265 | Backend | DELETE | /:id | apps/api/src/routes/v1/trainer-articles-manage.ts:96 | NOT RUN | NOT RUN |
| API-0266 | Backend | GET | /own-summary | apps/api/src/routes/v1/trainer-articles-own-summary.ts:7 | NOT RUN | NOT RUN |
| API-0267 | Backend | POST | /courses | apps/api/src/routes/v1/trainer-authoring.ts:111 | NOT RUN | NOT RUN |
| API-0268 | Backend | POST | /articles | apps/api/src/routes/v1/trainer-authoring.ts:139 | NOT RUN | NOT RUN |
| API-0269 | Backend | POST | /days | apps/api/src/routes/v1/trainer-authoring.ts:157 | NOT RUN | NOT RUN |
| API-0270 | Backend | POST | /steps | apps/api/src/routes/v1/trainer-authoring.ts:94 | NOT RUN | NOT RUN |
| API-0271 | Backend | PUT | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:105 | NOT RUN | NOT RUN |
| API-0272 | Backend | DELETE | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:119 | NOT RUN | NOT RUN |
| API-0273 | Backend | GET | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:135 | NOT RUN | NOT RUN |
| API-0274 | Backend | PUT | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:154 | NOT RUN | NOT RUN |
| API-0275 | Backend | DELETE | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:172 | NOT RUN | NOT RUN |
| API-0276 | Backend | GET | /:id | apps/api/src/routes/v1/trainer-content-manage.ts:93 | NOT RUN | NOT RUN |
| API-0277 | Backend | DELETE | /:id | apps/api/src/routes/v1/trainer-course-full-manage.ts:110 | NOT RUN | NOT RUN |
| API-0278 | Backend | PUT | /:id | apps/api/src/routes/v1/trainer-course-full-manage.ts:135 | NOT RUN | NOT RUN |
| API-0279 | Backend | POST | / | apps/api/src/routes/v1/trainer-course-full-manage.ts:72 | NOT RUN | NOT RUN |
| API-0280 | Backend | GET | /:courseId/version | apps/api/src/routes/v1/trainer-courses.ts:123 | NOT RUN | NOT RUN |
| API-0281 | Backend | PATCH | /:courseId/name | apps/api/src/routes/v1/trainer-courses.ts:140 | NOT RUN | NOT RUN |
| API-0282 | Backend | POST | / | apps/api/src/routes/v1/trainer-courses.ts:241 | NOT RUN | NOT RUN |
| API-0283 | Backend | PUT | /:courseId | apps/api/src/routes/v1/trainer-courses.ts:265 | NOT RUN | NOT RUN |
| API-0284 | Backend | GET | //draft | apps/api/src/routes/v1/trainer-courses.ts:34 | NOT RUN | NOT RUN |
| API-0285 | Backend | GET | /:courseId/draft | apps/api/src/routes/v1/trainer-courses.ts:38 | NOT RUN | NOT RUN |
| API-0286 | Backend | GET | /:courseId/editor-snapshot | apps/api/src/routes/v1/trainer-courses.ts:73 | NOT RUN | NOT RUN |
| API-0287 | Backend | GET | /candidates | apps/api/src/routes/v1/trainer-daily-bundles.ts:118 | NOT RUN | NOT RUN |
| API-0288 | Backend | GET | /bundles | apps/api/src/routes/v1/trainer-daily-bundles.ts:19 | NOT RUN | NOT RUN |
| API-0289 | Backend | GET | /bundle-step-candidates | apps/api/src/routes/v1/trainer-daily-bundles.ts:50 | NOT RUN | NOT RUN |
| API-0290 | Backend | GET | /schedule-range | apps/api/src/routes/v1/trainer-daily-bundles.ts:78 | NOT RUN | NOT RUN |
| API-0291 | Backend | PUT | /bundles | apps/api/src/routes/v1/trainer-daily-manage.ts:37 | NOT RUN | NOT RUN |
| API-0292 | Backend | DELETE | /bundles/:bundleId | apps/api/src/routes/v1/trainer-daily-manage.ts:51 | NOT RUN | NOT RUN |
| API-0293 | Backend | PUT | /schedule | apps/api/src/routes/v1/trainer-daily-manage.ts:62 | NOT RUN | NOT RUN |
| API-0294 | Backend | DELETE | /schedule/:scheduleId | apps/api/src/routes/v1/trainer-daily-manage.ts:80 | NOT RUN | NOT RUN |
| API-0295 | Backend | GET | / | apps/api/src/routes/v1/trainer-daily-statistics.ts:38 | NOT RUN | NOT RUN |
| API-0296 | Backend | GET | / | apps/api/src/routes/v1/trainer-days.ts:14 | NOT RUN | NOT RUN |
| API-0297 | Backend | POST | /review | apps/api/src/routes/v1/trainer-exam-manage.ts:107 | NOT RUN | NOT RUN |
| API-0298 | Backend | GET | / | apps/api/src/routes/v1/trainer-exam-manage.ts:96 | NOT RUN | NOT RUN |
| API-0299 | Backend | GET | /summary | apps/api/src/routes/v1/trainer-exam-summary.ts:13 | NOT RUN | NOT RUN |
| API-0300 | Backend | GET | /pending-summary | apps/api/src/routes/v1/trainer-exam-summary.ts:42 | NOT RUN | NOT RUN |
| API-0301 | Backend | GET | /lookup | apps/api/src/routes/v1/trainer-notes-manage.ts:133 | NOT RUN | NOT RUN |
| API-0302 | Backend | POST | / | apps/api/src/routes/v1/trainer-notes-manage.ts:148 | NOT RUN | NOT RUN |
| API-0303 | Backend | PUT | /:id | apps/api/src/routes/v1/trainer-notes-manage.ts:166 | NOT RUN | NOT RUN |
| API-0304 | Backend | DELETE | /:id | apps/api/src/routes/v1/trainer-notes-manage.ts:189 | NOT RUN | NOT RUN |
| API-0305 | Backend | GET | / | apps/api/src/routes/v1/trainer-notes-manage.ts:98 | NOT RUN | NOT RUN |
| API-0306 | Backend | GET | /summary | apps/api/src/routes/v1/trainer-notes-summary.ts:41 | NOT RUN | NOT RUN |
| API-0307 | Backend | GET | /courses | apps/api/src/routes/v1/trainer-statistics.ts:25 | NOT RUN | NOT RUN |
| API-0308 | Backend | GET | /steps | apps/api/src/routes/v1/trainer-statistics.ts:50 | NOT RUN | NOT RUN |
| API-0309 | Backend | GET | / | apps/api/src/routes/v1/trainer-steps.ts:16 | NOT RUN | NOT RUN |
| API-0310 | Backend | GET | / | apps/api/src/routes/v1/trainer-templates.ts:13 | NOT RUN | NOT RUN |
| API-0311 | Backend | PUT | /:id/name | apps/api/src/routes/v1/trainer-videos-manage.ts:25 | NOT RUN | NOT RUN |
| API-0312 | Backend | GET | /metadata | apps/api/src/routes/v1/trainer-videos-metadata.ts:7 | NOT RUN | NOT RUN |
| API-0313 | Backend | POST | /diary | apps/api/src/routes/v1/training.ts:1000 | NOT RUN | NOT RUN |
| API-0314 | Backend | GET | /diary | apps/api/src/routes/v1/training.ts:1023 | NOT RUN | NOT RUN |
| API-0315 | Backend | GET | /video/preview | apps/api/src/routes/v1/training.ts:1060 | NOT RUN | NOT RUN |
| API-0316 | Backend | POST | /video/url | apps/api/src/routes/v1/training.ts:1108 | NOT RUN | NOT RUN |
| API-0317 | Backend | GET | /video/:videoId/progress | apps/api/src/routes/v1/training.ts:1323 | NOT RUN | NOT RUN |
| API-0318 | Backend | POST | /video/:videoId/progress | apps/api/src/routes/v1/training.ts:1351 | NOT RUN | NOT RUN |
| API-0319 | Backend | GET | /video/:videoId/manifest | apps/api/src/routes/v1/training.ts:1501 | NOT RUN | NOT RUN |
| API-0320 | Backend | GET | /video/:videoId/manifest.m3u8 | apps/api/src/routes/v1/training.ts:1502 | NOT RUN | NOT RUN |
| API-0321 | Backend | GET | /video/:videoId/segment | apps/api/src/routes/v1/training.ts:1507 | NOT RUN | NOT RUN |
| API-0322 | Backend | GET | /days | apps/api/src/routes/v1/training.ts:315 | NOT RUN | NOT RUN |
| API-0323 | Backend | GET | /day | apps/api/src/routes/v1/training.ts:347 | NOT RUN | NOT RUN |
| API-0324 | Backend | POST | /step/start | apps/api/src/routes/v1/training.ts:515 | NOT RUN | NOT RUN |
| API-0325 | Backend | POST | /step/pause | apps/api/src/routes/v1/training.ts:605 | NOT RUN | NOT RUN |
| API-0326 | Backend | POST | /step/resume | apps/api/src/routes/v1/training.ts:683 | NOT RUN | NOT RUN |
| API-0327 | Backend | POST | /step/reset | apps/api/src/routes/v1/training.ts:760 | NOT RUN | NOT RUN |
| API-0328 | Backend | POST | /step/complete/practice | apps/api/src/routes/v1/training.ts:850 | NOT RUN | NOT RUN |
| API-0329 | Backend | POST | /step/complete/theory | apps/api/src/routes/v1/training.ts:924 | NOT RUN | NOT RUN |
| API-0330 | Backend | GET | /profile/public | apps/api/src/routes/v1/user.ts:107 | NOT RUN | NOT RUN |
| API-0331 | Backend | GET | /profile | apps/api/src/routes/v1/user.ts:192 | NOT RUN | NOT RUN |
| API-0332 | Backend | GET | /push-subscription-status | apps/api/src/routes/v1/user.ts:213 | NOT RUN | NOT RUN |
| API-0333 | Backend | GET | /onboarding-tour | apps/api/src/routes/v1/user.ts:229 | NOT RUN | NOT RUN |
| API-0334 | Backend | POST | /onboarding-tour/complete | apps/api/src/routes/v1/user.ts:241 | NOT RUN | NOT RUN |
| API-0335 | Backend | PUT | /profile | apps/api/src/routes/v1/user.ts:253 | NOT RUN | NOT RUN |
| API-0336 | Backend | POST | /avatar | apps/api/src/routes/v1/user.ts:275 | NOT RUN | NOT RUN |
| API-0337 | Backend | GET | /account/deletion-preflight | apps/api/src/routes/v1/user.ts:310 | NOT RUN | NOT RUN |
| API-0338 | Backend | POST | /account/deletion-code | apps/api/src/routes/v1/user.ts:324 | NOT RUN | NOT RUN |
| API-0339 | Backend | POST | /account/delete | apps/api/src/routes/v1/user.ts:357 | NOT RUN | NOT RUN |
| API-0340 | Backend | GET | /stage-health | apps/api/src/staging-media-core.ts:19 | NOT RUN | NOT RUN |
| API-0341 | Backend | GET | /__feed_v2_isolated_health | apps/api/src/test/feed-v2-local-link-server.ts:53 | NOT RUN | NOT RUN |
| API-0342 | Backend | GET | /__gallery_v2_test_health | apps/api/src/test/gallery-v2-isolated-hono.ts:86 | NOT RUN | NOT RUN |

Обнаружено деклараций HTTP handlers: 342 (без гарантии полноты динамических/монтируемых маршрутов).

<!-- API_CANDIDATES_END -->

## Browser specific matrix - 2026-10-29 04:45:09 +04
- 30 guest screen viewport visits and Web landing fix results in CHROMIUM_EVIDENCE.md. Protected content and 1347 JSX candidates not verified; 342 API declaration candidates not individually verified. No honest percent coverage.

## Authenticated Chrome current evidence 2026-10-29 05:01:14 +04
- 24 route+viewport screens rendered under correct synthetic role. Details in AUTHENTICATED_CHROMIUM_EVIDENCE.md. Individual controls NOT RUN.

## QA E2E user pet CRUD 2026-10-29 05:05:41 +04
- Real Chrome desktop, synthetic USER, /profile/addPet create, POST 201, own GET 200, /pets/:id delete confirmation DELETE 200, own GET 404, SQL absence PASS. Evidence TEST_RESULTS.md and ignored browser-20261029/real-pet-create.json, real-pet-delete.json. Other pet scenarios NOT RUN.

## Browser E2E additional test evidence 2026-10-29 05:18:09 +04
- Web self profile edit PUT200/GET200/visible readback PASS; password change POST200, new login200, bcrypt and session revocation SQL PASS, email notice delivery NOT RUN (external SMTP intentionally disabled). Onboarding Skip PASS; two real menu clicks PASS. Admin+Trainer six distinct nav clicks each desktop/mobile (12 PASS). Evidence TEST_RESULTS.md.

## Real question browser CRUD 2026-10-29 05:23:25 +04
- USER /questions/new local text POST200 -> /questions/:id GET200 -> PATCH200 -> DELETE200 -> SQL soft delete and owner confirmed. PASS for precisely this synthetic text CRUD, no photo/answers/moderation/rewards proof.

## Role ACL and strict original PG test 2026-10-29 05:28:53 +04
- Real Chrome USER/TRAINER admin GET403 and UI denied; ADMIN GET200/UI allowed: 3/3 PASS. Exact original protected Core/Prisma WORK PG18 pets/profile/weights read-only test 3/3 PASS. Remaining 24 historical special-PG files NOT RUN/BLOCKED.

## Technical and PostgreSQL verification at 2026-10-29 06:11:22 +04
- All 25 legacy protected PG suite files, total 110 tests PASS, original role/socket/port guards retained (qa-all-special-pg-consolidated-20261029.json). NON-special API 2400 PASS/358 SKIP. Docker image Web/Admin/Trainer actual linux/amd64 builds and isolated health/root HTTP PASS. Full actual browser action matrix not closed.

## Real Web/Admin/Trainer mutations 2026-10-29 06:26:50 +04
- Admin desktop/mobile real role changes synthetic USER->MODERATOR->USER PATCH200 SQL match. Trainer desktop Step POST201 own SQL proof, mobile Step DELETE200 GET404 SQL absence, trusted Origin unchanged. Other actions NOT RUN.

## Chrome and Mobile tests newly verified 2026-10-29 07:29:53 +04
- Trainer full Course editor desktop POST201 own free public version1; mobile PUT200 version2, DELETE200 SQL absent. Trainer Step/Day desktop create, mobile edit/delete SQL verified. Web mobile USER question, desktop TRAINER answer, mobile USER best-answer and soft-delete SQL verified. Mobile 25 offline video test files 177 PASS (native filesystem mock). Mobile full 2258 PASS 1 SKIP (after test-fixture fixes). Do not mark unverified static control rows PASS.

## Actual Web pet weight and Mobile technical pass — 2026-10-29 07:35:48 +04
- Web mobile 390x844 real Chrome+local Hono+isolated WORK PG18: only owned synthetic QA pet created POST201, exactly one weight 14.6 kg POST201 SQL verified, target 12.2 kg PUT200 SQL verified, target null PUT200 SQL verified, weight entry DELETE200 SQL empty, pet DELETE200 SQL absent; 6/6 scenario transitions PASS. Full evidence .local-pg-scratch/qa-logs/browser-20261029/pet-weight-full-e2e.json and .local-pg-scratch/qa-logs/chromium-web-pet-weight-owner-e2e-20261029.log. First QA script attempt used invalid pet name (form prevented request) then omitted native window.confirm (no delete); corrected harness and reran full exact scenario. Local synthetic pet data cleaned.
- Mobile FULL Vitest 2258 PASS / 1 SKIP / zero FAIL, 278 PASS files / 1 SKIP file, exit0. .local-pg-scratch/qa-logs/mobile-full-final-after-hono-video-fixture-20261029.log. Strict Mobile TypeScript tsc --noEmit also PASS .local-pg-scratch/qa-logs/mobile-typecheck-after-full-qa-20261029.log.
- iOS Simulator iPhone17 Pro iOS26.2 boot request PASS; native application is not installed; real offline video playback not yet confirmed. Device test status NOT RUN. Overall READY NO.

## Real learner-course browser acceptance and native iOS build attempt — 2026-10-29 07:48:04 +04
- Web actual connected learner training progression on original local Hono+isolated WORK PG18: isolated QA-only synthetic Course/TrainingDay/Step and StepOnDay/DayOnCourse fixture, original Web desktop login; genuine button 'Я выполнил' POST /api/v1/training/step/complete/practice HTTP200, SQL UserStep COMPLETED and UserCourse COMPLETED. Second fresh mobile Chrome 390x844 login displayed persisted 'Упражнение выполнено', SQL ownership of persisted step confirmed. 2/2 real Chrome scenarios PASS. .local-pg-scratch/qa-logs/browser-20261029/learner-training-e2e.json; chromium-web-learner-progress-e2e-20261029.log. Synthetic custom fixture initially supplied UUID for Prisma CUID DayOnCourse and StepOnDay links, causing GET /training/day HTTP400; corrected own QA fixture links after verifying zero progress rows. This was a TEST DATA ERROR, not production API bug: no application source or validator was changed. After testing, precise ownership/association verified and eight only-QA rows removed transactionally (UserStep, UserTraining, UserCourse, DayOnCourse, StepOnDay, Course, TrainingDay, Step). Independent SQL verified zero rows; cleanup file .local-pg-scratch/qa-logs/learner-training-fixture-cleanup-20261029.log. No other user records changed.
- iOS simulator iPhone17 Pro iOS26.2 booted. Native xcodebuild Debug simulator initial error: ReactCodegen generated CallsSpec.h missing; pod install --deployment regenerated some headers but deployment mismatch, full pod install --no-repo-update completed successfully with 180 pods. Podfile.lock snapshot before regen retained in ignored .local-pg-scratch/qa-logs/Podfile.lock-before-local-codegen-20261029. One followup failed missing StreamChatExpoSpec/States.h; a build after full pod install now RUNNING and must be checked before outcome. No production signing, build or distribution. Real offline video playback remains NOT VERIFIED.
- Android adb devices -l timed out at 16 seconds without listing devices, do NOT claim Android connected or offline media tested.
