# Architecture continuation v22 — Question V2 media boundary (2026-11-11)

## Scope and ownership

- Move photo presentation, signed private Question V2 URL/rendition DTOs, and manifest read ownership from Core's `services/questions/presentPhoto.ts` to `@gafus/media-server/question-photo-presenter`. Preserve the existing 360/1080 WebP dimensions, CDN and fallback URLs, pending/nonrenderable status, legacy provider-mismatch redaction, and explicit upstream question/answer ACL.
- Bind Question V2 photo cleanup directly from `@gafus/media-server/question-v2-cleanup` in the API upload composition and `questions-server`; bind photo presentation + cleanup directly inside `questions-write-server` composition. Remove Core's obsolete `mediaV2Cleanup.ts` and photo presenter/re-exports.
- Preserve Question photo delete/answer/moderation transaction fences and idempotent outbox behavior. No new S3/photo Cloud Job path, production API change, or old mobile client compatibility fallback.
- Add five additional presenter regression tests for private markers, pending/READY state, missing manifest, explicit sizes, signed renditions and fallback delivery.

## Independent evidence

- Full local run: `questions-media-ports-v22`, durable job `c98e83629e8c30e3f90a0a24f799553b6ec3a7478600dcea`: **exit 0, 33/33 stages PASS**. Source: `~/Library/Logs/gafus-refactor-regression/questions-media-ports-v22/results.tsv`.
- Build: **61/61**. Workspace graph: **69 projects, zero cycles**. TypeScript: **123/123**. Web: **3144 PASS, 6 skipped** (all 303 source test files accounted). Mobile: **2742 PASS, 1 skipped**. Trainer and admin panels PASS. Server packages, Core, API, Worker and whitespace gate PASS.
- Isolated PostgreSQL: `scripts/qa/questions-legacy-delete-outbox-isolated-pg.sh` and `scripts/qa/questions-moderation-isolated-pg.sh`, both exit 0. No production rows or external S3 objects modified.
- Actual local chaos: `scripts/qa/architecture-chaos-local.sh questions-media-ports-v22`, durable job `82ffc1dadd4d5ca384c5453e6048d4dca5eb2679432604ab`, exit 0 and **5/5 PASS** (outbox claim, multi-process Worker, BullMQ Redis, CAS/DB/unknown-ACK, backup/restore). Isolated/synthetic, not cloud or production certification.
- Retired Cloud photo Jobs contract: `node --test scripts/qa/cloud-photo-jobs-retired.test.mjs`, **7/7 PASS**.
- Exact post-run checksums for eight changed media-boundary files match the versions verified with the full suite. No new Core→server dependencies. `pnpm check:core-boundaries`, workspace graph and whitespace gate all PASS after ratchet.

## Baseline and unfinished scope

- Frozen `docs/audit/core-server-facade-baseline.json`: **79 → 77 remaining**, zero new. Since the original frozen inventory of 142, **65 imports resolved**. Regenerated `docs/audit/core-server-adapter-risk-inventory-20261111.md`.
- The overall architecture program is **NOT complete**. In particular, **77 backward Core→server dependencies remain**, and the six real external/staging acceptance gates described in `gafus-architecture-program-20261111-local-acceptance.md` remain unproven. Local MinIO/PG/Redis/mock Cloud tests cannot replace Cloud.ru/Beget edge/provider, live collector, production-like load, or approved staging restore/rollback evidence.
- No production deployment, push, commit or infrastructure mutation was performed. Other concurrent uncommitted worktree changes were not discarded.
