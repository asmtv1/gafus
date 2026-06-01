# Mobile Rewarded Paywall Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the mobile paywall to parity with web rewarded credits behavior for articles, course steps, daily-course steps, and consultations.

**Architecture:** Mobile keeps one shared target-aware `AppSubscriptionPaywall`. Screens pass an optional rewarded target and callback; the paywall owns rewarded status, ad session creation, ad display, grant, query invalidation, and callback execution.

**Tech Stack:** Expo Router, React Native, Zustand, TanStack Query, Vitest, `yandex-mobile-ads`.

---

## File Structure

- Modify `apps/mobile/src/features/app-subscription/store/paywallStore.ts`: store rewarded target and callback context.
- Modify `apps/mobile/src/features/app-subscription/paywall-deferral.test.ts`: red tests for target/callback store behavior.
- Modify `apps/mobile/src/features/rewarded-ads/adapter/yandexRewardedAds.ts`: return grant result after rewarded callback completes.
- Add `apps/mobile/src/features/rewarded-ads/adapter/yandexRewardedAds.test.ts`: red-green adapter tests.
- Modify `apps/mobile/src/features/app-subscription/components/AppSubscriptionPaywall.tsx`: render rewarded CTA and run ad/grant flow.
- Modify `apps/mobile/src/shared/lib/api/articles.ts`: add `unlock(slug)`.
- Modify `apps/mobile/app/(main)/articles/[slug].tsx`: use target-aware paywall for paid article content.
- Modify `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx`: open target-aware paywall for locked steps and unlock after grant.
- Modify `apps/mobile/app/(main)/daily-course/[scheduleId].tsx`: open target-aware paywall for locked daily steps and unlock after grant.
- Modify `apps/mobile/src/features/consultations/components/ConsultationSlotsCalendar.tsx` and `apps/mobile/app/(main)/consultations/booking-confirm.tsx`: open target-aware paywall on `SUBSCRIPTION_OR_CREDITS_REQUIRED`.

## Task 1: Paywall Store Context

**Files:**
- Modify: `apps/mobile/src/features/app-subscription/store/paywallStore.ts`
- Test: `apps/mobile/src/features/app-subscription/paywall-deferral.test.ts`

- [ ] Step 1: Add failing tests for target/callback storage and clearing.
- [ ] Step 2: Run `pnpm --filter @gafus/mobile test -- src/features/app-subscription/paywall-deferral.test.ts` and verify the new tests fail on missing fields.
- [ ] Step 3: Add `rewardedTarget` and `onRewardedGrant` to store state and helper signatures.
- [ ] Step 4: Re-run the same test and verify it passes.

## Task 2: Rewarded Adapter Result

**Files:**
- Modify: `apps/mobile/src/features/rewarded-ads/adapter/yandexRewardedAds.ts`
- Create: `apps/mobile/src/features/rewarded-ads/adapter/yandexRewardedAds.test.ts`

- [ ] Step 1: Add a test that mocks `yandex-mobile-ads`, fires `onRewarded`, and expects `showYandexRewardedAd` to resolve with the `grant` result.
- [ ] Step 2: Run `pnpm --filter @gafus/mobile test -- src/features/rewarded-ads/adapter/yandexRewardedAds.test.ts` and verify it fails because the function returns nothing.
- [ ] Step 3: Update the adapter to await `grant` through a promise resolved by `onRewarded`, reject on show failure, and return the grant data.
- [ ] Step 4: Re-run the adapter test and verify it passes.

## Task 3: Paywall Rewarded Flow

**Files:**
- Modify: `apps/mobile/src/features/app-subscription/components/AppSubscriptionPaywall.tsx`

- [ ] Step 1: Add rewarded status query, CTA copy, unavailable messages, and handler using `rewardedAdsApi.createSession` plus `showYandexRewardedAd`.
- [ ] Step 2: Invalidate `["rewarded-ads"]` and `["app-subscription"]`, then call the store callback after successful grant.
- [ ] Step 3: Keep subscription purchase flow unchanged and ensure rewarded failures only show a local message.

## Task 4: Articles

**Files:**
- Modify: `apps/mobile/src/shared/lib/api/articles.ts`
- Modify: `apps/mobile/app/(main)/articles/[slug].tsx`

- [ ] Step 1: Add `articlesApi.unlock(slug)` calling `POST /api/v1/articles/:slug/unlock`.
- [ ] Step 2: Replace the paid article block for authenticated users with the shared paywall target `ARTICLE:{article.id}`.
- [ ] Step 3: After rewarded grant, call `articlesApi.unlock(slug)` and refetch the article detail query.

## Task 5: Regular Course Steps

**Files:**
- Modify: `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx`

- [ ] Step 1: Add `handleUnlockStepWithRewarded(index)` that calls `trainingApi.unlockStep`, refetches day data, and opens the requested step.
- [ ] Step 2: Change `handleToggleStep` so locked monetized steps open the paywall with target `step.monetizationTarget`.
- [ ] Step 3: Keep unlocked and free/service steps on the existing toggle path.

## Task 6: Daily Course Steps

**Files:**
- Modify: `apps/mobile/app/(main)/daily-course/[scheduleId].tsx`

- [ ] Step 1: Add `handleUnlockDailyStepWithRewarded(index)` that calls `dailyCourseApi.unlockStep`, refetches day data, and opens the requested step.
- [ ] Step 2: Change `handleToggle` so locked monetized daily steps open the paywall with target `step.monetizationTarget`.
- [ ] Step 3: Keep unlocked and free/service steps on the existing toggle path.

## Task 7: Consultations

**Files:**
- Modify: `apps/mobile/src/features/consultations/components/ConsultationSlotsCalendar.tsx`
- Modify: `apps/mobile/app/(main)/consultations/booking-confirm.tsx`

- [ ] Step 1: On slot list or verify `SUBSCRIPTION_OR_CREDITS_REQUIRED`, open the shared paywall and refetch/retry the explicit action after grant.
- [ ] Step 2: On booking `SUBSCRIPTION_OR_CREDITS_REQUIRED`, open the shared paywall and retry submit with the same `idemKey`.
- [ ] Step 3: Leave slot-taken and validation behavior unchanged.

## Task 8: Verification

**Files:**
- Verify all modified mobile files.

- [ ] Step 1: Run focused tests:
  - `pnpm --filter @gafus/mobile test -- src/features/app-subscription/paywall-deferral.test.ts`
  - `pnpm --filter @gafus/mobile test -- src/features/rewarded-ads/adapter/yandexRewardedAds.test.ts`
- [ ] Step 2: Run `pnpm --filter @gafus/mobile typecheck`.
- [ ] Step 3: Run `pnpm --filter @gafus/mobile test`.
- [ ] Step 4: Review `git diff -- apps/mobile docs/superpowers/plans/2026-06-01-mobile-rewarded-paywall-parity.md`.
