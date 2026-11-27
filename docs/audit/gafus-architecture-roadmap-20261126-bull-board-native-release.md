# Bull Board and native release — implementation checkpoint, 2026-11-27

Scope: stage 7 operator diagnostics; stages 10/12 version-independent native release tooling. No commit, production deployment, publication or native installation performed. Existing concurrent refactoring remains intact.

## Queue operations

- Board registry: push, exam cleanup, reengagement, video transcoding, consent log cleanup, pet prevention reminders, consultation SLA, consultation mail, consultation reminders, feed processing and Chat2 media processing (11 queues).
- Canonical operator route: `/api/v1/admin/queues/operations`. Admin JWT/cookie authorization and fresh DB role verification via the API; generic Bull Board mutations disabled. Existing proxy aliases redirect to the canonical path. Actual production proxy/cookie behavior requires staging verification.
- Counts and oldest creation age cover pending states; sample capped at 25 per state, truncated observations explicitly marked lower bounds. Failed jobs show classified reasons and attempts without raw payloads or failure text. Redis failures are unavailable, not zero. Metrics availability and bounded singleflight reads.
- Replay requires exact job ID, failed state, attempt/finished-on identity and confirmation. Only idempotent consent cleanup is approved; other queues require reconciliation. ACK means queued, not completed. Unknown ACK never auto-retries. Late read after timeout cannot start retry. Consent cleanup Worker now throws on failed DB effect rather than returning false completion. Replay singleflight is process-local; BullMQ failed-state transition is atomic. Multiple operator processes require additional concurrency acceptance.

## Native release

- Common registered descriptor validation, generated config verification, iOS artifact verification and archive rules. Daily device commands no longer target 1.7.5 implicitly. Generic iOS store profile and commands, Android store descriptor validation, exact remote build number and fresh artifact checks. Generic candidate preparation/finalization remain separate from actual build.
- Final APK/AAB/IPA verifier binds platform, app/runtime version, build number, native release ID where embedded, fingerprint, endpoint, signing key and certificate to registered descriptor. EAS final artifact hook requires the descriptor. Existing historical 1.7.5 commands/profiles remain explicit for reproducibility, not defaults. No weakening of signing, store payment policy, or mandatory OTA checks.
- `.easignore` synchronized with current `.gitignore` including `.types-build-*/`; credential exclusions preserved.

## Verification and handoff

- 7/7 queue model tests, 18/18 focused Node native release tests, 9/9 Python artifact tests. 21/22 additional iOS/native fingerprint/candidate tests: installed expo-widgets SDK57 Ruby source lacks expected tracked patch; patch registration and patch content present in source. Resolve with clean frozen install and rerun, do not waive assertion.
- Disposable socket-only Redis + BullMQ 5.2.0: counts/age/pause, failed replay to actual worker completion, unavailable semantics passed. No production Redis used.
- Strict TypeScript check of queue operations module passed. API composition 0/34 legacy installers, Worker Prisma zero, workspace graph 67 projects/zero cycles, diff whitespace check passed.
- Remaining acceptance: mounted authenticated gateway/proxy/browser and role matrix, actual native clean signed APK/AAB/IPA build and artifact descriptor checks, historical release compatibility matrix, provider/EAS and device checks. Full workspace typecheck/build and global QA intentionally not claimed. Current checkout includes concurrent uncommitted work, so production release requires a clean committed snapshot and registered descriptor.
