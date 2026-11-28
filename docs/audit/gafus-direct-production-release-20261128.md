# Direct production release readiness — candidate and CI, 2026-11-28

## Scope and Git identity

Read-only remote main verified with `git ls-remote origin refs/heads/main`: afb4fb0b4d2c95e04658f04160d5fd16dfe9ff12 (same as local origin/main). `git merge-base HEAD origin/main` returned that SHA. Initial candidate 98958461080373e07c6ec5ab6971730dfc109c20 (0 behind / 69 ahead); accepted source f77e07d0d608d51281b2d38653db79d663e9f4ac differs only by six QA receipt/documentation files. First-parent and merge history examined, including 6aecc682c, 54c47fcc3, worker recovery and walk read correction. No dirty main worktree touched. Dedicated worktree ~/Desktop/gafus-qa-direct-prod-20261128, branch qa/direct-prod-release-20261128.

**Corrected release source SHA: 87f6d70ef8648b684160bf22067a56126085d9e7**, 0 behind / 70 ahead of checked remote main. All five requested services share this source SHA, plus bull-board and prisma required by the coordinated seven-image release. No product or lockfile changes from accepted source. Integrate this fix into the final candidate; any further merge/report commit used for the main push changes the SHA and requires fresh SHA-bound artifacts. Do not promote f77e07d0d or 989584610 uncorrected. Six migration files differ from remote main; live ledger compatibility not tested here.

## Confirmed release blocker and fix

Initial targeted contract execution 98/101, exit 1. Actual new exports in required graph: core-client/chat2/room-presentation, core-client/chat2/draft, core-client/utils/subscription-selection, notifications-server/chat2-outbox-rows, feed-server/feed-video-recovery, media-server/chat2-deletion-rows, media-server/chat2-video-recovery, course-read-server/catalog-cards, subscription-payment-server/transitions. No removed exports in these packages versus main. The security job executes runtime-workspace-dependencies.contract.test.mjs; the old verifier is also run during API/Worker Docker builds and runtime smoke. Old counters would fail, so this was not merely a reporting discrepancy.

Fix 87f6d70e registers each of the nine explicitly and requires all nine; frozen historical 9/48 is unchanged, Worker 37/234 and API 38/244 are exact counts (old 37/225 and 38/235). The legacy additions are excluded from frozen baseline only after actual JS/declaration validation, not skipped. Updated both counting tests. Updated stale Types order test to verify existing blocking Turbo dependency build (^build), Types suite after build and before cache; no YAML workflow modifications and no gates disabled. No unrelated package or app changes.

## Local commands and receipts

Node 24 Homebrew 24.7.0 failed to start, exit 134, missing libsimdjson.26.dylib. No shared host repair. Used Node 22.23.5, symlinked only existing locked yaml, typescript and @aws-sdk/client-s3 from accepted QA node_modules (lock unchanged, read only). Initial symbols test lacked AWS SDK in isolated tree, resolved by link; not a product error. CI runner Node 24 parity remains unverified. All commands in dedicated worktree:

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
node --test ci-cd/scripts/{release-graph.contract,workflow-consolidation-contract,deploy-only-contract,release-image-manifest,production-app-only-contract,refactor-vite-release,runtime-workspace-dependencies.contract,workspace-dependency-graph.contract,cloudru-first-main-cutover-contract,chat2-proxy-cutover.contract,feed-poll-release-contract}.test.mjs scripts/observability/check-workflow-release-gates.test.mjs scripts/refactor/{ci-core-boundary-gate,ci-types-after-build,docker-package-build-boundary}.test.mjs scripts/qa/vite-release-dist-artifacts.test.mjs
node --test ci-cd/scripts/verify-production-migration-ledger.test.mjs scripts/observability/seal-vite-sourcemaps.test.mjs scripts/observability/upload-private-web-sourcemaps.test.mjs
bash ci-cd/scripts/production-schema-cutover.test.sh
```

Results: 101/101 exit 0 (job 9ceacbd5a5a5f2f974ec153bfae8b01e3d2c8ec3130d3bee); 13/13 exit 0 and synthetic cutover exit 0 (job a8eaee4dbab8d3859b5c5aaba56e2daa58d0a6b029d5729d). Mocked cutover exercises checksum drift refusal before maintenance, 503 -> stop writers -> backup -> migrate -> health -> reopen; injected Prisma failure keeps maintenance and prevents old processes restarting. Not live production backup or migration. Historical full QA is inherited for unchanged product source only, not rerun. Earlier Vite release proof (docs/audit/gafus-architecture-roadmap-20261128-stage1-11-release-followup.md) was tied to earlier SHA, not an exact new-SHA dist/digest. Physical devices owner-accepted.

## Actual CI/CD graph and side effects

- `.github/workflows/ci-cd.yml`: push main and PR targeting main. No workflow_dispatch. Main push automatically starts coordinated production release (serialized group gafus-production-deploy, cancel-in-progress false). PR builds/loads images for smoke, no image push/deploy; testing-reusable is explicitly advisory, not a blocking release gate.
- prepare-deps locked dependencies, boundary gate, dependency-ordered Turbo build, Types suite and built exports; security, observability-contracts, build-apps, cloudru-media-contracts, cutover-preflight and prepare-docker are gates. build-apps force builds Web/Admin/Trainer using GITHUB_SHA for both GAFUS_RELEASE_SHA and VITE_GAFUS_BUILD_ID; verifies private maps, packages public dist and uploads same-SHA artifact vite-public-dists-${{ github.sha }}. Private source map upload only on main push with GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=true; no public maps.
- build-images matrix: web, api, admin-panel, trainer-panel, worker, bull-board, prisma; Dockerfiles ci-cd/docker/Dockerfile-<component>-optimized. Each image ghcr.io/asmtv1/gafus-<component>:sha-<GITHUB_SHA>, linux/amd64. Three SPA images restore and validate same-SHA artifact; API/Worker build from source with pnpm deployment and runtime export verifier. On main pushes images before smoke, immutable digest used for smoke (API/Worker export verifier; SPA Nginx config and actual health/index/domain association HTTP on offline network; bull-board/prisma node version). Does not update registry :latest.
- After each successful smoke, receipt image-receipt-<component>-attempt-<run_attempt> records component/repository/digest/linux/amd64/smoke/SHA/run/attempt. release-images-manifest aggregates exactly all seven receipts for same SHA/run/attempt, verifies checksum, and uploads release-images-attempt-<attempt> (release-images.json + .sha256; retention limited).
- deploy-production only on main push after success of security, observability-contracts, build-apps, build-images, release-images-manifest, cloudru-media-contracts, cutover-preflight, beget-readonly-preflight, and cloudru-jobs-preflight unless both explicit Gallery app-only approval flags true. Calls production-deploy-reusable with source SHA, manifest payload, run ID, attempt, app_only:true, environment production. Verifies manifest before SSH and uses exact repository@digest, local aliases only. Verifies live migration ledger before maintenance, creates backup, migrates then starts/health-checks; image rollback before migrations only, schema repair/verified DB restore after migration failure. No staging.
- cloudru-jobs-sync and verify automatically follow successful app deployment unless both Gallery approval flags true; Beget post-deploy verification conditional. Actual provider flags, environment approvals, secrets, access, cloud job/CDN readiness and production migration ledger were not checked (no production interaction). Do not toggle variables to bypass checks.
- Build Single Container (manual, main only) defaults deploy=false but **always publishes** unique manual-run tag and can upload private maps when approved. deploy=true updates only that service, Prisma deploy forbidden. Not a safe local build-only substitute nor a seven-image release.
- Deploy Only (manual, main only): validates existing successful main push CI run for exact SHA and attempt, seven successful image jobs and release QA plus downloadable manifest. No rebuild/Cloud.ru Jobs; older SHA requires rollback mode and explicit SCHEMA_COMPATIBLE after independent DB compatibility review. Not valid for this unpublished candidate.
- OTA production/preview, SDK57 QA, private symbols acceptance, manual feed/chat media release workflows not launched by this app release. No Actions dispatched here.

## Receipt inventory

GitHub read-only Actions API, all workflows: `gh api "repos/asmtv1/gafus/actions/runs?head_sha=$sha&per_page=100"` returned total_count=0 for f77e07d0d, 989584610, 87f6d70e. No verified main-push run/attempt or downloadable seven-image manifest for those SHA. Local docker image list contains no matching SHA tag; no tracked release-images.json/image-receipt/public-vite-dists.json. No usable immutable candidate digest receipt, even a registry tag without smoke would be insufficient. Registry read-only package version pagination (all three SHA tags) completed with exit 0 and no matches for Web, API, Admin and Trainer. Durable job 50216114447b11fafeccc00ccf9926a8837c14c328b3599d hit the 90 s runtime limit (SIGTERM) while scanning Worker; Bull Board and Prisma were not reached. This is a partial registry inventory, not proof of registry absence for the remaining three. Regardless, no valid same-SHA successful CI run/receipt exists. Details in registry-inventory.log.

## Safe local build-only route (not executed; exact required inputs)

Docker desktop-linux is running and advertises linux/amd64 via emulation on linux/aarch64. 29 GiB free on host at inspection; no full coordinated image build performed to avoid concurrent resource consumption, no existing exact-SHA public SPA dist. Requires a clean dedicated checkout of final release SHA, working Node 24/pnpm 10.12.4, frozen dependency install, private map directory 0700, same-SHA public Vite dist and an amd64-capable builder with sufficient disk and access to locked npm/base-image dependencies. Commands below are a recipe for a future local build, not executed evidence; no publish, remote cache, or upload.

```sh
set -euo pipefail
SHA=$(git rev-parse HEAD)
test -z "$(git status --porcelain)"
PRIVATE=$(mktemp -d); chmod 700 "$PRIVATE"
PUBLIC=$(mktemp -d)
export GAFUS_PRIVATE_MAPS_ENABLED=true GAFUS_PRIVATE_MAPS_DIR="$PRIVATE"
export GAFUS_RELEASE_SHA="$SHA" VITE_GAFUS_BUILD_ID="$SHA"
export VITE_GAFUS_TELEMETRY_ENABLED=false TURBO_FORCE=true
unset GAFUS_WEB_SYMBOLS_EXECUTE TURBO_TOKEN TURBO_TEAM
pnpm install --frozen-lockfile --ignore-scripts
pnpm check:core-boundaries
pnpm --filter @gafus/prisma db:generate
pnpm exec turbo run build --filter=@gafus/web-vite --filter=@gafus/admin-panel --filter=@gafus/trainer-panel --cache=local:rw --concurrency=1
for svc in gafus-web gafus-admin-panel gafus-trainer-panel; do
  node scripts/observability/upload-private-web-sourcemaps.mjs --directory "$PRIVATE/$svc/$SHA/$SHA"
done
node scripts/qa/verify-gafus-app-links.mjs --dist apps/web-vite/dist
node scripts/qa/vite-release-dist-artifacts.mjs pack --sha "$SHA" --workspace "$PWD" --dir "$PUBLIC"
for c in web api admin-panel trainer-panel worker bull-board prisma; do
  docker buildx build --platform linux/amd64 --load -f "ci-cd/docker/Dockerfile-$c-optimized" -t "gafus-local-$c:sha-$SHA" .
done
for c in api worker; do
  docker run --rm --network none --entrypoint node "gafus-local-$c:sha-$SHA" /app/check-runtime-package-exports.mjs "$c"
done
```

Local images are not published immutable release receipts; run the remaining exact offline smoke from ci-cd.yml on three SPAs and bull-board/prisma before considering a local build valid. Existing old Vite dist cannot substitute for final SHA. Actual Linux amd64 container builds and smoke not proven by static contracts.

## Future authorized launch (DO NOT RUN as part of preparation)

When orchestrator has integrated all intended changes and owner explicitly approves direct prod, choose the *actual* final SHA and ensure remote main has not advanced and is an ancestor. For the isolated CI fix alone SHA=87f6d70ef8648b684160bf22067a56126085d9e7; if additional changes are integrated, substitute actual final commit and re-evaluate scope. Do not use uncommitted main tree. An approved fast-forward push is the automatic release trigger, not a harmless build-only check:

```sh
SHA=87f6d70ef8648b684160bf22067a56126085d9e7
REMOTE=$(git ls-remote origin refs/heads/main | cut -f1)
test "$REMOTE" = afb4fb0b4d2c95e04658f04160d5fd16dfe9ff12
git merge-base --is-ancestor "$REMOTE" "$SHA"
# Only after explicit production authorization:
git push origin "$SHA:refs/heads/main"
gh run list --repo asmtv1/gafus --workflow ci-cd.yml --commit "$SHA" --event push --json databaseId,headSha,status,conclusion,url
# Select exact new run ID from above and inspect (no rerun implied).
gh run watch "$RUN" --repo asmtv1/gafus --exit-status
ATTEMPT=$(gh api "repos/asmtv1/gafus/actions/runs/$RUN" --jq .run_attempt)
gh run download "$RUN" --repo asmtv1/gafus --name "release-images-attempt-$ATTEMPT" --dir "$RECEIPT_DIR"
node ci-cd/scripts/release-image-manifest.mjs verify --manifest "$RECEIPT_DIR/release-images.json" --checksum "$RECEIPT_DIR/release-images.json.sha256" --sourceSha "$SHA" --runId "$RUN" --runAttempt "$ATTEMPT"
```

Run watch is observation, not approval. Protected production environment approval may pause job. Deploy Only is a future redeploy only after successful verified main release: `gh workflow run deploy-only.yml --repo asmtv1/gafus --ref main -f release_sha="$SHA" -f mode=redeploy`. Never use it to skip build/QA, and never roll back across an incompatible migration.

**Status: local release contracts PASS; production GO not established.** Actual exact-SHA build, immutable seven-image receipts and protected CI/production preflight remain missing. No push, PR, Actions launch, image publish, OTA, stores, production SSH/deploy or production credentials used. No staging or physical device tests.

Evidence note: trailing whitespace in initial TAP failure log was normalized before committing; checksums cover retained files.
