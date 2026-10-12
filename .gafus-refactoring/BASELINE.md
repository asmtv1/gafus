# Baseline — 2026-10-11 (GMT+4)

- Branch: `main` tracking `origin/main`; working tree initially clean.
- Commit: `18fb261f601da17d73f19602045228a0e23c4205`.
- `pnpm --filter @gafus/core typecheck`: PASS.
- `pnpm --filter @gafus/web typecheck`: PASS.
- `pnpm --filter @gafus/mobile typecheck`: PASS.
- `pnpm --filter @gafus/core test`: FAIL (2 pre-existing failures in `trainerCourseService.test.ts`: expected guideContent=null, received undefined); 1169 passed, 85 skipped, 2 failed. Occurred with pristine tree before refactoring.
- Initial Web/API/Core/Mobile full build/runtime smoke: NOT_RUN.
- Desktop device: MacBook-Air-Andrej.local; Bridge direct-command sandbox lacks socket binding; use isolated test DB if integration tests require it.
