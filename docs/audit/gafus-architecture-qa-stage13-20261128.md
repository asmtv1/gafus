# Stage 13 — isolated domain acceptance, 2026-11-28

Base: `850874bf306d6aa96629e704ca256033ef1d99f2` (`qa/architecture-acceptance-20261127`). Branch: `qa/stage13-domain-20261128`, separate worktree. Scope: remaining domain scenarios only, no production/provider sends, worker/recovery, Web UI, offline-v2 or physical-device work. Physical devices accepted by owner instruction, not independently retested here.

## New evidence

All PG profiles use disposable loopback PG18.4, dynamic ports, synthetic data and Prisma db push (schema snapshot, not migration replay). Profiles ran sequentially in this worktree. Dependencies/generated Prisma and built workspace dependencies reused from the QA checkout; no frozen install/full build claimed. No production env files used. Logs: `/tmp/gafus-stage13-20261128/`.

| Command (bash, repo root) | Result | Log |
|---|---|---|
| `scripts/qa/feed-chronological-isolated-pg.sh` | 9/9, exit 0 on r3 | `feed-chronological-r3.log` |
| `scripts/qa/article-rows-isolated-pg.sh` | 3/3, exit 0 | `article-rows.log` |
| `scripts/qa/stage13-domain-isolated-pg.sh` | Trainer AI existing smoke + four domain assertions, exit 0 | `domain-combined.log` |

Feed: stable equal-timestamp pagination, visibility/owner, bookmarks, hidden authors/moderation, smart preferences. Query count 1 vs 1 for each measured page size (1,9); old/new 14.714/15.113ms, no performance improvement asserted. Articles: viewer isolation, author stats, dedup guest/auth view. Domain smoke: simultaneous best-answer replay, reward/ledger/outbox dedup even A→B→A, heart replay; mini-guide grant/revoke/foreign access and iOS/Android flags; training reminder owner/TZ/concurrent claim/release/retry; achievements owner isolation; Trainer AI current staff role, history, transaction rollback, revoked staff access.

Feed first two attempts exited 1 at PostgreSQL startup (`postmaster became multithreaded during startup` under system locale); C locale + private socket fixed the harness, r3 passed. Not a product bug. The environment was under heavy concurrent QA load; latency is not representative. Real external push/mail delivery is intentionally excluded.

## Inherited evidence (not rerun or counted as new)

Prior QA logs in `/tmp/gafus-archqa-20261127/`, see `docs/audit/gafus-architecture-qa-20261127.md` and status files from prior PG run. Pets `identity-domain-r27/pet-rows.log` 4/4 and `pet-course-read-r28.log`: owner, idempotency, list/detail, cascade; `vet-visit-r28.log` 9/9 + owner-only detail; `transaction-domain-r27/prevention-reminder.log` nonUTC/owner/ack, `reminder-atomic-owner.log` concurrent ownership transfer. Ranked Feed `content-domain-r27/feed-ranked-read.log` 19/19; Q&A moderation `questions-moderation.log` 17/17; trainer notes `trainer-note-rows.log` 3/3. Consultations `transaction-domain-r27/consultation-catalog.log`, `consultation-eligibility.log`, `slot-rows.log` 3/3; schedules, roles, cross-trainer active booking restrictions, cooldown and slot lock. `entitlements-isolated-pg-r2.log`: article GAFUS owner/expiry and private course entitlement. No duplicate runs just to inflate evidence.

## Remaining boundaries

Not a full stage 13 PASS: no new mounted authenticated HTTP end-to-end suite; private article/media access through actual HTTP/CDN and per-channel notification ACK/retry on workers not demonstrated here; representative pet/Feed/Q&A/dashboard SQL budgets, dashboard and analytics failure on real runtime, AI stream disconnect and cross-runtime timezone consistency remain open. Mini-guide daily/mixed-client/offline checks belong to the other assigned workstream. External sends, payments, actual Voximplant and physical devices excluded by scope. No push, merge or deploy.

## Consultation / exam regression

`bash scripts/qa/stage13-consult-exam-isolated-pg.sh` uses real PG + disposable Redis on dynamic loopback ports. No worker; push is explicitly refused, mail recipients use `.invalid`. R1 exit 1 (`consult-exam.log`): missing fixture email, so expected cancellation log was absent; ordinary exam owner/replay passed. R2 exit 1 (`consult-exam-r2.log`): consultation PASS (two clients compete, one booking and receipt, idempotent re-read simulating lost response, foreign cancel denied, free slot, cancelled replay and one mail outbox record); exam FAIL reproduced accepting an unrelated valid `stepId` for the owned `userStepId`. Fix `d64aeefa336f7af30c949ed89ddfe7b04ce26ab2`: authoritative occurrence step ID check before writes (ordinary and daily) and server-derived create field. R3 exit 1 (`consult-exam-r3.log`): exam PASS including unrelated step rejection before any result row, owner replay and foreign read/write denial; consultation FAIL at first assertion, both booking promises rejected, individual causes not captured in r3. Do not assume timeout or mark repeatable acceptance PASS. Added diagnostic of settled rejection reason for next run. Core unit regression added for ordinary and daily paths; not yet executed against rebuilt package at this point.

No historical exam rows corrected; no production work. Overall stage 13 remains partial until reproducible consultation result and the remaining runtime/performance evidence are closed.
