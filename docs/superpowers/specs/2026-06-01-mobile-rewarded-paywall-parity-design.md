# Mobile Rewarded Paywall Parity Design

## Context

Web already has the intended rewarded credits paywall behavior:

- `AppSubscriptionPaywall` loads rewarded status.
- The paywall offers subscription payment and, when enabled, rewarded ads.
- A completed rewarded ad grants credits.
- The caller can pass `onRewardedGrant` to unlock the current target and refresh the page.

Mobile already has several required pieces:

- `apps/mobile/src/features/rewarded-ads/api/rewardedAdsApi.ts`
- `apps/mobile/src/features/rewarded-ads/adapter/yandexRewardedAds.ts`
- `apps/mobile/src/features/app-subscription/store/paywallStore.ts`
- `apps/mobile/src/shared/lib/api/client.ts` handling `SUBSCRIPTION_OR_CREDITS_REQUIRED`
- mobile API methods for training step unlock and daily-course step unlock

The missing part is a target-aware mobile paywall flow that matches web behavior at the same product gates.

## Scope

Mobile should trigger the paywall in the same rewarded-eligible places as web:

- paid article content;
- locked regular course steps;
- locked daily-course steps;
- consultation slot viewing/verification/booking flows;
- child endpoints protected by `SUBSCRIPTION_OR_CREDITS_REQUIRED`.

Existing course/article one-off payment screens are not part of this change unless they overlap with the rewarded paywall flow. Premium-only surfaces remain Premium-only.

## Recommended Approach

Use a target-aware mobile paywall.

Extend the mobile paywall store so callers can open the paywall with:

- paywall reason;
- optional rewarded target `{ targetType, targetId }`;
- optional `onRewardedGrant` callback.

The mobile `AppSubscriptionPaywall` owns the rewarded ad lifecycle:

1. Load `rewardedAdsApi.getStatus(target)`.
2. Show a rewarded CTA when `settings.platformEnabled && settings.paywallCtaEnabled`.
3. If available, create a session through `rewardedAdsApi.createSession(target)`.
4. Show the Yandex rewarded ad through the mobile adapter.
5. Record events and grant credits.
6. Invalidate rewarded/subscription queries.
7. Call `onRewardedGrant`.

This mirrors the web `AppSubscriptionPaywall` contract and keeps ad/session/grant logic out of individual screens.

## Component Changes

### Paywall Store

Add a small target context to `paywallStore`:

- `rewardedTarget?: { targetType, targetId }`
- `onRewardedGrant?: () => Promise<void> | void`

The store should clear these values when closing or opening a new paywall request.

### Rewarded Adapter

Change `showYandexRewardedAd(session)` to return the grant result after the rewarded callback completes. Avoid fire-and-forget `grant`; the paywall UI needs to know whether credits were actually granted.

The adapter should still record:

- `LOADED`
- `SHOWN`
- `DISMISSED`
- `FAILED`
- `REWARDED`

### AppSubscriptionPaywall

Add mobile rewarded UI below the subscription CTA:

- balance and max balance;
- next grant amount;
- daily limit state;
- unavailable messages for `DAILY_LIMIT_REACHED` and `BALANCE_FULL`;
- loading and error states.

After successful grant:

- show a short success message;
- reload rewarded status;
- call `onRewardedGrant`;
- close the paywall only when the callback completes successfully or the caller explicitly closes it.

## Entry Points

### Articles

When `article.content === null` for an authenticated user, render/open the shared mobile paywall with target:

- `targetType: "ARTICLE"`
- `targetId: article.id`

After rewarded grant:

- call `articlesApi.unlock(slug)`;
- refetch the article detail query.

Guests should still be sent to login.

### Regular Course Steps

When a step is `locked` and has `monetizationTarget`, tapping the accordion header should open the paywall instead of rendering redacted content.

After rewarded grant:

- call `trainingApi.unlockStep({ courseType, dayOnCourseId, stepIndex })`;
- refetch the day;
- open the requested step.

Free/service steps should keep the current behavior.

### Daily Course Steps

Use the same pattern as regular course steps, but target:

- `targetType: "DAILY_COURSE_STEP"`
- `targetId` from the step monetization target.

After rewarded grant:

- call `dailyCourseApi.unlockStep({ scheduleId, stepIndex })`;
- refetch the daily-course day;
- open the requested step.

### Consultations

For slots and booking flows, keep server checks authoritative.

When slots/verify/book returns `SUBSCRIPTION_OR_CREDITS_REQUIRED`, open the paywall. After rewarded grant:

- slot list: refetch slots;
- slot verification: retry the explicit verification action;
- booking: retry only the current explicit booking submit with the same idempotency key.

Do not auto-retry arbitrary API requests from the global API client.

## Error Handling

Rewarded ads are optional. If status/session/ad/grant fails, the subscription purchase flow must remain usable.

Expected user-facing cases:

- daily limit reached;
- balance full;
- ad platform disabled;
- no placement/session available;
- ad dismissed before reward;
- grant failed.

API `402 SUBSCRIPTION_OR_CREDITS_REQUIRED` should continue to open the paywall through the existing notification path, but screens that know the target should pass target context explicitly.

## Testing

Use TDD for implementation.

Focused tests:

- `paywallStore` stores and clears rewarded target/callback context.
- rewarded adapter resolves only after `grant` completes.
- `AppSubscriptionPaywall` calls status/session/adapter and then `onRewardedGrant`.
- article detail calls `articlesApi.unlock` and refetches after grant.
- regular training locked step calls `trainingApi.unlockStep` and refetches after grant.
- daily-course locked step calls `dailyCourseApi.unlockStep` and refetches after grant.
- consultation booking keeps the same idempotency key when retrying after grant.

Regression checks:

- `pnpm --filter @gafus/mobile test`
- `pnpm --filter @gafus/mobile typecheck`

## Non-Goals

- No change to rewarded credit business rules in `@gafus/core`.
- No change to web rewarded behavior.
- No automatic retry of arbitrary POST requests in `apiClient`.
- No conversion of Premium-only app-wide features to rewarded credits.
- No native SDK upgrade unless existing `yandex-mobile-ads` integration fails verification.
