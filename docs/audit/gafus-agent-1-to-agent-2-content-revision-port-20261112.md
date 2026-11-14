# A1 → A2: course revision checkpoint

Completed Core→server 26 → 25; frozen 41: 16 resolved, 0 new, historical 117 retired. PostgreSQL remains revision authority, Redis publication is only best-effort. Missing DB reader returns `null` (bypass cache).

**Important:** all 10 SHA-256 values in adjacent JSON were recomputed from the *current* worktree after system recovery. They are not earlier before-state hashes; A2 must resolve shared edits semantically. No merge/push/deploy.

- **Core old cache+lesson**: PASS (30 tests, 0 skipped) — `/tmp/a1-content-revision-target-tests.log`
- **Core new fail-closed port**: PASS (4 tests, 0 skipped) — `/tmp/a1-content-revision-port-core-tests.log`
- **API SQL install**: PASS (1 tests, 0 skipped) — `/tmp/a1-content-revision-api-test.log`
- **Full Core**: PASS (2107 tests, 136 skipped) — `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-revision-core-full.log`
- **Full API**: PASS (2753 tests, 266 skipped) — `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-revision-api-full.log`
- **Architecture**: PASS — `/tmp/a1-content-revision-boundaries.log`
- **Core TS**: PASS — `/tmp/a1-content-revision-core-ts.log`
- **Core build**: PASS — `/tmp/a1-content-revision-core-build.log`
- **API TS**: PASS — `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-revision-api-types.log`
- **Course read TS**: PASS — `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-content-revision-server-types.log`

Not accepted: real PostgreSQL trigger/cache race, Redis outage end-to-end and 25 remaining edges / final 33+5 gates.
