# Smart Tracking — follow-up implementation and independent QA handoff
25.11.2026; HEAD 8204d236d + previous uncommitted first/second stage. No release.
**fieldAcceptance = not_run; releaseReady = false.** This is not an independent QA sign-off.

## P0
- Additive SQLite session epochs apply a half-open pause/finish boundary to both legacy and v2. Late callbacks before a new owner/session epoch are rejected. Unknown checkpoint formats are protected; the current app can stop collection without rewriting future data. A stale journal cannot replace a different active walk or resurrect a completed one.
- Exact bounded median undo/replay; when raw tail is missing or too old, discard the potentially future-dependent suffix (including the last non-anchor median vertex) rather than invent geometry. Synced seq is protected; conflicts fail closed instead of rewriting server history. Route revision invalidates derived display data.
- Timer/journal first; already granted GPS can initialize while other permission prompts are pending. New permission prompts remain serialized. Cross-runtime same-ID pause/resume races and native monotonic clock behavior still need device acceptance.
- Opt-in QA capture: build flag EXPO_PUBLIC_WALK_QA_CAPTURE=1, explicit consent before next walk. Single capture per owner, AES-GCM ciphertext with per-capture SecureStore key and scoped AAD, 24-hour expiry (cleanup at next app start/foreground or active capture callback), 20k fix cap, 256 per batch. No plaintext fallback. Explicit share-sheet export after finish; raw coordinates are never synced or sent to logs/analytics. Account switch/logout and tombstone clear capture and key. If native crypto unavailable, fail closed; normal tracking continues. Node SQLite tests use real Node AES-GCM and a mocked SecureStore/native adapter, not proof of actual binary module support.
- QA records measured/received times and lifecycle generation/open/close, Android request-time snapshots and iOS reported historical intervals. Neither is marked complete without independent verification. Raw capture is best effort; truncated flag on missed batch / error / cap; do not use incomplete recordings as reference.
- Bounded encrypted shadow checkpoint for v2 median and config3 processes captured stream. Upon close, clears raw checkpoint to aggregates; late close that cannot be replayed is incomplete. Canonical writer remains independent. Exact offline replay on exported boundaries can verify the shadow.

## P1
- Config3 Smart GPS Lock: 60 m false start becomes 0 on synthetic; clean 180 m preserved. v1/v2 config1/config2 golden replay unchanged.
- Pure smartMotion classifier separates position/motion/distance confidence; complete zero steps + apparent drift -> unknown rather than false stationary distance; short out-and-back with steps -> possible movement, no invented geometry. Complete interval evidence, no double meters, no pro-rating overlapping intervals.
- Pure stride calibrator by owner/device/source/tempo; prior 0.8, complete reliable 30–120 s windows, at least 30 steps and >=5 disjoint windows across >=2 walks, deduplicated and stable. Not a production persisted profile. New summary/API/writer and personalized calibration persistence stay off until independent complete step intervals and acceptance are available.
- alpha-beta and robust Kalman display-only experiments on same admitted fixes, variable time delta, innovation weighting/reset; never produce predicted-only canonical vertices. No filter selection from synthetic alone.
- QA GPS profile pinned by capture: EXPO_PUBLIC_WALK_QA_GPS_PROFILE=control (existing fixed walking) or fast (Android 2 s/2 m; iOS 2 m, no automatic pause/deferred interval). No automatic economy rollout; no guaranteed short-movement wake mechanism yet. Need paired measurements for battery/CPU/RSS and callback behavior.
- Mobile marker uses same measured position as age and accuracy text, stale status at 10 s; no independent MapLibre marker. AppState gates refresh. Shared chunk cache reuses completed RDP chunks; exact full-vs-incremental tests 10k and 100k/100001 limit. Native rendering latency and storage budget not measured.

## P2
- Final display version 1 derived from canonical, same geometry on mobile/web. Optional EXPO_PUBLIC_WALK_FINAL_DISPLAY=1 for local atomic SQLite derivative keyed by version, input max seq and route revision; publish only completed non-deleted session after recheck; tombstone clears cache. Zero change to canonical meters. No server revision or rewrite; identical display algorithm rather than unvalidated smoother.
- EXPO_PUBLIC_WALK_BACKTRACK=1 enables explicit read-only offline SVG return by last continuous segment, bounded local progress search and ambiguity refusal; no crossing gaps or nearest-point jumps to earlier segments; off-route confirmed on multiple observations. No tiles or network required for schematic. Not verified on actual devices/real routes.

## P3 / release
- No commercial matching service, map snapping, continuous IMU, PDR/ML or native fusion: plan makes these conditional on measured remaining P1 defect, energy and field comparison. No proof of benefit yet.
- Android A53 not connected/authorized; physical iPhone unavailable at 15:27 local. No physical field walks, native crypto, Hermes, long background runs, power measurements, signed recovery/rollback, store fingerprint or PostgreSQL independent acceptance. No claims of real-world accuracy.
- No push/commit, build upload, production deploy, public or tester OTA. Existing unrelated changes retained. All runtime profiles use GAFUS OTA when release is separately authorized and validated.
- Next independent QA: install signed tester package on actual iOS/Android profiles, enable capture and consent on agreed non-private test polygon, run exact protocol in original plan (standing, slow, turns, gaps, lock screen, offline, force-stop, 3–4h and A/B battery; >=20 independent walks/platform and >=3 participants for rollout). Verify native SecureStore/AES and export; use separate reference windows, not same-phone GPS as truth.

## Reproduce
```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm --filter @gafus/core-client test src/walk-tracking
pnpm --filter @gafus/core-client build
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile exec vitest run src/features/walk
pnpm --filter @gafus/web-vite exec vitest run src/features/walks
pnpm --filter @gafus/api exec vitest run src/routes/v1/walks.test.ts
pnpm --filter @gafus/tracking-server exec vitest run src/walksService.test.ts
node scripts/qa/walk-gps-replay.mjs --require-synthetic | cmp - docs/audit/walk-gps-replay-20261125.json
node scripts/qa/walk-smart-tracking-replay.mjs --require-synthetic | cmp - docs/audit/walk-smart-tracking-replay-20261125.json
# Only explicitly exported files outside the repository:
node scripts/qa/walk-smart-field-replay.mjs --capture /private/path/record.json --reference /private/path/windows.json
```
Reference format: JSON array of independently annotated windows with generation, from/to (epoch ms), steps, complete, displacementCorroborated, optional expectedMeters. Never commit these files. Replay output contains aggregate counts/lengths only, not coordinates/timestamps/IDs. A successful replay is not field sign-off.
