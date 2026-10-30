## Moments quiz read-only + foreign vote preservation — 2026-10-29 14:58:52 +0400

- **Quiz publish PASS scoped**: QA USER desktop published 2-option quiz via real Chrome; local PostgreSQL confirmed FeedPoll.isQuiz=true and correct option structure. First QA harness attempt failed on variable initialization order (fixed); on rerun publication succeeded, but QA client incorrectly waited for DOM fieldset.disabled. The native fieldset element itself is not classified as disabled by Playwright, whereas contained radio controls ARE effectively disabled.
- **Quiz vote immutability real Chrome mobile PASS, read-only rerun**: QA TRAINER voted; local PostgreSQL confirms their own vote. Fresh browser GET /api/v1/feed/posts/<built-in function id>/poll reports isQuiz=true and myOptionIds length 1; option radios disabled, no Edit/Cancel/Submit buttons after vote. Evidence .local-pg-scratch/qa-logs/chromium-moments-quiz-readonly-final-20261029.log and browser-20261029/feed-quiz-immutable-readonly.json.
- **Cleanup deliberately NOT DONE for one QA quiz**: exact SQL discovered TWO votes under this one newly QA-authored public quiz, one from synthetic QA TRAINER and one from an existing non-QA USER account in local WORK PG18 (account predated Oct29 and is not among authorized QA actors). Strict fixture cleanup refused to delete the post, because cascading deletion would remove a non-QA user's vote; no such destructive deletion executed. The local QA quiz remains published, clearly labeled QA. This is not a production write. Need isolate poll QA from other actors before closing/deleting or agree on an explicit safe data policy. Do not relabel as PASS/cleaned.
- **READY=NO**: closing this quiz and end-to-end non-QA isolation remain unverified; native offline, external providers and full source Docker build remain open.

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

# GAFUS — BUG REPORT

Statuses require reproducible evidence. Initial API run: 358 FAIL / 1828 PASS / 460 SKIP; this is not fully resolved by the targeted retest.

| ID | Area | Problem / action | Status |
|---|---|---|---|
| ENV-001 | External integrations | CDN, SMTP, push, payments and media Jobs not verified safe for writes. | BLOCKED for mutations |
| ENV-002 | DB | Default local DB differs from newer Oct 23 production-named dump. Separate local QA clone restored. | FIXED in test runner only; running services not switched |
| ENV-003 | Admin/Trainer Vitest | Setup modules src/test/test-utils.ts were deleted while referenced by vitest configs, causing 33/75 test files to abort collection. Recreated from Refactor Git HEAD. | Admin retest 194 PASS; Trainer retest pending |
| API-001 | Auth mock | Synthetic session fixtures lacked accurate user role required by role-aware JWT verification. Fixed fixtures in push-owner, course-draft, trainer-notes, schedule-range tests, including mistaken actors vs users variable. | 108 targeted tests PASS |
| API-002 | Core bindings | API composition wrappers introduced a mismatch in architectural tests. Bound exact original Core methods instead of wrapper closures. | 72 architecture tests PASS |
| API-003 | API startup test | Static test expected old monitor implementation and removed guest catalog; adjusted assertions to check current media shutdown and authenticated course mounting. | 12 lifecycle tests PASS |
| QA-CONFLICT-004 | Documentation | docs/qa disappeared during concurrent project changes. Reconstructed from preserved logs and AST scripts; needs reconciliation with other worker. | OBSERVED / RESTORED |

Precise changed files:
- apps/api/src/routes/v1/g1-push-owner.route.test.ts
- apps/api/src/routes/v1/g1-tr014-schedule-range.actual-core.mounted.test.ts
- apps/api/src/routes/v1/g1-trainer-notes-summary-minimal-actual-hono.mounted.test.ts
- apps/api/src/routes/v1/g1-trainer-course-draft-actual-app.mounted.test.ts
- apps/api/src/modules/training/composition/write-step-progress.ts
- apps/api/src/modules/learner-daily/composition/day-and-step-commands.ts
- apps/api/src/lib/graceful-shutdown.test.ts
- apps/admin-panel/src/test/test-utils.ts
- apps/trainer-panel/src/test/test-utils.ts

Targeted API verification after corrections: 6 suites / 192 tests PASS (exit 0), but first API FULL run had 358 FAIL and new FULL run is still required. No functional UI or Chromium PASS established.

## Subsequent fixes and pending retests
- TRAINER-FIX-001: role-aware synthetic Prisma session mocks aligned with current JWT verification in 14 actual Hono/React mounted test suites. Targeted 35 + 84 PASS. Application authorization was not weakened.
- TRAINER-FIX-002: partial Vitest mocks in TR012CourseVersionActualHonoMounted20261022.test.ts and ag4-tr013-visible-steps-ui.actual-app.test.ts restored actual module exports, retaining overrides of intended methods only. Updated session roles; targeted PASS.
- TRAINER-FIX-003: routes.test.tsx read stale removed vite-preparation directory; points to current trainer-vite implementation. Targeted suite PASS. Guest mock behavior was *not* used as Chromium evidence.
- API-FIX-005: 10 further actual Hono fixture suites updated to return exact role in mocked Prisma session. 9 suites targeted PASS; one additional suite passed separately (26/26) after fixing test-local actor variable shadowing. No product auth bypass.
- API-FIRST-RECHECK: Full second API run still 367 FAIL/1944 PASS/465 SKIP. This includes isolated-db opt-in environmental failures. Full third run and scope-specific DB tests are still needed.
- TRAINER-FULL: Original post-setup full run 58 FAIL/543 PASS. Targeted fixes all green, but full rerun still RUNNING and must be checked.

TRAINER-FULL-VERIFIED: 58 FAIL initially -> 0 FAIL, 639/639 PASS in full repeat (source log trainer-full-second-20261029.log). This establishes only the completed Trainer Vitest suite, not browser functionality.

## Confirmed release blocker and targeted regressions
- DB-RELEASE-001 (BLOCKED): Oct 23 production-dump clone lacks ReminderMutationReceipt but current Prisma model and untracked migration require it; migration.sql comments incorrectly claim file is outside migration tree. Must plan safe migration rehearsal on disposable test DB before production release. No production writes performed.
- API-FIX-006: Correct role-bearing test sessions for three reminder tests (12/12 targeted PASS).
- API-FIX-007: Feed author role-aware fake session and deliberately retired rewarded-ad 410 status (11/11 PASS).
- API-FIX-008: Legacy deleted Next source parity now tests current Vite/Hono GET/owner contract (3/3 PASS).
- API-FIX-009: Updated owner-only email, pet card weight, locked article safe fields and pet photo precondition tests (34/34 PASS). No privacy permission widened.

- DB-RELEASE-001: исправлено локально и подтверждено второй/третьей репетициями. Вместо старой привязки к одному PostgreSQL используются точные CHECK guards, обязательная пустота для изменения ограничения; миграция успешно выполняется на двух отдельных восстановленных локальных копиях. Проверка ветки отказа на непустой таблице ожидается. 2026-10-29 04:30:03 +04.

- WEB-GUEST-001 FIXED/RETEST PASS: globally enabled Gallery guard displayed false session-change banner on public root; scoped to Gallery route in App.tsx, added App.test.tsx regression, Chrome 1280x800+390x844 PASS, 29 targeted Vitest PASS.
- ENV-PG-025 BLOCKED: 25 special real-PG test files guard exact DB/socket/role; no unsafe relaxation. Explicitly excluded only from scoped non-PG API run, still NOT VERIFIED in own environments.

- WEB-SESSION-002 FIXED and RETEST PASS: first public landing fix inadvertently weakened A->B->A privacy fence across Pets/Profile/Gallery; 2 of 14 Gallery tests caught stale pet data. App.tsx corrected to enable owner fence across ALL private routes, exempt only public. F13 now checks guest deep link goes to public landing with no private data. 43/43 targeted PASS; full Web 2984 PASS, exit 0.
- LOCAL-AUTH-ORIGIN-001 BLOCKED in standalone dev ports: Admin :5174 and Trainer :5175 login POST 403, strict Hono origin only trusts :5173. Embedded Admin at :5173 works and invalid POST returns 401. Do NOT weaken origin security for tests.
- QA-LOCAL-ACCOUNT-001 2026-10-29 04:55:30 +04: 3 local synthetic role accounts added after verified WORK DB backup; no production writes.

- QA-BROWSER-RATE-001: repeated full browser reloads saturated existing /auth/me limiter (HTTP 429), fail-closed private screens. Test method corrected to SPA navigation without disabling limiter; 24/24 routes rendered. Not a claim of complete function coverage.
- QA-BROWSER-TTL-002: temporary Trainer/Admin Vite jobs hit 20-minute TTL; restarted local QA servers with longer timeout. Not an application bug.

- QA-TEST-TS2769 FIXED 2026-10-29 05:18:09 +04: new Web guest-security regression test used unsupported createElement props overload, strict TypeScript exit=2. Switched to typed JSX, reran Web typecheck PASS and build PASS. Product runtime unchanged.
- QA-TOUR-HIT-001 NOT A DEFECT: intentional authenticated onboarding tour overlay blocked header burger; browser test first failed until visible Skip was clicked. After tour dismiss, Web mobile navigation 2/2 PASS. Test script corrected, no force-click or z-index weakening.

- QA-CONTRACT-QUESTION-201 2026-10-29 05:23:25 +04: Browser QA script expected POST201 despite current Hono questions catch-all returns HTTP200 on success. Actual POST/PATCH/DELETE all 200, SQL verified soft delete. Updated script assertion to HTTP200 and reran full real Chrome question CRUD PASS. Test bug only, not server regression.

## Closed QA blockers 2026-10-29 06:11:22 +04
- COURSE-SQL-LEGACY-001: implicit Prisma selection of absent Course.version caused HTTP500 in favorites/exam original PostgreSQL18 full suite. Fixed in Core favoriteService.ts/examService.ts explicit select, 3+4 PG18 tests PASS. No test guard weakened.
- ENV-PG-025: formerly BLOCKED, now CLOSED: 25/25 original specialized PG suites PASS, 110 tests; source registry qa-all-special-pg-consolidated-20261029.json. PG14 synthetic fixture contamination handled using new isolated schema-only cluster; old data untouched.
- GAFUS-TARIFF-TEST-001: obsolete test expected mutable price/TTL contrary fixed 1 Gafus/7day product rule. Strengthened test to verify both raw legacy saved row and Core fixed tariff mapping, full PG14 5/5 PASS.
- QA-AUTH-RATE-002: browser admin role mutation attempt did not authenticate; likely existing 10 attempts/15min limiter. DB actor bcrypt/role valid; no target mutation executed. Re-attempt only after rate window; do not disable security control.

- TRAINER-DELETE-HTTP-001 FIXED 2026-10-29 06:26:50 +04: actual Chrome Trainer DELETE steps/manage/:id produced 400 BAD_INPUT due to falsely nonnull empty real HTTP stream. Hardened bounded empty-body check Step/Day; Hono test 8/8 PASS rejects nonempty streams; real desktop POST201/mobile DELETE200 GET404 SQL absence PASS.
- QA-ADMIN-ROLE-002: browser script previously inspected authentication before completed login; wait for real /courses now. Real role PATCH desktop/mobile 2/2 PASS with SQL, synthetic QA role restored.

## Closed automated Mobile test infrastructure issues 2026-10-29 07:29:53 +04
- Initial full Mobile suite 55 FAIL in six files. Four Hono signed-JWT pet fixture database roles missing; production identity sessionIsCurrent correctly demands JWT.role == DB.role. Fixed only mocked User.role=USER; strict security untouched. v94 malformed Core non-array expected obsolete HTTP200 but actual safe Hono500; strengthened correct fail-closed expectation. Four original files 76/76 PASS. v93 weight target set now carries stillCurrent owner guard as third argument; test requires callback. OFF022 real video full mount initially evaluated Expo native module without __DEV__, then had no synthetic downloaded HLS manifest. Mocked native FileSystem with only a verified local QA manifest and used proper courseType/video URL. Both final test files 32/32 PASS. Full Mobile final 2258 PASS/1 SKIP zero FAIL exit0. Not a native physical device proof.

- QA-TRAINING-FIXTURE-ID-001 CLOSED 2026-10-29 07:48:04 +04: synthetically seeded DayOnCourse/StepOnDay used UUID, but real Prisma link defaults generate CUID and training/day correctly requires CUID. Corrected own local fixture after strict owner checks; no app changes. Verified desktop practice completion and mobile readback then full local-only cleanup.
- IOS-BUILD-CODEGEN-QA 2026-10-29 07:48:04 +04: xcodebuild initial missing ReactCodegen CallsSpec.h, subsequent StreamChatExpoSpec/States.h; pod install --deployment failed expected lock drift, then pod install --no-repo-update completed. Latest build pending, do not mark PASS.

## QA blocking facts 2026-10-29 09:16:02 +0400
- IOS-SIM-KEYCHAIN-001 BLOCKED: unsigned local Debug lacked SecureStore entitlement; app native UI runs but signed-in/offline not proven. Available signing cert Team ID differs from source team. Ad-hoc and wrong-team QA-only copies refused by SpringBoard, original restored, copies removed. No production signing changed.
- QA-TRAINER-CONSULT-HARNESS-RACE CLOSED: DOMContentLoaded is earlier than guest login UI. Waited for guest heading; real Trainer desktop PUT200, local SQL rule1/slots16, mobile readback and owner-only cleanup PASS.
- CONSULTATION-ENTITLEMENT: HTTP402 SUBSCRIPTION_REQUIRED on protected slot GET without active subscription, 15/15 role GET PASS. No payment/provider booking claim.

- REMINDER-CHROME-QA-001 CLOSED 2026-10-29 09:22:38 +0400: initial regression harness assumed server create enabled=false, but real backend creates enabled=true. First own synthetic record cleaned before delivery, zero delivery records. Harness now clicks visible label to disable before editing, uses name-based locator rebind after edit. Real desktop POST200, two PUT200, mobile DELETE200, SQL absent PASS. No product code change.

- ADMIN-FLAGS-SUCCESS-001 FIXED: parent reload unmounted already-verified success message, corrected apps/admin-panel/src/admin-live/App.tsx. Actual desktop/mobile 2/2 PASS, review flag restored, Admin194 test PASS.
- QA-MODERATION-CLEANUP-001 FIXED: deleted own QA question/report/view after fixing nonexistent QuestionReaction table in harness. Functional cross-app complaint dismissal 3/3 PASS.
- IOS-QA-VARIANT-AUTH BLOCKED: build/install/launch/React screens PASS; QA signature ad hoc without entitlements, native login NETWORK_ERROR. Native offline playback NOT RUN.

- QA-CHAT2-DIRECT-001 CLOSED 2026-10-29 12:39:30 +0400: Chrome desktop/mobile real HTTP201 and SQL of two correct authors, guarded own-room cleanup. Earlier browser harness retries failed due cookie overlay, premature acknowledgement and ambiguous selectors. Fixed in scripts/qa/chromium-chat2-local-direct-e2e.cjs. No confirmed product bug; media/realtime NOT RUN.

- QA-CHAT2-REPORT-LOCAL-SCHEMA-001 CLOSED 2026-10-29 12:52:58 +0400: local WORK PG missing Chat2Report because 20261027004500_chat2_reports unapplied. PG18 backup first; additive 17-line DDL+prisma resolve only localhost. Real USER/TRAINER/ADMIN browser report and staff rejection 3/3 PASS, QA owned rows cleaned. Nine other pending migrations remain; not claimed parity.
