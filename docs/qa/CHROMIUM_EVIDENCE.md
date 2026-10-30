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

# Chromium / Playwright - QA evidence 2026-10-29 04:45:09 +04

Real Google Chrome 156 controlled via local Playwright-core 1.64.1, with actual localhost HTTP. Web :5173, Admin :5174, Trainer :5175. Real Hono :3001 is connected to separate local WORK database, not QA clone C. All nonlocal browser requests blocked.

Guest screens 30: HTTP 200 on all routes, 0 JavaScript page exceptions. Console 401/403 is expected for unauthenticated users.

| App | Viewport | Path | HTTP | UI screen | Internal actions |
|---|---|---|---|---|---|
| Web | desktop | / | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | desktop | /login | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | desktop | /register | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | desktop | /passwordReset | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | desktop | /courses | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Web | desktop | /moments | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Web | desktop | /pets | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Web | mobile | / | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | mobile | /login | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | mobile | /register | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | mobile | /passwordReset | 200 | PUBLIC_SCREEN | NOT RUN |
| Web | mobile | /courses | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Web | mobile | /moments | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Web | mobile | /pets | 200 | AUTH_REDIRECT_TO_ROOT | NOT RUN |
| Admin | desktop | / | 200 | LOGIN_GATE | NOT RUN |
| Admin | desktop | /main-panel | 200 | LOGIN_GATE | NOT RUN |
| Admin | desktop | /main-panel/users | 200 | LOGIN_GATE | NOT RUN |
| Admin | desktop | /main-panel/feed-moderation | 200 | LOGIN_GATE | NOT RUN |
| Admin | mobile | / | 200 | LOGIN_GATE | NOT RUN |
| Admin | mobile | /main-panel | 200 | LOGIN_GATE | NOT RUN |
| Admin | mobile | /main-panel/users | 200 | LOGIN_GATE | NOT RUN |
| Admin | mobile | /main-panel/feed-moderation | 200 | LOGIN_GATE | NOT RUN |
| Trainer | desktop | / | 200 | LOGIN_GATE | NOT RUN |
| Trainer | desktop | /main-panel | 200 | LOGIN_GATE | NOT RUN |
| Trainer | desktop | /main-panel/statistics | 200 | LOGIN_GATE | NOT RUN |
| Trainer | desktop | /main-panel/courses | 200 | LOGIN_GATE | NOT RUN |
| Trainer | mobile | / | 200 | LOGIN_GATE | NOT RUN |
| Trainer | mobile | /main-panel | 200 | LOGIN_GATE | NOT RUN |
| Trainer | mobile | /main-panel/statistics | 200 | LOGIN_GATE | NOT RUN |
| Trainer | mobile | /main-panel/courses | 200 | LOGIN_GATE | NOT RUN |

Regression WEB-GUEST-001: fresh visitor saw false session-change banner on root while gallery opt-in global. Fixed in App.tsx; actual Chrome desktop/mobile PASS with clean landing, no banner or horizontal overflow. Targeted Vitest 29/29 PASS. Screenshots and JSON in ignored .local-pg-scratch/qa-logs/browser-20261029.

Limits: protected content and actions NOT RUN; these 30 are guest screens/auth gates, not 30 functional workflows. No claims about Android/iOS, Docker, production media Jobs, payments, email, real authenticated journeys.
