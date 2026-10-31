# Production Questions photo: indefinite «Загрузка…» (2026-10-31)

## Observation and scope

The 2026-10-31 screenshot of a newly created question shows one photo tile stuck at «Загрузка…». This specific text comes from `apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx` while its *on-demand authorized detail GET* is in progress. It is **not** the worker status string «Обрабатываем фото…». We therefore cannot conclude from this screenshot alone that a Cloud.ru photo execution is running or stuck.

`QuestionPhotoGallery` invokes `fetchQuestionPhotoRenditions`, which repeats `GET /api/v1/questions/:id?page=1` (or the corresponding nested-reply page). The call previously lacked any deadline for the HTTP response **and** response JSON body. If either operation remained pending, `loading=true` persisted indefinitely and the existing `3-minute` worker status polling never started, because that polling starts only after the initial GET returns a status.

A read-only unauthenticated request to `https://gafus.ru/api/v1/questions/test` yielded HTTP 401 in about 0.7s; `https://api.gafus.ru/api/v1/questions/test` yielded HTTP 401 in about 0.6s. Both prove basic routing works, **not** that the authenticated affected question, its image, or the Questions photo queue is healthy. No user session, affected question ID or production job logs were available for a confirmed end-to-end production diagnosis.

The documented Questions Photo V2 new Cloud image has *not* been cut over to the legacy `gafus-questions-photo` Job (see `docs/contracts/QUESTIONS_MEDIA_V2.md`); the new HMAC API is incompatible with the old Job configuration. Do not assign that new image to the running legacy Job as a speculative fix. The existing Questions Job is not one of the four specially authorized Feed Media V2 Jobs.

## Applied Refactor fix

- `apps/web-vite/src/features/questions/questionPhotoRead.ts`: a 12-second deadline covers both the authorized GET and its JSON body read. The transport is aborted on timeout; the deadline is cleared and the caller's abort listener is detached when the request settles. A hung network/browser stub still results in a finite, handled rejection.
- `apps/web-vite/src/features/questions/QuestionPhotoGallery.tsx`: the tile shows «Ошибка загрузки» and retains the existing safe «Повторить загрузку» action, rather than reverting to the misleading «Фото». No old signed URL is reused and no cross-origin access rule changed.
- Regression: 23/23 dedicated tests PASS, including hung fetch, hung JSON response, visible timeout state and successful manual retry. Web TypeScript check PASS. No changes to the production API, Queue, Jobs, S3, CDN, DB or frontend deployment were made.

## Remaining production acceptance gate

**Production incident remains unverified/not closed.** The Refactor fix must first pass release CI and receive separate authorization for deployment to production. After an authorized deployment, open the *same* affected question as its owner and confirm that the tile either renders the photo or exits the loading state with a visible retry button no later than the read deadline. Inspect the authenticated detail GET's response code/duration, then distinguish a pending `AWAITING_UPLOAD/QUEUED/PROCESSING` task from `FAILED`/`READY`. If processing is genuinely stuck, investigate the legacy Questions Job, backend/worker logs and read-only status before any authorized infrastructure change. Do not perform data-changing synthetic uploads or touch production media objects as a diagnostic.

Rollback of this UI-only change consists of reverting its two source files in the Refactor release before a new, separately authorized production deployment. Retain unrelated working-tree edits from concurrent agents.
