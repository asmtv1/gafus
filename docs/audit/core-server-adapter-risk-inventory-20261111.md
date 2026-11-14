# Core → серверные адаптеры: инвентаризация и риск миграции

Автоматический анализ исходных AST; категории риска — инженерная приоритизация,
а не оценка безопасности. Исходная точка — 142 AST-импорта из замороженного baseline;
выполненные переносы сохраняются в исторической таблице.

- **L (низкий)**: только типы или простые реэкспорты НЕ финансовых/авторизационных контуров; проверить потребителей API.
- **M (средний)**: прямой вызов адаптера чтения/медиа/контента; перевести через use-case порт, сохранить ACL.
- **H (высокий)**: затронуты авторизация, согласия, платежи, подписки, прогресс, экзамены, idempotency/lease/CAS (даже если текущий импорт — простой реэкспорт).

| Пакет | Всего (история) | L | M | H | Уже устранено |
| --- | ---: | ---: | ---: | ---: | ---: |
| identity-write-server | 17 | 0 | 0 | 17 | 17 |
| course-progress-server | 17 | 8 | 0 | 9 | 17 |
| gafus-server | 12 | 5 | 0 | 7 | 12 |
| media-server | 10 | 10 | 0 | 0 | 10 |
| course-read-server | 9 | 3 | 0 | 6 | 9 |
| pets-server | 9 | 9 | 0 | 0 | 9 |
| subscription-finance-server | 8 | 0 | 0 | 8 | 8 |
| subscription-payment-server | 8 | 0 | 0 | 8 | 8 |
| notifications-server | 7 | 6 | 0 | 1 | 7 |
| achievements-server | 5 | 5 | 0 | 0 | 5 |
| consultation-query-server | 5 | 4 | 0 | 1 | 5 |
| entitlements-server | 4 | 2 | 0 | 2 | 4 |
| exam-server | 4 | 0 | 0 | 4 | 4 |
| admin-reengagement-server | 3 | 3 | 0 | 0 | 3 |
| admin-rewarded-ads-server | 3 | 0 | 0 | 3 | 3 |
| article-server | 3 | 3 | 0 | 0 | 3 |
| consent-server | 3 | 0 | 0 | 3 | 3 |
| mobile-intro-server | 3 | 3 | 0 | 0 | 3 |
| questions-write-server | 3 | 3 | 0 | 0 | 3 |
| subscription-read-server | 2 | 0 | 0 | 2 | 2 |
| trainer-ai-server | 2 | 2 | 0 | 0 | 2 |
| feature-flags-server | 1 | 1 | 0 | 0 | 1 |
| subscription-trial-server | 1 | 0 | 0 | 1 | 1 |
| consultation-write-server | 1 | 0 | 0 | 1 | 1 |
| tracking-server | 1 | 1 | 0 | 0 | 1 |
| course-server | 1 | 0 | 0 | 1 | 1 |

Всего: **142**, фактически осталось **0**; устранено **142**.

## identity-write-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/accountCleanup/enqueue.ts` | `@gafus/identity-write-server/account-cleanup-records` |
| H | retired | `services/accountCleanup/worker.ts` | `@gafus/identity-write-server/account-cleanup-worker-rows` |
| H | retired | `services/adminUser/adminUserService.ts` | `@gafus/identity-write-server/admin-user-reads` |
| H | retired | `services/adminUser/adminUserService.ts` | `@gafus/identity-write-server/admin-user-writes` |
| H | retired | `services/auth/authService.ts` | `@gafus/identity-write-server/auth-rows` |
| H | retired | `services/auth/emailAccountFlows.ts` | `@gafus/identity-write-server/email-account-rows` |
| H | retired | `services/auth/passwordReset.ts` | `@gafus/identity-write-server/password-reset` |
| H | retired | `services/auth/registerUserWithCredentials.ts` | `@gafus/identity-write-server/registration-contract-rows` |
| H | retired | `services/auth/registrationContracts.ts` | `@gafus/identity-write-server/registration-contract-rows` |
| H | retired | `services/auth/registrationUseCases.ts` | `@gafus/identity-write-server/registration-context-reads` |
| H | retired | `services/auth/vkAuth.ts` | `@gafus/identity-write-server/auth-rows` |
| H | retired | `services/auth/vkAuth.ts` | `@gafus/identity-write-server/vk-auth-rows` |
| H | retired | `services/auth/vkRegistrationCompletion.ts` | `@gafus/identity-write-server/vk-completion-rows` |
| H | retired | `services/reminders/g1ReminderCreateIdempotency.review.ts` | `@gafus/identity-write-server/reminder-review-rows` |
| H | retired | `services/reminders/g1ReminderMutationReceiptAG4.review.ts` | `@gafus/identity-write-server/reminder-review-rows` |
| H | retired | `services/user/deleteUserAccount.ts` | `@gafus/identity-write-server/account-deletion-rows` |
| H | retired | `services/user/profileService.ts` | `@gafus/identity-write-server/profile-rows` |

## course-progress-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/dailyCourse/dailyCourseService.ts` | `@gafus/course-progress-server/daily-course-service` |
| L | retired | `services/dailyCourse/dailyCourseService.ts` | `@gafus/course-progress-server/daily-course-service` |
| L | retired | `services/diary/diaryService.ts` | `@gafus/course-progress-server/diary-entries` |
| L | retired | `services/diary/diaryService.ts` | `@gafus/course-progress-server/diary-entries` |
| L | retired | `services/notes/notesService.ts` | `@gafus/course-progress-server/trainer-note-rows` |
| H | retired | `services/offline/offlineMutationJournal.ts` | `@gafus/course-progress-server/offline-mutation-rows` |
| H | retired | `services/offline/offlineVideoPositionV3Service.ts` | `@gafus/course-progress-server/offline-video-rows` |
| L | retired | `services/survey/surveyService.ts` | `@gafus/course-progress-server/survey-rows` |
| H | retired | `services/trainerCourse/courseVersionService.ts` | `@gafus/course-progress-server/course-version-rows` |
| H | retired | `services/trainerCourse/trainerCourseNameOnlyService.ts` | `@gafus/course-progress-server/course-version-rows` |
| H | retired | `services/trainerCourse/trainerCourseService.ts` | `@gafus/course-progress-server/trainer-course-rows` |
| H | retired | `services/trainerStep/trainerStepService.ts` | `@gafus/course-progress-server/trainer-step-rows` |
| H | retired | `services/training/trainingService.ts` | `@gafus/course-progress-server/training-service` |
| H | retired | `services/training/trainingService.ts` | `@gafus/course-progress-server/training-service` |
| H | retired | `services/trainingDay/trainingDayService.ts` | `@gafus/course-progress-server/training-day-rows` |
| L | retired | `services/user/userCourseService.ts` | `@gafus/course-progress-server/completion` |
| L | retired | `services/user/userProgressService.ts` | `@gafus/course-progress-server` |

## gafus-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/adminGafus/index.ts` | `@gafus/gafus-server/admin-rows` |
| L | retired | `services/gafus/accessGrantService.ts` | `@gafus/gafus-server/unlock-records` |
| L | retired | `services/gafus/legacyImportService.ts` | `@gafus/gafus-server/legacy-import-records` |
| H | retired | `services/gafus/locking.ts` | `@gafus/gafus-server/wallet-lock` |
| L | retired | `services/gafus/settingsService.ts` | `@gafus/gafus-server/settings-read` |
| L | retired | `services/gafus/statusService.ts` | `@gafus/gafus-server/activity-read` |
| H | retired | `services/gafus/types.ts` | `@gafus/gafus-server/wallet-lock` |
| H | retired | `services/gafus/types.ts` | `@gafus/gafus-server/wallet-records` |
| H | retired | `services/gafus/walletService.ts` | `@gafus/gafus-server/wallet-records` |
| H | retired | `services/rewardedCredits/adSessionService.ts` | `@gafus/gafus-server/rewarded-ad-rows` |
| H | retired | `services/rewardedCredits/settingsService.ts` | `@gafus/gafus-server/rewarded-settings` |
| H | retired | `services/rewardedCredits/walletService.ts` | `@gafus/gafus-server/rewarded-wallet-rows` |

## media-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/feed/ports.ts` | `@gafus/media-server/media-db-ports` |
| L | retired | `services/feed/service.ts` | `@gafus/media-server/feed-ranked-rows` |
| L | retired | `services/feed/service.ts` | `@gafus/media-server/media-db-ports` |
| L | retired | `services/gallery/persistence.ts` | `@gafus/media-server/media-db-ports` |
| L | retired | `services/gallery/ports.ts` | `@gafus/media-server/media-db-ports` |
| L | retired | `services/mediaDelivery/purgeQueue.ts` | `@gafus/media-server/deleted-media-purge` |
| L | retired | `services/mediaDelivery/purgeQueue.ts` | `@gafus/media-server/deleted-media-purge` |
| L | retired | `services/questions/mediaV2Cleanup.ts` | `@gafus/media-server/question-v2-cleanup` |
| L | retired | `services/questions/presentPhoto.ts` | `@gafus/media-server/question-photo-task` |
| L | retired | `services/trainerVideo/trainerVideoService.ts` | `@gafus/media-server/trainer-video-rows` |

## course-read-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/course/courseService.ts` | `@gafus/course-read-server/legacy-catalog-rows` |
| L | retired | `services/coursePath/coursePathService.ts` | `@gafus/course-read-server/course-path-read` |
| H | retired | `services/offline/offlineService.ts` | `@gafus/course-read-server` |
| H | retired | `services/rewardedCredits/gafusInterop.ts` | `@gafus/course-read-server/gafus-entitlement-reads` |
| H | retired | `services/trainerCourse/courseEditorSnapshotService.ts` | `@gafus/course-read-server/editor-snapshot` |
| H | retired | `services/training/trainingContentRevision.ts` | `@gafus/course-read-server/content-revision` |
| H | retired | `services/training/trainingDayContent.ts` | `@gafus/course-read-server` |
| H | retired | `services/trainingDay/helpers.ts` | `@gafus/course-read-server/course-path-read` |
| L | retired | `services/video/videoAccessService.ts` | `@gafus/course-read-server/video-access-read` |

## pets-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/petPrevention/petPreventionService.ts` | `@gafus/pets-server/prevention-rows` |
| L | retired | `services/petPrevention/reminderDelivery.ts` | `@gafus/pets-server/prevention-reminder-rows` |
| L | retired | `services/pets/g1VetVisitDetailRead.review.ts` | `@gafus/pets-server/vet-visit-detail` |
| L | retired | `services/pets/petMediaDeletionOutbox.ts` | `@gafus/pets-server/pet-media-deletion-outbox` |
| L | retired | `services/pets/petMediaDeletionSql.ts` | `@gafus/pets-server/pet-media-deletion-default` |
| L | retired | `services/pets/petMediaDeletionSql.ts` | `@gafus/pets-server/pet-media-deletion-sql` |
| L | retired | `services/pets/petsReadService.ts` | `@gafus/pets-server/pet-reads` |
| L | retired | `services/pets/petsService.ts` | `@gafus/pets-server/pet-rows` |
| L | retired | `services/pets/petVetVisitService.ts` | `@gafus/pets-server/vet-visit-write-rows` |

## subscription-finance-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/appSubscription/adminService.ts` | `@gafus/subscription-finance-server/admin-rows` |
| H | retired | `services/appSubscription/npdOperationPersistence.ts` | `@gafus/subscription-finance-server/npd-operation-persistence` |
| H | retired | `services/appSubscription/npdOperationPersistence.ts` | `@gafus/subscription-finance-server/npd-operation-persistence` |
| H | retired | `services/appSubscription/npdReceiptService.ts` | `@gafus/subscription-finance-server/npd-receipts` |
| H | retired | `services/appSubscription/profitFinanceSync.ts` | `@gafus/subscription-finance-server/profit-reconciliation-rows` |
| H | retired | `services/appSubscription/profitService.ts` | `@gafus/subscription-finance-server/profit-dashboard-rows` |
| H | retired | `services/appSubscription/profitService.ts` | `@gafus/subscription-finance-server/profit-video-rows` |
| H | retired | `services/appSubscription/promoCodeService.ts` | `@gafus/subscription-finance-server/promo-code-rows` |

## subscription-payment-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/appSubscription/appleEnvironment.ts` | `@gafus/subscription-payment-server/apple-environment` |
| H | retired | `services/appSubscription/partnerService.ts` | `@gafus/subscription-payment-server/partner` |
| H | retired | `services/appSubscription/paymentFinanceService.ts` | `@gafus/subscription-payment-server/payment-finance` |
| H | retired | `services/appSubscription/paymentPure.ts` | `@gafus/subscription-payment-server/payment-pure` |
| H | retired | `services/appSubscription/paymentService.ts` | `@gafus/subscription-payment-server/service` |
| H | retired | `services/appSubscription/plans.ts` | `@gafus/subscription-payment-server/plans` |
| H | retired | `services/appSubscription/profitMath.ts` | `@gafus/subscription-payment-server/profit-math` |
| H | retired | `services/appSubscription/promoCode.ts` | `@gafus/subscription-payment-server/promo-code` |

## notifications-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/consultation/notificationService.ts` | `@gafus/notifications-server/consultation-email-outbox` |
| L | retired | `services/notifications/immediatePushService.ts` | `@gafus/notifications-server/immediatePushService` |
| L | retired | `services/notifications/index.ts` | `@gafus/notifications-server` |
| L | retired | `services/notifications/pushWorkerService.ts` | `@gafus/notifications-server/pushWorkerService` |
| L | retired | `services/notifications/stepNotificationService.ts` | `@gafus/notifications-server/stepNotificationService` |
| L | retired | `services/reminders/g1ReminderExpiryPIIRedaction.review.ts` | `@gafus/notifications-server/reminder-expiry-redaction` |
| H | retired | `services/reminders/reminderService.ts` | `@gafus/notifications-server/training-reminder-storage` |

## achievements-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/achievements/calculateAchievements.ts` | `@gafus/achievements-server/calculateAchievements` |
| L | retired | `services/achievements/calculateStreaks.ts` | `@gafus/achievements-server/calculateStreaks` |
| L | retired | `services/achievements/datesService.ts` | `@gafus/achievements-server/datesService` |
| L | retired | `services/achievements/index.ts` | `@gafus/achievements-server` |
| L | retired | `services/achievements/statsService.ts` | `@gafus/achievements-server/statsService` |

## consultation-query-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/consultation/availabilityService.ts` | `@gafus/consultation-query-server/schedule-rows` |
| H | retired | `services/consultation/bookingEligibility.ts` | `@gafus/consultation-query-server/booking-eligibility` |
| L | retired | `services/consultation/consultationTransactionalMail.ts` | `@gafus/consultation-query-server` |
| L | retired | `services/consultation/cynologistService.ts` | `@gafus/consultation-query-server/cynologist-catalog-rows` |
| L | retired | `services/consultation/slotService.ts` | `@gafus/consultation-query-server/slot-rows` |

## entitlements-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/contentAccess/index.ts` | `@gafus/entitlements-server` |
| L | retired | `services/contentAccess/policy.ts` | `@gafus/entitlements-server/policy-reads` |
| H | retired | `services/cynologistChat/authorRole.ts` | `@gafus/entitlements-server/policy-reads` |
| H | retired | `services/rewardedCredits/accessService.ts` | `@gafus/entitlements-server/rewarded-access-reads` |

## exam-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/exam/examService.ts` | `@gafus/exam-server/exam-service` |
| H | retired | `services/exam/examService.ts` | `@gafus/exam-server/exam-service` |
| H | retired | `services/exam/examService.ts` | `@gafus/exam-server/exam-service` |
| H | retired | `services/exam/retentionPolicy.ts` | `@gafus/exam-server/retention-policy` |

## admin-reengagement-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/adminReengagement/adminReengagementService.ts` | `@gafus/admin-reengagement-server/adminReengagementService` |
| L | retired | `services/adminReengagement/index.ts` | `@gafus/admin-reengagement-server` |
| L | retired | `services/adminReengagement/types.ts` | `@gafus/admin-reengagement-server/types` |

## admin-rewarded-ads-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/adminRewardedAds/adminRewardedAdsService.ts` | `@gafus/admin-rewarded-ads-server/adminRewardedAdsService` |
| H | retired | `services/adminRewardedAds/index.ts` | `@gafus/admin-rewarded-ads-server` |
| H | retired | `services/adminRewardedAds/types.ts` | `@gafus/admin-rewarded-ads-server/types` |

## article-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/article/articleLikeService.ts` | `@gafus/article-server/likes` |
| L | retired | `services/article/articleService.ts` | `@gafus/article-server` |
| L | retired | `services/article/articleService.ts` | `@gafus/article-server/article-rows` |

## consent-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/consent/consentService.ts` | `@gafus/consent-server/consentService` |
| H | retired | `services/consent/index.ts` | `@gafus/consent-server` |
| H | retired | `services/consent/types.ts` | `@gafus/consent-server/types` |

## mobile-intro-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/mobileIntro/index.ts` | `@gafus/mobile-intro-server` |
| L | retired | `services/mobileIntro/mobileIntroService.ts` | `@gafus/mobile-intro-server/mobileIntroService` |
| L | retired | `services/mobileIntro/types.ts` | `@gafus/mobile-intro-server/types` |

## questions-write-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/questions/errors.ts` | `@gafus/questions-write-server/errors` |
| L | retired | `services/questions/schemas.ts` | `@gafus/questions-write-server/schemas` |
| L | retired | `services/questions/service.ts` | `@gafus/questions-write-server/service` |

## subscription-read-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/appSubscription/accessService.ts` | `@gafus/subscription-read-server` |
| H | retired | `services/appSubscription/settingsService.ts` | `@gafus/subscription-read-server` |

## trainer-ai-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/trainerAI/index.ts` | `@gafus/trainer-ai-server/persistence` |
| L | retired | `services/trainerAI/settingsService.ts` | `@gafus/trainer-ai-server/persistence` |

## feature-flags-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/appFeatureFlags/appFeatureFlagsService.ts` | `@gafus/feature-flags-server/appFeatureFlagsService` |

## subscription-trial-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/appSubscription/trialService.ts` | `@gafus/subscription-trial-server/trial-usage` |

## consultation-write-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/consultation/bookingService.ts` | `@gafus/consultation-write-server/service` |

## tracking-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| L | retired | `services/tracking/trackingService.ts` | `@gafus/tracking-server/trackingService` |

## course-server

| Риск | Форма | Файл Core | Точное server API |
| :--: | --- | --- | --- |
| H | retired | `services/trainerCourse/courseDeleteVersionedService.ts` | `@gafus/course-server/course-delete-versioned` |

## Границы приёмки

Каждая порция требует подтверждения экспортов собранных пакетов, TypeScript,
воздействующих Core/API/Worker тестов и обновления ratchet **только после** прохождения.
Для H-риска обязательны реальный изолированный PostgreSQL и тесты конкуренции,
rollback, владельца/прав, stale lease, CAS/replay. Staging-сервисы не подменяются mocks.
