# Учёт 34 установочных импортов API — 18.11.2026

Точное состояние `apps/api/src/app.ts` на момент начала этапа 5. Здесь **не подтверждено** удаление глобальных реестров: отмечены места, где нужны фабрики и явные параметры. Потребителей каждого Core-порта ещё необходимо перепроверить (включая Worker и тесты).

| № | Точка установки | Владелец | Регистрации Core | Серверная реализация | Core-контракт |
|---:|---|---|---|---|---|
| 1 | `modules/app-feature-flags/composition/install-core-flags.ts` | `app-feature-flags` | `registerAppFeatureFlagsPort` | `@gafus/feature-flags-server/appFeatureFlagsService` | `@gafus/core/services/appFeatureFlags` |
| 2 | `modules/app-subscription/composition/install-core-subscription-access.ts` | `app-subscription` | `registerSubscriptionAccessPort` | `@gafus/subscription-read-server` | `@gafus/core/services/appSubscription` |
| 3 | `modules/rewarded-credits/composition/install-core-settings.ts` | `rewarded-credits` | `registerRewardedSettingsPort` | `@gafus/gafus-server/rewarded-settings` | `@gafus/core/services/rewardedCredits` |
| 4 | `modules/trainer-courses/composition/install-core-version-rows.ts` | `trainer-courses` | `registerCourseVersionRowsPort` | `@gafus/course-progress-server/course-version-rows` | `@gafus/core/services/trainerCourse` |
| 5 | `modules/auth/composition/install-registration-context.ts` | `auth` | `registerRegistrationContextPort` | `@gafus/identity-write-server/registration-context-reads` | `@gafus/core/services/auth` |
| 6 | `modules/auth/composition/install-password-reset.ts` | `auth` | `registerPasswordResetPort` | `@gafus/identity-write-server/password-reset` | `@gafus/core/services/auth` |
| 7 | `modules/auth/composition/install-email-account-rows.ts` | `auth` | `registerEmailAccountRowsPort` | `@gafus/identity-write-server/email-account-rows` | `@gafus/core/services/auth` |
| 8 | `modules/auth/composition/install-vk-completion.ts` | `auth` | `registerVkCompletionPort` | `@gafus/identity-write-server/vk-completion-rows` | `@gafus/core/services/auth` |
| 9 | `modules/auth/composition/install-credential-registration.ts` | `auth` | `registerCredentialRegistrationPort` | `@gafus/identity-write-server/registration-contract-rows` | `@gafus/core/services/auth` |
| 10 | `modules/auth/composition/install-registration-contract-rows.ts` | `auth` | `registerRegistrationContractRowsPort` | `@gafus/identity-write-server/registration-contract-rows` | `@gafus/core/services/auth` |
| 11 | `modules/content-access/composition/install-policy-reads.ts` | `content-access` | `registerContentPolicyReadPort` | `@gafus/entitlements-server/policy-reads` | `@gafus/core/services/contentAccess` |
| 12 | `modules/content-access/composition/install-occurrence-reads.ts` | `content-access` | `registerCourseOccurrenceReadsPort` | `@gafus/entitlements-server` | `@gafus/core/services/contentAccess` |
| 13 | `modules/gafus/composition/install-wallet-lock.ts` | `gafus` | `registerGafusLockPort` | `@gafus/gafus-server/wallet-lock` | `@gafus/core/services/gafus` |
| 14 | `modules/training/composition/install-content-revision-read.ts` | `training` | `registerCourseContentRevisionReadPort` | `@gafus/course-read-server/content-revision` | `@gafus/core/services/training` |
| 15 | `modules/courses/composition/install-catalog-read.ts` | `courses` | `registerCatalogReadPort` | `@gafus/course-read-server/legacy-catalog-rows` | `@gafus/core/services/course` |
| 16 | `modules/training/composition/install-day-content-read.ts` | `training` | `registerTrainingDayContentReadPort` | `@gafus/course-read-server` | `@gafus/core/services/training` |
| 17 | `modules/app-subscription/composition/install-promo-code-rows.ts` | `app-subscription` | `registerSubscriptionPromoPort` | `@gafus/subscription-finance-server/promo-code-rows` | `@gafus/core/services/appSubscription` |
| 18 | `modules/gafus/composition/install-ledger-rows.ts` | `gafus` | `registerGafusLedgerRowsPort` | `@gafus/gafus-server/wallet-records` | `@gafus/core/services/gafus` |
| 19 | `modules/gafus/composition/install-unlock-rows.ts` | `gafus` | `registerGafusUnlockRowsPort` | `@gafus/gafus-server/unlock-records` | `@gafus/core/services/gafus` |
| 20 | `modules/trainer-days/composition/install-training-day-rows.ts` | `trainer-days` | `registerTrainingDayRowsPort` | `@gafus/course-progress-server/training-day-rows` | `@gafus/core/services/trainingDay` |
| 21 | `modules/rewarded-credits/composition/install-access-reads.ts` | `rewarded-credits` | `registerRewardedAccessReadPort` | `@gafus/entitlements-server/rewarded-access-reads` | `@gafus/core/services/rewardedCredits` |
| 22 | `modules/rewarded-credits/composition/install-wallet-rows.ts` | `rewarded-credits` | `registerRewardedWalletPort` | `@gafus/gafus-server/rewarded-wallet-rows` | `@gafus/core/services/rewardedCredits` |
| 23 | `modules/user/composition/install-profile-rows.ts` | `user` | `registerProfileRowsPort` | `@gafus/identity-write-server/profile-rows` | `@gafus/core/services/user` |
| 24 | `modules/gafus/composition/install-admin-rows.ts` | `gafus` | `registerGafusAdminRowsPort` | `@gafus/gafus-server/admin-rows` | `@gafus/core/services/adminGafus` |
| 25 | `modules/trainer-courses/composition/install-trainer-course-rows.ts` | `trainer-courses` | `registerTrainerCourseRowsPort` | `@gafus/course-progress-server/trainer-course-rows` | `@gafus/core/services/trainerCourse` |
| 26 | `modules/training/composition/install-training-service.ts` | `training` | `registerTrainingServicePort` | `@gafus/course-progress-server/training-service` | `@gafus/core/services/training` |
| 27 | `modules/auth/composition/install-core-auth-rows.ts` | `auth` | `registerAuthRowsPort` | `@gafus/identity-write-server/auth-rows` | `@gafus/core/services/auth` |
| 28 | `modules/auth/composition/install-core-vk-auth-rows.ts` | `auth` | `registerVkAuthRowsPort` | `@gafus/identity-write-server/vk-auth-rows` | `@gafus/core/services/auth` |
| 29 | `modules/offline/composition/install-offline-mutation-rows.ts` | `offline` | `registerOfflineMutationRowsPort` | `@gafus/course-progress-server/offline-mutation-rows` | `@gafus/core/services/offline` |
| 30 | `modules/pet-prevention/composition/install-prevention-rows.ts` | `pet-prevention` | `registerPreventionRowsPort` | `@gafus/pets-server/prevention-rows` | `@gafus/core/services/petPrevention` |
| 31 | `modules/pets/composition/install-pet-rows.ts` | `pets` | `registerPetRowsPort` | `@gafus/pets-server/pet-rows` | `@gafus/core/services/pets` |
| 32 | `modules/pets/composition/install-vet-visit-rows.ts` | `pets` | `registerVetVisitRowsPort` | `@gafus/pets-server/vet-visit-write-rows` | `@gafus/core/services/pets` |
| 33 | `modules/rewarded-credits/composition/install-ad-session-rows.ts` | `rewarded-credits` | `registerRewardedAdRowsPort` | `@gafus/gafus-server/rewarded-ad-rows` | `@gafus/core/services/rewardedCredits` |
| 34 | `modules/trainer-steps/composition/install-trainer-step-rows.ts` | `trainer-steps` | `registerTrainerStepRowsPort` | `@gafus/course-progress-server/trainer-step-rows` | `@gafus/core/services/trainerStep` |

## Порядок демонтажа

1. Тренировки: сначала передать транзакционный `TrainingServiceApi` в HTTP-маршруты и офлайн-журнал. Зарегистрированный Core-порт остаётся до перевода всех потребителей.
2. Затем группы: курсы/контент, профиль/питомцы, авторизация, кошелёк/подписки. Каждый раз искать вызовы `require...Port` и тестовые зависимости.
3. После перевода потребителей удалить соответствующий импорт `install-*` и global `register...`; не заменять его другим процессным реестром.
4. Проверить две независимые инстанции сервиса в одном тесте, холодный импорт собранного API, запуск воркера и отсутствие зависимости от порядка импортов.

## Прямые потребители исходных Core-контрактов

Автоматический перечень строится по импортам исходного Core-контракта в отслеживаемых файлах API, Core, Worker и course-server (без тестов). Это **кандидаты на перенос**, а не полное доказательство всех динамических/отложенных импортов. Полный список хранится в `api-composition-baseline-20261118.json`; после каждой миграции соответствующий потребитель должен исчезнуть из использования глобального регистратора.

| Контракт | Файлы прямых потребителей | Примеры |
|---|---:|---|
| `@gafus/core/services/appFeatureFlags` | 0 | — |
| `@gafus/core/services/appSubscription` | 12 | `apps/api/src/modules/app-subscription/composition/install-promo-code-rows.ts`, `apps/api/src/modules/app-subscription/composition/payment-transitions.ts`, `apps/api/src/modules/app-subscription/composition/read-offer.ts` (+9) |
| `@gafus/core/services/appSubscription` | 12 | `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts`, `apps/api/src/modules/app-subscription/composition/payment-transitions.ts`, `apps/api/src/modules/app-subscription/composition/read-offer.ts` (+9) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-credential-registration.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-credential-registration.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/auth` | 11 | `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/auth/composition/install-core-auth-rows.ts`, `apps/api/src/modules/auth/composition/install-core-vk-auth-rows.ts` (+8) |
| `@gafus/core/services/contentAccess` | 5 | `apps/api/src/modules/content-access/composition/install-policy-reads.ts`, `apps/api/src/modules/courses/composition/read-courses.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts` (+2) |
| `@gafus/core/services/contentAccess` | 5 | `apps/api/src/modules/content-access/composition/install-occurrence-reads.ts`, `apps/api/src/modules/courses/composition/read-courses.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts` (+2) |
| `@gafus/core/services/course` | 9 | `apps/api/src/modules/chat2/service.ts`, `apps/api/src/modules/courses/application/read-access.ts`, `apps/api/src/modules/courses/application/read-courses.ts` (+6) |
| `@gafus/core/services/adminGafus` | 2 | `apps/api/src/routes/v1/admin-gafus-operations.ts`, `apps/api/src/routes/v1/gafus-admin.ts` |
| `@gafus/core/services/gafus` | 6 | `apps/api/src/modules/gafus/composition/install-unlock-rows.ts`, `apps/api/src/modules/gafus/composition/install-wallet-lock.ts`, `apps/api/src/modules/gafus/composition/legacy-import.ts` (+3) |
| `@gafus/core/services/gafus` | 6 | `apps/api/src/modules/gafus/composition/install-ledger-rows.ts`, `apps/api/src/modules/gafus/composition/install-wallet-lock.ts`, `apps/api/src/modules/gafus/composition/legacy-import.ts` (+3) |
| `@gafus/core/services/gafus` | 6 | `apps/api/src/modules/gafus/composition/install-ledger-rows.ts`, `apps/api/src/modules/gafus/composition/install-unlock-rows.ts`, `apps/api/src/modules/gafus/composition/legacy-import.ts` (+3) |
| `@gafus/core/services/offline` | 1 | `apps/api/src/modules/offline/composition/install-video-position-v3-review.ts` |
| `@gafus/core/services/petPrevention` | 5 | `apps/api/src/modules/pet-prevention/application/journal.ts`, `apps/api/src/modules/pet-prevention/composition/journal.ts`, `apps/api/src/routes/v1/offline.ts` (+2) |
| `@gafus/core/services/pets` | 3 | `apps/api/src/modules/pets/composition/install-vet-visit-rows.ts`, `apps/api/src/routes/v1/pet-vet-visits.ts`, `apps/api/src/routes/v1/pets.ts` |
| `@gafus/core/services/pets` | 3 | `apps/api/src/modules/pets/composition/install-pet-rows.ts`, `apps/api/src/routes/v1/pet-vet-visits.ts`, `apps/api/src/routes/v1/pets.ts` |
| `@gafus/core/services/rewardedCredits` | 10 | `apps/api/src/modules/articles/composition/article-rows.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts`, `apps/api/src/modules/rewarded-credits/composition/install-ad-session-rows.ts` (+7) |
| `@gafus/core/services/rewardedCredits` | 10 | `apps/api/src/modules/articles/composition/article-rows.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts`, `apps/api/src/modules/rewarded-credits/composition/install-access-reads.ts` (+7) |
| `@gafus/core/services/rewardedCredits` | 10 | `apps/api/src/modules/articles/composition/article-rows.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts`, `apps/api/src/modules/rewarded-credits/composition/install-access-reads.ts` (+7) |
| `@gafus/core/services/rewardedCredits` | 10 | `apps/api/src/modules/articles/composition/article-rows.ts`, `apps/api/src/modules/rewarded-credits/composition/gafus-access.ts`, `apps/api/src/modules/rewarded-credits/composition/install-access-reads.ts` (+7) |
| `@gafus/core/services/trainerCourse` | 7 | `apps/api/src/modules/trainer-courses/application/read-course-editor.ts`, `apps/api/src/modules/trainer-courses/composition/editor-snapshot-port.ts`, `apps/api/src/modules/trainer-courses/composition/install-trainer-course-rows.ts` (+4) |
| `@gafus/core/services/trainerCourse` | 7 | `apps/api/src/modules/trainer-courses/application/read-course-editor.ts`, `apps/api/src/modules/trainer-courses/composition/editor-snapshot-port.ts`, `apps/api/src/modules/trainer-courses/composition/install-core-version-rows.ts` (+4) |
| `@gafus/core/services/trainingDay` | 4 | `apps/api/src/modules/trainer-days/application/read-visible-days.ts`, `apps/api/src/modules/trainer-days/composition/read-visible-days.ts`, `apps/api/src/routes/v1/trainer-authoring.ts` (+1) |
| `@gafus/core/services/trainerStep` | 6 | `apps/api/src/modules/trainer-steps/application/read-visible-steps.ts`, `apps/api/src/modules/trainer-steps/composition/read-visible-steps.ts`, `apps/api/src/modules/trainer-templates/application/read-public-templates.ts` (+3) |
| `@gafus/core/services/training` | 13 | `apps/api/src/modules/training/application/read-training-day.ts`, `apps/api/src/modules/training/application/read-training-days.ts`, `apps/api/src/modules/training/application/write-step-progress.ts` (+10) |
| `@gafus/core/services/training` | 13 | `apps/api/src/modules/training/application/read-training-day.ts`, `apps/api/src/modules/training/application/read-training-days.ts`, `apps/api/src/modules/training/application/write-step-progress.ts` (+10) |
| `@gafus/core/services/training` | 13 | `apps/api/src/modules/training/application/read-training-day.ts`, `apps/api/src/modules/training/application/read-training-days.ts`, `apps/api/src/modules/training/application/write-step-progress.ts` (+10) |
| `@gafus/core/services/user` | 10 | `apps/api/src/modules/user/application/onboarding-tour.ts`, `apps/api/src/modules/user/application/read-profile.ts`, `apps/api/src/modules/user/application/read-public-profile.ts` (+7) |

**Открытая граница:** 34 регистратора ещё присутствуют; перечисление потребителей и защита от новых установочных импортов не заменяют передачу параметров через фабрики. Для завершения этого этапа нужно удалить все 34 из `app.ts` и подтвердить независимость тестовых экземпляров от порядка загрузки модулей.
