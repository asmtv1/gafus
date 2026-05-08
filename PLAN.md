# Интеграция Подписки Gafus

## Summary
Вводим глобальную подписку на приложение: YooKassa для web/Android вне Google Play, App Store IAP для iOS, ручные admin-grants для поддержки. Источник истины по доступу живёт в `@gafus/core` и БД; web/mobile только показывают paywall и вызывают тонкие API. Серверные действия, меняющие/выдающие доступ, идемпотентны и покрыты security-проверками.

Документы, на которые опираемся: YooKassa `save_payment_method` и `payment_method_id` для автоплатежей, Apple App Store Server API/Notifications V2, expo-iap purchase flow с backend verification before finish.

## Key Interfaces And Data Model
- Prisma:
  - Create `AppSubscriptionSettings`: singleton `key="default"`, `yookassaWeeklyPriceRub`, `intervalDays=7`, `currency="RUB"`, `appleProductId`, timestamps, `updatedById`.
  - Create `AppSubscription`: `userId`, `provider: YOOKASSA|APPLE|MANUAL`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `isLifetime`, `cancelAtPeriodEnd`, `yookassaPaymentMethodId`, `appleOriginalTransactionId`, `appleProductId`, admin actor fields.
  - Create `AppSubscriptionPayment`: initial/renewal attempts, amount, period, `yookassaPaymentId`, `appleTransactionId`, unique `idempotenceKey`, status, failure reason.
  - Create `AppSubscriptionEvent`: provider/admin audit log, unique provider event key, actor, payload hash, processed timestamp.
- Core exports under `@gafus/core/services/appSubscription`:
  - `getAppSubscriptionAccess(userId)`
  - `requireActiveAppSubscription(userId)`
  - `getAppSubscriptionOffer()`
  - `createYookassaAppSubscriptionPayment()`
  - `handleYookassaAppSubscriptionWebhook()`
  - `verifyAppleAppSubscriptionPurchase()`
  - `handleAppleServerNotification()`
  - `processDueYookassaRenewals()`
  - `setManualAppSubscriptionGrant()`
- API response for blocked protected actions:
  - HTTP `402`
  - `{ success: false, code: "SUBSCRIPTION_REQUIRED", error: "Нужна активная подписка" }`

## Implementation Steps
1. **Baseline, threat model, and branch hygiene**
   - Skills/practices: `superpowers:using-git-worktrees`, `codex-security:threat-model`, `monorepo-management`, no destructive git operations.
   - Confirm dirty worktree and avoid reverting current unrelated pet/onboarding edits.
   - Document payment trust boundaries: YooKassa webhooks, Apple signed JWS, admin manual grants, client paywall bypass attempts.
   - Verification: `git status --short`, then no code changes yet.

2. **Prisma subscription schema**
   - Skills/practices: `prisma-cli`, `prisma-client-api`, `superpowers:test-driven-development`.
   - Modify `packages/prisma/schema.prisma`.
   - Create migration `packages/prisma/migrations/<timestamp>_add_app_subscriptions/`.
   - Add relations from `User` to subscriptions, payments, events.
   - Default settings row: YooKassa price `200.00`, interval `7`, currency `RUB`.
   - Tests/checks after step: `pnpm --filter @gafus/prisma prisma:generate`, `pnpm --filter @gafus/prisma build`.

3. **Core access and settings service**
   - Skills/practices: `superpowers:test-driven-development`, `prisma-client-api`, `codex-security:finding-discovery`.
   - Create `packages/core/src/services/appSubscription/`.
   - Add tests first for active/expired/lifetime/manual/YooKassa/Apple access resolution.
   - Implement access rules:
     - Active if any non-expired provider subscription exists.
     - Manual `isLifetime=true` always wins.
     - Existing users without entitlement are blocked immediately.
     - Profile and base pet CRUD are exempt; documents/prevention are not.
   - Modify `packages/core/package.json` exports and `packages/core/src/services/index.ts`.
   - Tests after step: focused core tests, then `pnpm --filter @gafus/core typecheck`.

4. **YooKassa initial payment and renewals**
   - Skills/practices: YooKassa docs, `superpowers:test-driven-development`, `codex-security:validation`, `prisma-client-api`.
   - Implement `save_payment_method: true` for initial payment.
   - Store only `payment_method.id`; never store card data.
   - Webhook confirms amount/currency, saved method, and status before granting access.
   - Renewal worker creates payments with `payment_method_id` and deterministic `Idempotence-Key`.
   - Failed renewal sets `PAST_DUE`; no access beyond paid period.
   - Modify existing YooKassa webhook dispatcher in `apps/web/src/app/api/v1/payments/webhook/route.ts` so old course/article payments and new app-subscription payments coexist.
   - Tests after step: core payment tests, webhook replay tests, amount mismatch tests.

5. **Apple IAP subscription verification**
   - Skills/practices: Apple App Store Server API docs, `vercel-react-native-skills`, `native-data-fetching`, `superpowers:test-driven-development`.
   - Reuse `@apple/app-store-server-library`.
   - Verify StoreKit JWS on backend before finishing transaction.
   - Require product type auto-renewable subscription and product id matching settings/env.
   - Store `originalTransactionId` as unique subscription identity.
   - Add App Store Server Notifications V2 route in web API and verify `signedPayload`.
   - Use notification UUID/provider event key to reject replays idempotently.
   - Tests after step: Apple verify success/conflict/replay/expired notification tests.

6. **Core server gates**
   - Skills/practices: `hono`, `next-best-practices`, `codex-security:attack-path-analysis`.
   - Modify `apps/api/src/app.ts` and add subscription middleware.
   - Free API surface: `/user/*`, `/pets` base CRUD, public mobile config, auth, payments/subscription status.
   - Gated API surface: training, daily course, consultations, reminders, notes, offline, achievements, article detail/like/view, course actions/favorites/reviews/personalization, pet documents, pet prevention.
   - Web direct pages under `(main)` get server-side guard except profile and pets base pages.
   - Tests after step: API route tests for `402`, free profile/pets still `200`, unauth still `401`.

7. **Admin settings and manual grants**
   - Skills/practices: `next-best-practices`, `vercel-react-best-practices`, `prisma-client-api`, `codex-security:validation`.
   - Only role `ADMIN` can change money settings or manual entitlements; `MODERATOR` can view only.
   - Modify admin files:
     - `apps/admin-panel/src/features/admin/components/MobileAppFeaturesCard.tsx`
     - `apps/admin-panel/src/shared/lib/actions/mobileAppFeatureFlagsActions.ts`
     - `apps/admin-panel/src/features/users/*`
     - `apps/admin-panel/src/app/(main)/main-panel/users/*`
   - Add controls:
     - YooKassa weekly price.
     - iOS “оплатить картой РФ” feature flag, default hidden.
     - Per-user subscription until date, lifetime, or clear manual grant.
   - Every manual change writes `AppSubscriptionEvent` with actor id.
   - Tests after step: admin typecheck/build and core admin grant tests.

8. **Web paywall**
   - Skills/practices: `next-best-practices`, `vercel-react-best-practices`, `native-data-fetching`-style fetch error handling for client calls.
   - Create web subscription UI under `apps/web/src/features/subscription/`.
   - Add `/subscription` page and reusable paywall modal/drawer.
   - Profile and pets base pages remain usable.
   - Course/article/consultation/training actions open paywall if no active subscription.
   - Direct protected URLs redirect/render paywall instead of leaking content.
   - Tests after step: `pnpm --filter @gafus/web typecheck`, targeted build if needed.

9. **Mobile paywall and IAP/YooKassa client flow**
   - Skills/practices: `vercel-react-native-skills`, `native-data-fetching`, expo-iap docs, `superpowers:test-driven-development`.
   - Create `apps/mobile/src/features/app-subscription/`.
   - Add subscription status query, paywall store/provider, and modal.
   - On onboarding completion, show subscription offer.
   - If dismissed, only start screens remain; protected actions call `requireSubscription()` and open paywall.
   - iOS:
     - Default primary StoreKit subscription.
     - Optional “Оплатить картой РФ” button only when admin flag is enabled.
   - Android:
     - YooKassa card flow, because Android distribution is outside Google Play.
   - Modify `apps/mobile/src/shared/lib/api/client.ts` to surface `SUBSCRIPTION_REQUIRED`.
   - Tests after step: mobile subscription tests, `pnpm --filter @gafus/mobile typecheck`.

10. **Worker renewal scheduler**
   - Skills/practices: `monorepo-management`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`.
   - Modify `packages/worker/src/cron-scheduler.ts`.
   - Add hourly YooKassa renewal job.
   - Renewal idempotency uses unique `AppSubscriptionPayment.idempotenceKey`.
   - Retries never double-charge because YooKassa `Idempotence-Key` equals DB idempotence key.
   - Tests after step: worker unit tests for duplicate cron run and failed renewal.

11. **Security review and final verification**
   - Skills/practices: `codex-security:security-scan`, `codex-security:finding-discovery`, `codex-security:validation`, `superpowers:verification-before-completion`.
   - Verify:
     - No client-only entitlement decisions.
     - No card data, Apple private key, YooKassa secret, or raw sensitive token logs.
     - Webhooks reject forged/replayed events.
     - Amount/currency/product mismatches do not grant access.
     - Manual lifetime grants are auditable and ADMIN-only.
   - Final commands:
     - `pnpm --filter @gafus/core test`
     - `pnpm --filter @gafus/api test`
     - `pnpm --filter @gafus/worker test`
     - `pnpm --filter @gafus/mobile test`
     - `pnpm --filter @gafus/core typecheck`
     - `pnpm --filter @gafus/api typecheck`
     - `pnpm --filter @gafus/web typecheck`
     - `pnpm --filter @gafus/mobile typecheck`
     - `pnpm --filter @gafus/admin-panel typecheck`

## Files
Create:
- `packages/core/src/services/appSubscription/*`
- `apps/api/src/routes/v1/app-subscriptions.ts`
- `apps/web/src/features/subscription/*`
- `apps/web/src/app/(main)/subscription/page.tsx`
- `apps/web/src/app/api/v1/app-subscriptions/*`
- `apps/mobile/src/features/app-subscription/*`

Modify:
- `packages/prisma/schema.prisma`
- `packages/core/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/middleware/rate-limit.ts`
- `apps/web/src/app/api/v1/payments/webhook/route.ts`
- `apps/web/src/app/(main)/layout.tsx`
- `apps/mobile/app/(main)/_layout.tsx`
- `apps/mobile/src/shared/lib/api/client.ts`
- admin user/settings files listed above
- `packages/worker/src/cron-scheduler.ts`

Delete:
- None in v1. Existing one-time course/article payment code stays intact to avoid breaking current paid access and historical payment handling.
