# GAFUS Feed implementation and rollout status

Updated 2026-10-09. The owner authorized finishing Feed, deploying to production for testing and enabling it for all accounts. There is no separate DEV server.

## Implemented

- Shared types, limits, validation, additive migration and transactional post/revision, comment, reaction, unique view and notification services.
- Direct private uploads, MIME/size checks, authorized album photo copy, upload recovery and deferred cleanup after post/account deletion.
- Photo/WebP and video/HLS processing, claim/lease/attempt tokens, retries, queues/DLQs, internal HMAC API and Redis nonce protection.
- Web/Mobile media editors, feed/profile/details, playback, paginated comments, reactions, notifications and exact notification comment lookup. Mobile camera/microphone integration is included.
- Active revision authorization for HLS tickets/playlists, 120-second segment signatures, 90-second query refresh and bounded origin byte ranges.
- Push outbox through existing transports, independent maintenance/push flags and verified rollback dumps before production migrations.

## Infrastructure and evidence

Feed uses a dedicated private bucket, service accounts, Lockbox, photo/video containers and queues/DLQs. Its Terraform state is separate from Gallery. The existing gallery-dev.gafus.ru CDN now routes /posts/{path+} to the private Feed origin while preserving the Gallery route. No second CDN or DNS record is required; the certificate challenge CNAME can remain.

111 targeted tests and 13 real PostgreSQL integration tests passed. Core/feed-server/runtime builds and API/Web/Mobile/worker/runtime typechecks passed. Native Sharp/FFmpeg processing passed in an AMD64 Docker image in GitHub Actions. Live CDN smoke passed signed GET, Range, CORS, unsigned/expired rejection and private-origin rejection. Worker writes outside posts/ were rejected. Smoke objects were removed. An explicit edge cache HIT was not observable in response headers.

Production SSH preflight verified a fresh PostgreSQL dump; Feed tables were absent and failed migrations were zero. Release PR: https://github.com/asmtv1/gafus/pull/2. Unrelated local UI/Gallery/questions changes are excluded.

## Remaining rollout acceptance

- Complete release CI, production migration and application deployment.
- Enable queue/timer triggers after the production internal API is available, then enable public Feed flags for all accounts.
- Verify production text/photo/video posts, album copy and browser HLS.
- Verify physical iOS/Android permissions, camera/microphone, background and push delivery; typechecks do not replace device tests.
- Record deployment outcomes separately from infrastructure provisioning. Rollback uses flags/triggers, preserving additive tables and production media.

API/configuration details: [feed-runtime.md](feed-runtime.md), [infrastructure runbook](../../infra/feed/README.md).
