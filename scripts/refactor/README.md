# Internal Refactor verification and fixtures

This is NOT production runtime nor a supported release CLI. Existing manual probes, local runners, and test fixtures remain at their original paths to preserve hardcoded script references, imports, and active QA workflows.

Categories (counts include nested fixture files):
- fixtures and support: 120
- web/feature and visual probes: 118
- local service and media tools: 30
- infrastructure checks: 20
- isolated agent and test harnesses: 13

Current complete acceptance tests: [scripts/qa](../qa/README.md), [docs/qa](../../docs/qa/CURRENT_RELEASE_STATUS.md).

Only run from the Refactor root after inspecting the target DB/URLs and preflight. Never touch production. A number of older scenarios assume removed Next.js `apps/web` and are NOT proof of current Vite functionality. Do not delete infra032 fixtures just because files look duplicated; test cases intentionally use copies.

The 144 unreferenced iterations of the former web4-social-3501 Next/Vite comparison were deleted, along with five runtime .pid/.log leftovers. Another 30 dead Next-only standalone checks and dedicated wrappers were also removed after reference review.

Additional 8 unused wrappers whose called source files were already missing, plus one generated receipt, were deleted after reference analysis.
