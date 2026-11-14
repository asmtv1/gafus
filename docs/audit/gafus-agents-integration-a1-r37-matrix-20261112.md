# GAFUS A1 r37 — покрытие SHA перед будущей интеграцией

**37 remaining / 4 resolved / 0 new от frozen 41 — промежуточно. Финальный A1 ещё не готов.**

- Манифесты: 3; записи 51, уникальных путей 49.
- Включено SHA: 46; lock regeneration with approval: 1; Audit-excluded: 2 + 6 companion docs.
- Новых относительно прежнего pinned inventory: 19; без классификации: 0.
- Прямой P0 A2: ['pnpm-lock.yaml']. Финальный A3 (39): [].

| Файл | Источник | Решение | Пересечения | SHA-256/удаление |
|---|---|---|---|---|
| `apps/api/src/app.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `0cccaf1fdfb5bf4b` |
| `apps/api/src/modules/app-feature-flags/composition/install-core-flags.contract.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `b03fed2c2f057a3c` |
| `apps/api/src/modules/app-feature-flags/composition/install-core-flags.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `a8c69b5fb84e2817` |
| `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.contract.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `a8881b27212c138d` |
| `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `bae598ee1b95691c` |
| `apps/api/src/modules/app-subscription/composition/payment-transitions.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `756db331dac5c8c1` |
| `apps/api/src/modules/reminders/composition/create-receipt-review.ts` | `reminder` | `SHA_REQUIRED` | A2-worktree | `94da00991d2c2e22` |
| `apps/api/src/routes/v1/admin-users.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `0db0794e379dd397` |
| `apps/api/src/routes/v1/admin-users.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `096d6820490e5d11` |
| `apps/api/src/routes/v1/app-subscription.route.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `8217a2e9b078bbd2` |
| `apps/api/src/routes/v1/app-subscription.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `17c67d024170c2ad` |
| `apps/api/src/routes/v1/g1-reminder-create-lookup.review.test.ts` | `reminder` | `SHA_REQUIRED` | A2-worktree | `4dc6b659b3cd90d5` |
| `apps/api/src/routes/v1/g1-reminder-create-lookup.review.ts` | `reminder` | `SHA_REQUIRED` | A2-worktree | `55b197d4d3a7b999` |
| `apps/api/src/routes/v1/g1-subscription-readonly.contract.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `2e81891d858e01cb` |
| `apps/api/src/routes/v1/payment-provider-webhooks.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `d8985254073965e6` |
| `apps/api/src/routes/v1/payment-provider-webhooks.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `2181fa0c1bf69567` |
| `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `flags_access` | `EXCLUDE_AUDIT_ONLY` | A2-worktree | `6a03dd8ae9ccb6b0` |
| `docs/audit/core-server-bulk-progress-20261111.md` | `flags_access` | `EXCLUDE_AUDIT_ONLY` | A2-worktree | `74ef2ce1ec72353e` |
| `packages/core/package.json` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `145379e3172ebc1d` |
| `packages/core/src/services/appFeatureFlags/appFeatureFlagsPort.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `29cb2a4819ba1117` |
| `packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `9c7fbd2350208918` |
| `packages/core/src/services/appFeatureFlags/index.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `c123bc8224a8b185` |
| `packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `9b72a710990682e7` |
| `packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `98c74ff0cb8f049b` |
| `packages/core/src/services/appSubscription/__tests__/accessService.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `88f8235029ea33c1` |
| `packages/core/src/services/appSubscription/__tests__/cynologistEntitlements.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `350bfab01b6a5f6a` |
| `packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `3faf9850fb89adf7` |
| `packages/core/src/services/appSubscription/__tests__/paymentService.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `ad813c73d46b0ee9` |
| `packages/core/src/services/appSubscription/accessPort.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `ce887f931f5c7feb` |
| `packages/core/src/services/appSubscription/accessService.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `0a9bbf842ac94e91` |
| `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `ABSENT` |
| `packages/core/src/services/appSubscription/g1-achievements-snapshot-access-source.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `4b6fbd0baa3ece8d` |
| `packages/core/src/services/appSubscription/index.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `356953d2cf4ed339` |
| `packages/core/src/services/appSubscription/paymentService.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `19ca950044f69f46` |
| `packages/core/src/services/consultation/bookingService.test.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `8cb7f7fd2df8fd50` |
| `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.test.ts` | `reminder` | `SHA_REQUIRED` | A2-worktree | `f175ddfef0163fa9` |
| `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.ts` | `reminder` | `SHA_REQUIRED` | A2-worktree | `073fff926ff6754e` |
| `packages/feature-flags-server/package.json` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `a750b637068c625d` |
| `packages/feature-flags-server/src/appFeatureFlagsService.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `e2e428e7da75b097` |
| `packages/subscription-payment-server/src/appleJws.archqa.acceptance.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `ded3f87dd10a7493` |
| `packages/subscription-payment-server/src/appleJws.archqa.acceptance.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `4103ce29a6656c64` |
| `packages/types/src/contracts/mobileReleaseErrors.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `33902af423bd13d1` |
| `packages/types/src/index.ts` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `a78c60d0e3634d2d` |
| `packages/worker/src/composition/app-subscription-payment.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `0283325a2e079dbb` |
| `packages/worker/src/cron-scheduler.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `ac3ef75d316c8448` |
| `packages/worker/src/cron-scheduler.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `44e38f79fd9382cc` |
| `packages/worker/src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts` | `payment` | `SHA_REQUIRED` | A2-worktree | `9659a9ee16f87094` |
| `pnpm-lock.yaml` | `flags_access` | `REGENERATE_APPROVED_LOCK` | P0-A2 A2-worktree | `f131a5960bfffbb2` |
| `scripts/check-core-server-boundary.mjs` | `flags_access` | `SHA_REQUIRED` | A2-worktree | `c4a4f84c9f14d5d2` |
| `docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.md` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `7eac6efdfa51cc11` |
| `docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.json` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `87d0fbedf7ab2692` |
| `docs/audit/gafus-agent-1-to-agent-2-reminder-review-ports-20261112.md` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `952bc9f068920529` |
| `docs/audit/gafus-agent-1-to-agent-2-reminder-review-ports-20261112.json` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `44405745affa7196` |
| `docs/audit/gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.md` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `f5ab4ab0012ddc2d` |
| `docs/audit/gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.json` | `manifest_description` | `EXCLUDE_AUDIT_ONLY` | — | `f3f19b3543366102` |

Особая ручная группа: `apps/api/src/app.ts`, `packages/core/package.json`, `packages/types/src/index.ts`, `scripts/check-core-server-boundary.mjs`. Не брать устаревший A2/A3 файл целиком, сверять startup installer и shared error exports. P0 `pnpm-lock.yaml` — обязательная regeneration после согласованных manifests; старый A2 SHA запрещён.

Reminder-review 7-file манифест содержит два audit-документа, которые позднее переписаны feature-flags group. Их исторические SHA хранятся в `history`, а для текущего дерева используется последний SHA feature-flags; документы помечены OUT-OF-INTEGRATION.

Никакие файлы A1 или Git-история не менялись; этот отчёт создан в A2.

## P0 lockfile — проверенная отдельная репетиция, 12.11.2026

Для `pnpm-lock.yaml` подтверждён **не whole-file copy от A2**, а offline-lockfile regeneration по полному актуальному A1 workspace: 70 importers, пять A2 logger OpenTelemetry dependencies, семь A1 patch entries. Итоговая SHA-256 `f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e`; diff от A1 snapshot **0 строк**, old committed A2 SHA `8bd2ad9028d5361daefa25846e2ac402287270d7fa161c8396a77c170f30ef0c` отклоняется. Проверка 1292/1292, негативные тесты 7/7, Prisma validate c `metrics`, OTLP 12/12, workspace 69/0 и frozen lock-only PASS. **Статус: `PROVISIONAL_LOCK_DIGEST_NOT_FINAL_A1_INTEGRATION`**, не использовать как approval общей интеграции; Agent1 уже начал следующие группы, старый r37 coverage требует обновления. Полный receipt: `docs/audit/gafus-agents-integration-lockfile-r37-20261112.md`.
