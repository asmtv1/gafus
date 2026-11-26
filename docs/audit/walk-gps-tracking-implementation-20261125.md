# GAFUS — GPS walk tracking implementation candidate

Date: 2026-11-25. Local main working tree, baseline HEAD 8204d236d. Not committed, deployed or published as OTA. Independent acceptance remains mandatory.

## Implemented

- `@gafus/core-client/walk-tracking`: preserved v1 math, deterministic v2 event reducer and versioned configuration, bounded 2-second reorder window, quality/motion/segment separation, epoch and timestamp guards, duplicate timestamp selection, checkpoint restore. Baseline config 1; median config 2 uses one accepted-fix lookahead, preserves confirmed reversals, and flushes on stop/gap.
- Mobile: additive SQLite checkpoint, owner/walk scoping, transaction with canonical points and meters, late pause boundary, restart recovery, delete/logout cleanup, pin mode/config at new walk creation, confirmed zero distance versus unknown. Old walks remain v1. Android/iOS task name, native modules, permissions and sync DTO unchanged. Existing v1 adaptive policy remains; v2 holds walking/high-quality profile until field measurements support changes.
- Mobile and web: common segmented GeoJSON, 2 m chunk-bounded metric RDP with protected endpoints/turns, page cursor validation, 100,000-point explicit safety limit, partial-history feedback. Mobile live reads only new seq, with metrics/status in the same bounded SQLite read transaction; no overlapping refresh.
- API: strict existing DTO tests for null/zero/positive distance and canonical v2 points. No Prisma migration. New v2 persists only accepted route rows; old v1 behavior unchanged.
- Shadow mode keeps v1 as sole public writer and persists candidate aggregates plus bounded checkpoint tail locally; no raw diagnostics telemetry or upload.

## Reproduction

```sh
pnpm --filter @gafus/core-client build
pnpm --filter @gafus/core-client exec vitest run src/walk-tracking
# Node 22+ required to execute real SQLite tests; Node 20 skips that suite.
pnpm --filter @gafus/mobile exec vitest run src/features/walk
pnpm --filter @gafus/web-vite exec vitest run src/features/walks
pnpm --filter @gafus/api exec vitest run src/routes/v1/walks.test.ts
pnpm --filter @gafus/tracking-server exec vitest run src/walksService.test.ts
node scripts/qa/walk-gps-replay.mjs --require-synthetic
```

Verified: 13 core GPS tests, 112 mobile tests (including 10 actual SQLite tests using Node 22), 5 web tests, 13 API tests, 3 tracking-server tests: 146 passed. Synthetic gate 6/6 passed.

## Synthetic replay results

| Scenario | Observed truth, m | Legacy v1, m | v2 baseline, m | v2 median, m |
|---|---:|---:|---:|---:|
| Alternating stationary drift | 0 | 2250 | 0 | 0 |
| Slow straight | 180 | 169.2 | 180 | 180 |
| Clean square | 160 | 160 | 160 | 160 |
| Noisy square | 160 | 187.947 | 201.198 | 173.517 |
| Gap and recovery (observed legs only) | 15 | 95 | 15 | 15 |
| Running | 600 | 600 | 600 | 600 |
| Out and back | 200 | 200 | 200 | 200 |

Exact stationary trace: 7 legacy segments versus 1 for both v2 variants. Median actual noisy-square position RMSE 2.562 m, max measured corner error 3.557 m (all three vertices). The unsmoothed v2 baseline regresses noisy distance and must not be selected as release default. Median is the candidate for independent testing, not an approved production algorithm. Its extra accepted-fix delay, native delivery and 5-second map polling need measured foreground latency. Offline EMA and Kalman comparisons are in the replay JSON.

## Test configuration and recovery

Set these only for an explicitly scoped local/test OTA bundle, not a public release:

```sh
EXPO_PUBLIC_WALK_TRACKING_ENGINE=shadow
EXPO_PUBLIC_WALK_TRACKING_VARIANT=median
# Second QA stage, after shadow verification:
EXPO_PUBLIC_WALK_TRACKING_ENGINE=v2
EXPO_PUBLIC_WALK_TRACKING_VARIANT=median
```

Default/unset engine remains v1. Both mode and config are pinned at walk start; clearing the setting in a recovery bundle selects v1 for new walks while finishing existing v2 walks with the compatible reader/writer. Signed recovery artifact and installation rehearsal are not done. Build core-client before Metro export on each compatible release branch. No native fingerprint verification, signed OTA generation, or release-branch cherry-pick was performed.

## Remaining acceptance and known limitations

- Independent measured tracks on Samsung A53 and physical iPhone, including RuStore and replacement Google Play profiles; Hermes parity; background/force-stop, battery, frame time, 3–4-hour walks, and offline signed recovery must be verified. No field data was available in this implementation run.
- Real step-interval evidence/activity recognition, measured adaptive profile selection, optional tester raw capture with TTL, and full field fixture corpus remain pending. Existing step counters and fallback remain in place.
- Checkpoint windows have bounded raw coordinates, but no optional diagnostic exporter or tester capture UI. Shadow aggregates remain local. Config and thresholds are provisional.
- RDP tolerance 2 m and maximum 100,000 rows are implementation decisions from the proposed range; field visual/CPU/memory acceptance remains open. The incremental reader still rebuilds GeoJSON when a new page arrives; block-level cached geometry is a future optimization if measurement requires it.
- Native task callbacks carry measured/received times, but no native-generated epoch identifier. Strict epoch boundary is enforced in SQLite; cross-process and OS-specific race behavior still requires device QA. The late pause test covers row timestamps and totals; median lookahead near a racing boundary deserves dedicated device replay.
- No release until the independent QA matrix in the original plan passes. Do not turn on ALL or mandatory OTA now.
