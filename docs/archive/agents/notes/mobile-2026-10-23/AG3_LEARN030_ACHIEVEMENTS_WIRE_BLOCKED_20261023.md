# AG3-LEARN030 / AG1-002: Achievements JSON wire dependency blocker

Date 2026-10-23. Status: BLOCKED_BY_AG1_EXPORT.
Git and physical root verified: /Users/asmtv1/Desktop/gafus-refactor. Expected branch: vite.

## Single dependency snapshot
Preflight OneShot command exited 127 because rg was not installed, BEFORE reading dependency source. One subsequent grep/sed command (exit0) performed the only actual shared-export read. It found:
- packages/types/src/data/achievements.ts exports only domain Achievement (unlockedAt?: Date) and domain AchievementData (lastUpdated: Date), no AchievementWire or AchievementDataWire.
- packages/types/src/index.ts did not expose AchievementWire / AchievementDataWire in this same single read.
- The checked AG1 plan search had no completed AchievementDataWire producer/export evidence; previous AG1 course Date-to-JSON wire handoff does not count.
- Existing Mobile achievements.ts imports AchievementData, declares getAchievements(): Promise<ApiResponse<AchievementData>> and apiClient<AchievementData> for GET /api/v1/achievements. It already keeps requestGuard and suppressSubscriptionPaywall: true.
- Existing Mobile achievementsQuery.ts imports AchievementData in the granted AchievementResult and achievementResultForResponse data field. The current verifiedAchievementActor, sameAchievementActor, achievementsForActor actor/epoch gate, query keys and error-code envelopes must remain.

## Exact dependent work AFTER AG1 publishes both shared exports + evidence
1. Confirm published shared AchievementDataWire and nested AchievementWire, including the @gafus/types barrel, and actual AG1 completion evidence. Do not treat this request as a delivery.
2. In Mobile achievements.ts replace AchievementData with AchievementDataWire only in imported type, getAchievements return generic and apiClient generic. Preserve URL and all transport options verbatim.
3. In achievementsQuery.ts replace the domain type with AchievementDataWire in granted AchievementResult and achievementResultForResponse data. Keep current actor/binding guards, query keys, refetch settings, paywall/error behavior and achievementsCoursesForActor intact.
4. Use TypeScript to locate any affected existing typed READ fixture or consumer; retain ISO string dates for lastUpdated and optional unlockedAt without Date hydration. Run typecheck + scoped ESLint/diff only after the real producer dependency exists. No synthetic suite, runtime auth changes or entitlement trust relaxation.

## Actual scoped result
BLOCKED_BY_AG1_EXPORT. No Mobile source changes, shared type edits or local duplicate contracts. No tests, typecheck or ESLint run; no fabricated PASS result. No polling or second shared export lookup. Existing peer dirty and all closed nativeCAS/auth/security/finance/provider/media/offline/replay/system gates preserved. Coordinator + AG1 own unblocking; no production, commit, push or deploy.

Mobile source SHA-256 at blocker checkpoint:
- apps/mobile/src/shared/lib/api/achievements.ts: a78b61f093f985fe0887f40877b7c8efc89f6e123f5fea3052bde0cd4863976d
- apps/mobile/src/shared/lib/api/achievementsQuery.ts: a6c2de8bd7c74db93c4ae0c58260a5dff38593b53843993e0550e5f9bf6589db
