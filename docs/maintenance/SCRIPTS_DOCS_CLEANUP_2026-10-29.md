# scripts/ and docs/ cleanup - 2026-10-29

## Removed

- 144 isolated, unreferenced scripts matching `scripts/refactor/web4-social-3501-*`: historical revisions of attach, driver, and parity tests. Searched 4,392 source/documentation files and found no callers outside this family. Next.js `apps/web/package.json` is absent.
- 3 obsolete `.log` files and 2 empty `.pid` files in scripts/refactor.
- 4 short duplicate top-level docs summaries, superseded by docs/current and docs/README.md.

## Consolidated / archived

- Three dated 2026-10-29 notes combined verbatim into `RECENT_CHANGES_2026-10-29.md`.
- Four Stream Chat predecessor documents relocated to `docs/archive/legacy-stream-chat/`. They are not the Chat 2.0 source of truth.
- Prior web/mobile release note relocated to `docs/archive/historical-releases/`.
- Added entrypoints scripts/README.md, scripts/qa/README.md, scripts/refactor/README.md.

## Preserved

All active package.json/CI paths, current `scripts/qa` scripts, fixtures in scripts/refactor, docs/qa evidence, API/media contracts, legal/runbooks, environment files, DB dumps, media and secrets. No production operations, push, or Main repository access. This is a structural cleanup, NOT proof of full QA pass.

## Additional verified dead Next-only helpers

Deleted 30 more standalone Next-specific parity scripts and their dedicated attach/driver wrappers after checking references. Old architecture overview and stepStore docs pointing into removed apps/web were deleted. Updated the remaining five stale documentation links to current Vite/Hono domain references. No current QA scripts modified.

## Dangling local runners

Removed 8 more unreferenced and currently unusable wrappers (web1/web3/web4/web5 families) whose hardcoded dependencies no longer exist, and one generated infra032 receipt pointing at a removed .log. No callers were found outside the files themselves.

## Verified package / workflow references (follow-up 2026-10-29)

The initial audit falsely reported 16 missing paths by matching the `scripts/` suffix of full paths such as `ci-cd/scripts/...` and `packages/prisma/scripts/...`. A corrected check using **complete paths from repository root** confirmed that all 15 references in GitHub Actions point to existing files. Workflows were not modified.

The sole real broken command was `package.json` → `migrate:video-cuid`, referencing `scripts/migrate-video-paths-to-cuid.ts`. This script had already been **deleted in commit ef2502c9**. The historical implementation could mutate PostgreSQL and CDN objects; it is incompatible with the safe no-production-writes cleanup. Removed the dangling npm script entry rather than resurrecting a legacy data migration. No migrations were executed.

This result only resolves missing command-path references; it is **not** proof that every CI job or production Docker image will build.

## Release-path validation after correcting the audit

- Correctly parsed **32 command-like script references** in root package scripts and GitHub Actions; all resolve to existing files.
- All **10** GitHub Actions workflow YAML files parse successfully.
- The production course-cache contract test had an obsolete assumption that Web, Trainer and API each pass server-only flags. Current Compose has static Vite Web/Trainer/Admin containers and a Hono API, so the test now checks API-only cache flags. No Compose/runtime settings were changed.
- **31/31** targeted Node CI contract tests pass. `node scripts/check-workspace-graph.mjs` reports 36 projects, zero dependency cycles. `git diff --check` passes.
- No production execution, CI dispatch, build publication, push, DB migration, or changes to GAFUS Main. Full Docker builds, runtime QA and remote CI have not been verified by this check.
