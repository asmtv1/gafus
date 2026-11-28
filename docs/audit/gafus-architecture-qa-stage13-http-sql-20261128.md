# Stage 13 follow-up: mounted HTTP ACL and list reader size — 2026-11-28

Base and preserved first-pass branch: `qa/stage13-domain-20261128` = `1132215bd0954faf4db7a368bbcd220ca35f5d0a`. Follow-up branch `qa/stage13-http-sql-20261128`, using the previous isolated QA worktree (not the shared checkout). No production code change, merge, push or deploy. No previous green suite rerun. Existing compiled workspace dependencies reused, no frozen install/full build claimed.

## Reproduction and evidence

New profile derived from repository `scripts/qa/api-authenticated-http-isolated.sh` and `apps/api/src/test/qa-authenticated-http.acceptance.mts`; separate files, original profiles unchanged. Full mounted `apps/api/src/app.ts` over real TCP, actual login/JWT, Prisma, PostgreSQL 18 and Redis, random loopback ports, disposable DB, C locale, own Unix socket, no external credentials or Worker processes, Node nonlocal-network guard. The guard is for Node TCP/TLS only, not a universal sandbox. Schema snapshot uses `prisma db push --skip-generate`, not migration-chain acceptance. Synthetic grants/booking/question states seeded via SQL/Prisma; no provider calls or sends.

```bash
mkdir -p .qa/testing/qa-stage13-http-sql/tasks/1234567890abcdef1234/attempt-1
env -i HOME="$HOME" PATH="$PATH" TMPDIR=/tmp \
  GAFUS_TEST_REPORT_PATH="$PWD/.qa/testing/qa-stage13-http-sql/tasks/1234567890abcdef1234/attempt-1/tests.json" \
  bash scripts/qa/stage13-http-sql-isolated.sh
```

r1 exit 0; **5/5 cases** (3 mounted ACL, 2 SQL list measurements); 24 scenario HTTP calls plus four login setup requests. Log `/tmp/gafus-stage13-20261128/http-sql-r1.log`. Durable terminal job `7eac9f9824b66f380180be701a0a830f08a8c0e89ad9f333`. Wall time 245.142 s including provisioning. Evidence retained under `docs/audit/stage13-http-sql-evidence-20261128/`: observed HTTP statuses and SQL assertions, normalized SQL statements with row/block stats, test report, owned-resource cleanup report. PostgreSQL port 61895, Redis 61897, API 62880. Resource report confirms all owned processes stopped and temporary directory removed.

## Mounted HTTP acceptance

| Area | Result | Actual evidence |
|---|---|---|
| Articles | PASS | Anonymous 401/no-store; locked detail returns 200 but content=null, videoUrl=null, imageUrls=[]; foreign like 402/no inserted row; synthetic active owner grant exposes body/media DTO to owner only; expiry redacts it again; private no-store. |
| Q&A | PASS | Anonymous 401; foreign best-answer POST 403 with no pointer change; hidden answer 400; owner POST 200 with correct DB pointer; hidden answer absent in detail; hidden question 404. |
| Consultations | PASS | Owner receipt FOUND, foreign and absent receipt identical UNKNOWN (200); owner list contains own booking, foreign list empty; foreign cancellation and non-staff confirmation 403; booking state unchanged. |

Boundaries: article media checks concern API response disclosure, not direct CDN/S3 URLs or signed media delivery. No live provider calls. Q&A moderation hidden states seeded, not a fresh admin moderation workflow. Consultation owner cancel/booking concurrency already accepted in first pass, not rerun; new checks use seeded booking and deny mutations. The previous intermittent r3 double rejection is not explained by this profile.

## SQL reader work, warm single request

200 additional articles (8 KiB synthetic bodies) and 200 additional questions (1 KiB bodies, 20% hidden); one earlier fixture of each also exists. ANALYZE; one warmup request, reset pg_stat_statements in own disposable database, then one authenticated GET per list. All SELECT calls counted, including auth/entitlement queries; exclude pg_stat_statements introspection. Output bytes are UTF-8 reserialized JSON, not compressed wire bytes or SQL-transfer size.

| List | DTO items | SELECT calls | SQL returned rows | Shared hits/read | Sum SELECT execution ms | JSON bytes | HTTP ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| Articles | 50 | 11 | 56 | 10/0 | 0.442542 | 22769 | 97.662 |
| Q&A | 20 | 11 | 29 | 19/0 | 0.88529 | 28137 | 171.832 |

Main article query returned 50 rows; main Question query 21 rows (one lookahead). Q&A auth-related SELECTs for refresh token, registrationPending and session state each ran twice; included, not silently deducted. Article body excluded from main catalog SELECT; Q&A selects body (fixture 1 KiB). Normalized queries captured in list-sql.json. These are actual SQL reader-size measurements, not EXPLAIN plans, scanned-row counts, p95, cold-disk workload, production capacity or historical regression comparison. No statistically valid latency claim. Single author, no representative reaction/like fanout or rich media; no large offset measurement.

## AI stream inventory (tracked source at base SHA)

```bash
git grep -n 'getTrainerAIConfigForStream' 1132215bd -- ':!*.test.ts'
git grep -n -i -E 'openrouter\.ai/api|api/v1/chat/completions|text/event-stream|streamText\(' 1132215bd -- apps/api/src apps/trainer-panel/src
git ls-tree -r --name-only 1132215bd apps/api/src/routes | grep -iE 'trainer-ai|trainerAI|ai-stream'
```

Only non-test references to the stream config function: composition export `apps/api/src/modules/trainer-ai/composition/trainer-ai.ts:23`, definition and return export `packages/core/src/services/trainerAI/index.ts:69,114`. No matched non-test API/trainer-panel stream transport or named mounted trainer AI route in the searched tree. Persistence and policy exist (already PG-tested first pass). No actual stream consumer found in the inspected tracked sources; disconnect/abort integration remains NOT APPLICABLE to the located runtime or BLOCKED pending identification of a mounted consumer, not PASS. This is a source inventory with bounded search scope, not proof about production deployment.

Remaining beyond this follow-up: dashboard/analytics failure and representative stats/pet/Feed reader budgets, direct media/CDN enforcement, AI transport if restored, prior intermittent consultation cause. No production or physical-device tests.
