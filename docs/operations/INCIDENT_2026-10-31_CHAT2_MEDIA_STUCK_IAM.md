# Chat2 V2: production attachment indefinitely pending — 2026-10-31

## Report and verified evidence

User sees Chat 2.0 attachment preview with «Загружается…» instead of a
sendable READY attachment. The Web client performs authenticated
`reserve → Cloud.ru S3 signed POST → confirm → status poll → attach`;
`Chat2Messenger.tsx` keeps the preview pending until `chat2Api.upload()` returns.
The Web status-poll limit is 240 × 1.5 seconds (~6 minutes), but does not
expose QUEUED/PROCESSING phase to the user. This screenshot alone does not
prove S3 upload completed or status is QUEUED.

AI Commander `gafus.ru` read-only examination:
- API, Worker, Web are running and healthy (Docker). API/Worker have no
  OOM kills or restarts in the observed state (`false`, `0`).
- API and Worker: `CHAT2_V2_MEDIA_ENABLED=true`,
  `CHAT2_V2_CORE_ENABLED=true`, `CHAT2_PROCESSOR_READY=true`,
  `CHAT2_CLOUDRU_PROJECT_VERIFIED=true`, `CLOUDRU_MEDIA_JOBS_ENABLED=true`.
  Secrets were not printed.
- Remote diagnostic commands for full queue state and historical log details
  intermittently timed out or hit a concurrent remote_exec lock.
  A subsequent *read-only* production PostgreSQL query of
  `Chat2V2MediaTask` confirmed **2 QUEUED tasks** at investigation time.
  Individual attempt counts, exact Cloud.ru auth response, and Chat2 Job
  execution results remain unverified because follow-up diagnostic commands
  intermittently timed out. No production DB write or synthetic Cloud Job
  launch was attempted.

## Deterministic code defect

`CLOUDRU_PROJECTS.chat2.iamVersion` is `v2` in
`infra/cloudru/production-job-inventory.mjs`, as is Cloud.ru's Chat2
provisioning tool (`infra/cloudru/chat2-job-provision.mjs`). But
`packages/worker/src/cloudru-media-dispatcher.ts` previously used IAM v2
ONLY when dispatching Questions. Chat2 dispatch therefore authenticated via
`https://iam.api.cloud.ru/api/v1/auth/token`, inconsistent with the
separate Chat2 project's required v2 IAM route. A rejection leaves the
durable media task QUEUED; the BullMQ wake fails and cron recovery repeats
that rejected dispatch. This is a strong explanation for the observed
symptom; production Job response codes still need confirmation.

## Change made in Refactor only

- The allowlisted Chat2 and Questions Job pools now use the v2 IAM endpoint.
- Existing Feed and Gallery Job pools continue to use v1.
- No scoped Chat2 credentials, project IDs, Jobs, configuration or registry
  image were changed. No fallback to another Cloud.ru project.
- Added regression tests requiring the exact Chat2 v2 URL and retaining
  assertions for existing v1 pools and job/project isolation.

## Local regression receipt

- `pnpm --filter @gafus/worker typecheck`: PASS.
- `pnpm --filter @gafus/worker exec vitest run src/cloudru-media-dispatcher.test.ts src/chat2-media-processing-trigger-worker.test.ts src/chat2-media-recovery.test.ts`: 30/30 PASS across 3 files (OneShot `a1176be051c132e2cdfc094999f6b87aebdfa9bcf29f6449`, exit 0).
- `git diff --check` on changed worker code: PASS.

## Safety and follow-up

Do **not** mark production fixed based on typecheck or isolated tests. The
production Worker still runs its previously deployed image until an
independently authorized release. Only `gafus-feed-photo`,
`gafus-feed-photo-2`, `gafus-feed-video`, and `gafus-feed-video-2` are
covered by the standing Cloud.ru Job mutation authorization; the FOUR
**Chat2** Jobs are NOT authorized to edit through that exception.

After a separately approved Worker release (with rollback): use only
read-only production SQL/logs/Cloud.ru GET to determine whether current
chat upload tasks transition to PROCESSING/READY. Check both Chat2 photo and
video Jobs have `CHAT2_JOB_ENABLED=true`, correct `CHAT2_INTERNAL_BASE_URL`
and matching HMAC, S3 credentials, digest and resource settings. Confirm one
consented real-user upload completes `reserve → POST → confirm → claim →
complete → attach → message readback`. Never fabricate a READY state or
write production DB/S3 to simulate a success.
