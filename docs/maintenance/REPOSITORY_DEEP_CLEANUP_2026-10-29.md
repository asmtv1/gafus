# Deep repository artifact cleanup — 2026-10-29

## Scope and safeguards

Work confined to `/Users/asmtv1/Desktop/gafus-refactor` on `vite`.
No reads/writes to GAFUS Main, production PostgreSQL/S3/CDN, Cloud.ru Jobs, DNS, or production deployments. No commits, merges or pushes were performed by this cleanup. Existing Git stage/index was left untouched, except ordinary working-tree file deletion and `.gitignore` changes.

The traversal covered 826 non-protected source/QA subdirectories with 7,452 files (`apps`, `packages`, `docs`, `scripts`, `infra`, `docker`, `ci-cd`, `.github`, `ios`, `output`, tests, patches and exports). Nested build/runtime/database/vendor areas were inspected by category and excluded from blanket deletion. No leftover `.DS_Store`, editor swap, `.orig`, `.rej`, `.bak`, `.tmp` candidates were found in the non-protected source traversal at the end.

The root changed from approximately **28 GiB** before this pass to **17 GiB** after this pass (macOS `du -h` rounded figures). The project-local API was cleaned separately earlier; see [API_ARTIFACT_CLEANUP_2026-10-29.md](./API_ARTIFACT_CLEANUP_2026-10-29.md).

## Confirmed reproducible material physically deleted

| Scope | Removed | Approx. logical footprint | Why safe |
|---|---|---:|---|
| `apps/mobile/.chat2-verify-*` and `.chat2-avatar-verify-*` (4 dirs) plus `docker/posthog/runtime/posthog` (clean nested upstream clone) | 5 dirs, 20,456 files total | 693.6 MiB | Expo static exports and upstream clone. `docker/posthog/runtime/.env`, compose config and `share` kept; `up.sh` re-clones on demand |
| `.local-pg-scratch/qa-ios-derived-20261029` and `qa-ios-qa-bundle-derived-20261029` | 2 dirs | ~9.8 GiB | Xcode DerivedData only: Build, module/index caches and build logs. Not a PostgreSQL cluster, no `.ipa` or `.xcarchive`; no Xcode compiler running. New native build required before reusing these paths |
| `.local-pg-scratch/chat2-{android,ios}-export`, `chat2-{cutover,final,final2}-*` (8 dirs) and `web1-vite-build-*` (6 dirs) | 14 dirs, 1,707 files | 832.0 MiB | Old Expo export bundles and generated Vite web assets |
| `.local-pg-scratch/ag2-reminders-client-ios-export-*`, `qa-startup-static-png-*`, `web4-question-card-avatar-parity-r1` | 4 dirs, 489 files | 256.8 MiB | Further standalone Expo/Vite export directories |
| `apps/trainer-panel` temporary QA/preview dirs, `apps/trainer-panel/src/trainer-vite/.ag4-*` browser profiles, `apps/mobile/.ag2-tmp`, `.ag3-tmp` | 13 dirs, 1,043 files | 36.4 MiB | Archived compiler logs, stale snapshots, isolated browser profiles and preview builds. Source and tests unchanged |
| `infra/{feed,gallery}/.terraform/providers` | 2 dirs | 238.9 MiB | Downloaded Terraform providers; `.terraform/terraform.tfstate`, `.terraform.lock.hcl`, HCL and all real infra files preserved. `terraform init` will be needed to redownload providers |
| `.VSCodeCounter`, `.local-admin-tmp`, `.ag4-adapter-restore-20261023` | 3 dirs | 2.37 MiB | July IDE metrics; local V8 cache; obsolete small adapter archive. `.VSCodeCounter` had tracked historical statistics, now a working-tree deletion to be reviewed before commit |
| `apps/admin-panel/.ag4-shared-dist-recovery-20261017/cache` | 1 dir, 1,112 files | 16.8 MiB | Generated Node/corepack cache only; preserved adjacent isolated gallery DB and diagnostics |

Also removed Finder metadata in the isolated Admin QA directory and ignored new `.VSCodeCounter` reports in root `.gitignore`.

## Intentionally preserved — not garbage

- `.local-pg-scratch`: ~4.5 GiB remaining, including **running PostgreSQL 18 production-snapshot clone**, other isolated DBs, local S3 files, test secrets, current QA logs and installed browser binaries. Removed only explicitly verified build/export subfolders from this container; never deleted its `data`, `pgdata`, `nonprod-s3`, `.env` or credential paths.
- `.ag1-course-pg`: ~149 MiB; active PostgreSQL 14. `.design-verify` ~147 MiB; isolated PostgreSQL state. `docker-data` ~185 MiB; local PostHog PostgreSQL/ClickHouse data. None deleted.
- `apps/admin-panel/.ag4-*-pg-*` and `*.ag4-*` QA clusters: ~1.4 GiB, many containing `pgdata` or snapshots. G05 scratch includes a `.dump` and a generated Prisma client directly referenced by opt-in tests. Preserved. The 299 MiB Chrome for Testing binary is pinned by `scripts/refactor/browser-cookie-loopback-smoke.py`; preserved.
- `.local-browser-mcp`: ~761 MiB including Playwright browser installation, profiles and QA artifacts; preserved to avoid disrupting interactive QA.
- `.git`: ~2.3 GiB; no history rewriting, Git GC, or prune. Root `node_modules`: ~4.2 GiB; preserved for typechecks/builds. `apps/mobile/ios/Pods` (~1.4 GiB) was preserved for native development. The obsolete root `ios/Pods` (~1.0 GiB) was subsequently removed by a concurrent operation; the root iOS project was verified absent on 2026-10-30.
- `output`: ~93 MiB visual QA screenshots and screenshots referenced by project documentation; some files are Git tracked. Preserved.
- `apps/gallery-cloud/artifacts` (~54 MiB) and generated feed/gallery bundles: preserved because Terraform configuration directly references package zip paths. Canonical source, tests, Prisma schema/migrations, Web/Mobile images, route configs, release scripts and CI remain intact.
- `.gafus-refactoring`, `.cursor`, `.agents`, `snapshot-2026-05-13`, course assets, dumps and release QA docs: retained as potentially useful documentation or active developer context.

## Limits and next gates

This is a conservative physical cleanup of verified generated/orphan files, **not** an assertion that every code path is free of unused logic. Dead code and obsolete domain tests require dependency-by-dependency analysis and must not be removed solely by filename. The root and protected directories have been inventoried, but database contents and private secrets were not opened or modified.

`git add -A` is unsafe before a separate staging/security audit. Git's staged index was already being modified during this audit by another workflow; this cleanup did not call `git add` or `git rm`. The old tracked Apple `.p8` key is currently absent from the index (verify staged removal, history and rotation separately before any push); ignored files can still contain secrets. Full release readiness remains **NO** until native/offline/Playwright and security gates pass.

`git diff --check` passed immediately after physical cleanup. Re-run typechecks from the active working tree after staging settles; list exact pass/fail statuses below rather than assuming results from previous test sessions.

## Post-clean checks

- All **7/7** typechecks PASS (exit code 0): API, Web Vite, Mobile, Admin Panel, Trainer Panel, Gallery Cloud and Feed Cloud runtime.
- Clean source traversal: **826 directories and 7,452 files**, excluding protected vendors/PG data/cache roots; 0 safe `.DS_Store`/`.orig`/`.bak`/`.tmp` candidates remaining in active source.
- `git diff --check`: PASS.
- Read-only checks showed active PostgreSQL processes for several local projects; these data trees were preserved. Docker had no currently running containers when the clean third-party PostHog checkout was deleted.
- This cleanup did not call `git add`, `git rm`, `git commit`, `git push`, `docker compose` or any Cloud.ru action.

### Fresh-checkout portability issue repaired

`apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts` imported an unconditional helper from ignored `apps/api/g1-g03-username-realpg-v1/`. On a fresh checkout the Vitest module import would fail even when its real-PG tests are skipped. Moved the synthetic readback adapter to versionable `apps/api/src/test/fixtures/g03/g03-postwrite-readback.adapter.ts`, adjusted both package import paths and the local opt-in Vitest alias. The ignored historical folder retains its non-production captures.

Rechecked after this change: `@gafus/api typecheck` PASS; two source-only reminder test files **10/10 PASS**; real-PG G03 **10 SKIPPED** by explicit opt-in gate (not executed). Source-only G05/G16 tests were **49/49 PASS** in an earlier scoped cleanup (see API audit). This cannot be reported as a real-PG acceptance PASS. The new adapter and its README are not ignored and must be included deliberately in the reviewed Git commit.


## 2026-10-30 — Old root iOS project

The obsolete root `ios/` directory (historical `gafusru.xcodeproj`, ~1.0 GiB primarily Pods) disappeared from the worktree during a parallel operation while the two iOS trees were being compared. It was **not removed by the inspection script**; do not attempt another deletion. The modern `apps/mobile/ios/Gafus.xcodeproj`, `Podfile`, entitlement and current mobile app configuration remain present. Both paths are independent. The root iOS bundle configuration was legacy `com.asmtv1.gafus.ru`, while `apps/mobile/app.json` declares current bundle `ru.gafus.app`. No tracked build workflow requires the root legacy Xcode project.

Git still lists 19 tracked root `ios/` files as deleted in the working tree but not staged at inspection time. `apps/mobile/ios` remains ignored intentionally under Expo CNG and therefore will not be committed automatically. A fresh-checkout native build remains an independent release acceptance check. No Git staging/push/production actions were performed by this inspection.
