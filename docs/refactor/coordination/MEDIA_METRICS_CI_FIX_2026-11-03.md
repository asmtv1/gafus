# Media metrics Worker Prisma boundary fix — 2026-11-03

Repository: `/Users/asmtv1/Desktop/gafus-refactor`; current branch: `main`.
Base commit: `143bf3bba491a60e0a98616357b8498b1c69985f`.

GitHub Actions run 41518173379, security job 125529003195 failed at
`Guard Worker Prisma boundary`: `media-processing-metrics.ts` directly imported Prisma.

Moved the media metrics service and its query/error tests into Core systemHealth,
following the existing mail delivery metrics service pattern. Worker keeps the
same public function as a Core re-export. Added the Core package subpath export
and Worker TypeScript path mapping. Prometheus output, query semantics and error
propagation are unchanged; no new boundary exceptions were added.

Local validation:
- Core unit suite: 2274 passed, 169 skipped (286 files passed, 25 skipped).
- Core build and Worker build: passed.
- Worker full unit suite after rebuilding Core: 190 passed, 2 skipped (36 files passed, 1 skipped).
- Worker Prisma boundary: passed, 7 existing exceptions, no new runtime imports.
- App Prisma boundary and Core server domain boundary: passed.
- ESLint for the changed Core and Worker TypeScript files: passed.
- git diff --check: passed.

The first Worker suite invocation preceded Core compilation and failed resolving
its new package export; the complete suite passed after the Core build. Tests
were local; GitHub Actions was not rerun. No commit, push or deployment performed.
Unrelated pre-existing working-tree changes, including package versions, preserved.
