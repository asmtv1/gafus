# CDN fallback — real isolated actor-access acceptance (Agent 2, 2026-10-30)

**Scope:** GAFUS Refactor only. This is **not** an external CDN, production Beget/Cloud.ru, native device or release readiness test. No production credentials or S3 access.

## Reproducible execution

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
zsh scripts/qa/cdn-full-isolated-actor-access.sh
```

Prerequisites: installed Homebrew PostgreSQL client/server tools, native Redis, installed local `.local-pg-scratch/nonprod-s3/bin/minio` executable, workspace dependencies/Prisma client. The runner uses **only** its own disposable loopback ports (`55446` PostgreSQL, `56340` Redis, `58343` Hono, `58344` synthetic CDN HEAD server, `58390` MinIO API, `58391` MinIO console). Any busy port blocks startup. It does not stop existing development tools. `mktemp` creates a private directory under `.local-pg-scratch/agent2-cdn-full-XXXXXX`, and `trap` closes only its newly created processes and removes only its temporary tree. The database starts **empty**, receives `prisma db push --skip-generate` only within that fresh cluster, and is destroyed at the end. MinIO uses random synthetic credentials and two uniquely named private test buckets. Credentials, signed query tokens, database passwords and keys are not printed.

The test `apps/api/src/test/agent2-cdn-full-isolated.actor-access.test.ts`, under `apps/api/vitest.cdn-full-isolated.config.ts` with **no default mock setup**, exercises actual registered Hono Feed and Gallery routes, real JWT issuer/verifier with DB session checks, Core's current actor/media permission resolution, signer-selected *final* media keys, signed S3 presigned `GET` and byte-verified responses, anonymous read rejection, visibility revocation, moderation, deletion, separate-object isolation, and clean fixture deletion. The local CDN status socket returns actual TCP HEAD `403`, `404`, `410`, `503`, and `504`; real Hono status-only proxy and shared Core Client status classification are exercised. Web and Mobile production URL validation/403-404/410-5xx/cache behavior is verified independently with their component suites and **not relaxed to accept test-only HTTP MinIO URLs**.

Test-only local signer configuration is admitted only when **all** of `NODE_ENV=test`, `GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE=1`, exact disposable DB/Redis URLs and exact MinIO loopback endpoint with opaque QA credentials match. It does **not** activate in production, development, shared WORK or another endpoint. The pre-existing Cloud.ru production signer endpoint/bucket/final-key restrictions remain in place. The `media-cdn-probe` local socket exception is similarly fail-closed and accepts only its fixed test port and two path patterns. Storage guard negative tests demonstrate production/shared contexts cannot enable the synthetic route.

## Results and precise boundaries

- Full real isolated Hono/Core/MinIO + loopback status: **5/5 PASS**, OneShot `da46a3f621674cfc1be16a41e6a8092dd7f023ebf4f4b683`, **exit 0**.
- Web gallery/feed component contracts: **13/13 PASS**; Mobile CDN/cache: **14/14 PASS**; prior Hono HTTP probe status proxy: **6/6 PASS**; standalone QA guard negative tests: Gallery **2/2 PASS**, Feed **2/2 PASS**.
- Confirmed all six reserved ports free and no `agent2-cdn-full-*` directory after run.

**Revocation limitation:** new signed URLs are denied as soon as Core changes an album's visibility or hides/deletes a post. Previously issued time-limited S3 presigned URLs may remain readable until they expire **unless the object itself is deleted**; the test explicitly verifies that deleting an S3 object makes the old signed GET fail. Immediate revocation of already-issued URLs for a retained object would require a separate data-plane/key-rotation design. This test makes no such claim. The local CDN HTTP server does not prove real Beget behavior or external CDNs; Mobile/Web contract suites use synthetic 410/5xx inputs, not live native devices. Production QA remains `READY=NO`.
