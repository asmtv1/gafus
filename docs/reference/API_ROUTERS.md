# Hono API: префиксы и HTTP-методы

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

Монтирование роутеров из [`apps/api/src/app.ts`](../../apps/api/src/app.ts). Реальная авторизация зависит от порядка middleware.

| Prefix | Router | Source |
|---|---|---|
| `/` | `healthRoutes` | [`apps/api/src/routes/v1/health.ts`](../../apps/api/src/routes/v1/health.ts) |
| `/api/v1/public` | `publicMobileRoutes` | [`apps/api/src/routes/v1/public-mobile.ts`](../../apps/api/src/routes/v1/public-mobile.ts) |
| `/api/v1/public/paid-course-outline` | `publicPaidCourseOutlineRoutes` | [`apps/api/src/routes/v1/public-paid-course-outline.ts`](../../apps/api/src/routes/v1/public-paid-course-outline.ts) |
| `/api/v1/public/platform-stats` | `publicStatsRoutes` | [`apps/api/src/routes/v1/public-stats.ts`](../../apps/api/src/routes/v1/public-stats.ts) |
| `/api/v1/media-delivery` | `mediaDeliveryRoutes` | [`apps/api/src/routes/v1/media-delivery.ts`](../../apps/api/src/routes/v1/media-delivery.ts) |
| `/api/v1/media-cdn-probe` | `mediaCdnProbeRoutes` | [`apps/api/src/routes/v1/media-cdn-probe.ts`](../../apps/api/src/routes/v1/media-cdn-probe.ts) |
| `/api/v1/admin/media` | `adminMediaRoutes` | [`apps/api/src/routes/v1/admin-media.ts`](../../apps/api/src/routes/v1/admin-media.ts) |
| `/api/v1/admin/partners` | `adminPartnerRoutes` | [`apps/api/src/routes/v1/admin-partners.ts`](../../apps/api/src/routes/v1/admin-partners.ts) |
| `/api/v1/admin/users` | `adminUsersRoutes` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/feature-flags` | `adminFeatureFlagsRoutes` | [`apps/api/src/routes/v1/admin-feature-flags.ts`](../../apps/api/src/routes/v1/admin-feature-flags.ts) |
| `/api/v1/admin/mail` | `adminMailRoutes` | [`apps/api/src/routes/v1/admin-mail.ts`](../../apps/api/src/routes/v1/admin-mail.ts) |
| `/api/v1/admin/analytics` | `adminAnalyticsRoutes` | [`apps/api/src/routes/v1/admin-analytics.ts`](../../apps/api/src/routes/v1/admin-analytics.ts) |
| `/api/v1/admin/reengagement` | `adminReengagementTriggerRoutes` | [`apps/api/src/routes/v1/admin-reengagement-trigger.ts`](../../apps/api/src/routes/v1/admin-reengagement-trigger.ts) |
| `/api/v1/admin/cache` | `adminCacheRoutes` | [`apps/api/src/routes/v1/admin-cache.ts`](../../apps/api/src/routes/v1/admin-cache.ts) |
| `/api/v1/admin/profit` | `adminProfitRoutes` | [`apps/api/src/routes/v1/admin-profit.ts`](../../apps/api/src/routes/v1/admin-profit.ts) |
| `/api/v1/admin/moderation` | `adminModerationRoutes` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/app-subscriptions` | `adminSubscriptionRoutes` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/broadcasts` | `adminBroadcastRoutes` | [`apps/api/src/routes/v1/admin-broadcasts.ts`](../../apps/api/src/routes/v1/admin-broadcasts.ts) |
| `/api/v1/admin/settings` | `adminSettingsRoutes` | [`apps/api/src/routes/v1/admin-settings.ts`](../../apps/api/src/routes/v1/admin-settings.ts) |
| `/api/v1/admin/consultations/schedules` | `adminConsultationScheduleRoutes` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/gafus-operations` | `adminGafusOperationsRoutes` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/auth/vk-web` | `webVkRoutes` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `/api/v1/auth` | `authRoutes` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/mobile-intro` | `mobileIntroRoutes` | [`apps/api/src/routes/v1/mobile-intro.ts`](../../apps/api/src/routes/v1/mobile-intro.ts) |
| `/api/v1/chats` | `chatsRoutes` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/questions` | `questionsRoutes` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/gafus` | `gafusRoutes` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus/admin` | `gafusAdminRoutes` | [`apps/api/src/routes/v1/gafus-admin.ts`](../../apps/api/src/routes/v1/gafus-admin.ts) |
| `/api/v1/gallery` | `galleryRoutes` | [`apps/api/src/routes/v1/gallery.ts`](../../apps/api/src/routes/v1/gallery.ts) |
| `/api/v1/feed` | `feedRoutes` | [`apps/api/src/routes/v1/feed.ts`](../../apps/api/src/routes/v1/feed.ts) |
| `/internal/gallery` | `internalGalleryRoutes` | [`apps/api/src/routes/internal/gallery.ts`](../../apps/api/src/routes/internal/gallery.ts) |
| `/internal/feed` | `internalFeedRoutes` | [`apps/api/src/routes/internal/feed.ts`](../../apps/api/src/routes/internal/feed.ts) |
| `/internal/chat2/media/jobs` | `internalChat2MediaJobRoutes` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/questions/media/jobs` | `internalQuestionsMediaJobRoutes` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/api/v1/user` | `userRoutes` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/articles` | `articlesRoutes` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/courses` | `coursesRoutes` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/trainer/courses` | `trainerCoursesRoutes` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses/manage` | `trainerFullCourseRoutes` | [`apps/api/src/routes/v1/trainer-course-full-manage.ts`](../../apps/api/src/routes/v1/trainer-course-full-manage.ts) |
| `/api/v1/trainer/statistics` | `trainerStatisticsRoutes` | [`apps/api/src/routes/v1/trainer-statistics.ts`](../../apps/api/src/routes/v1/trainer-statistics.ts) |
| `/api/v1/trainer/steps` | `trainerStepsRoutes` | [`apps/api/src/routes/v1/trainer-steps.ts`](../../apps/api/src/routes/v1/trainer-steps.ts) |
| `/api/v1/trainer/steps/manage` | `trainerStepManageRoutes` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/authoring` | `trainerAuthoringRoutes` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/templates` | `trainerTemplatesRoutes` | [`apps/api/src/routes/v1/trainer-templates.ts`](../../apps/api/src/routes/v1/trainer-templates.ts) |
| `/api/v1/trainer/daily-course` | `trainerDailyBundlesRoutes` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course/statistics` | `trainerDailyStatisticsRoutes` | [`apps/api/src/routes/v1/trainer-daily-statistics.ts`](../../apps/api/src/routes/v1/trainer-daily-statistics.ts) |
| `/api/v1/trainer/daily-course/manage` | `trainerDailyManageRoutes` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/days` | `trainerDaysRoutes` | [`apps/api/src/routes/v1/trainer-days.ts`](../../apps/api/src/routes/v1/trainer-days.ts) |
| `/api/v1/trainer/days/manage` | `trainerDayManageRoutes` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/exam-results` | `trainerExamSummaryRoutes` | [`apps/api/src/routes/v1/trainer-exam-summary.ts`](../../apps/api/src/routes/v1/trainer-exam-summary.ts) |
| `/api/v1/trainer/exam-results/manage` | `trainerExamManageRoutes` | [`apps/api/src/routes/v1/trainer-exam-manage.ts`](../../apps/api/src/routes/v1/trainer-exam-manage.ts) |
| `/api/v1/trainer/notes` | `trainerNotesSummaryRoutes` | [`apps/api/src/routes/v1/trainer-notes-summary.ts`](../../apps/api/src/routes/v1/trainer-notes-summary.ts) |
| `/api/v1/trainer/notes/manage` | `trainerNotesManageRoutes` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/articles` | `trainerArticlesOwnSummaryRoutes` | [`apps/api/src/routes/v1/trainer-articles-own-summary.ts`](../../apps/api/src/routes/v1/trainer-articles-own-summary.ts) |
| `/api/v1/trainer/articles/manage` | `trainerArticlesManageRoutes` | [`apps/api/src/routes/v1/trainer-articles-manage.ts`](../../apps/api/src/routes/v1/trainer-articles-manage.ts) |
| `/api/v1/trainer/videos` | `trainerVideosMetadataRoutes` | [`apps/api/src/routes/v1/trainer-videos-metadata.ts`](../../apps/api/src/routes/v1/trainer-videos-metadata.ts) |
| `/api/v1/trainer/videos/manage` | `trainerVideosManageRoutes` | [`apps/api/src/routes/v1/trainer-videos-manage.ts`](../../apps/api/src/routes/v1/trainer-videos-manage.ts) |
| `/api/v1/pets` | `petsRoutes` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `petPreventionRoutes` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `petVetVisitRoutes` | [`apps/api/src/routes/v1/pet-vet-visits.ts`](../../apps/api/src/routes/v1/pet-vet-visits.ts) |
| `/api/v1/training` | `trainingRoutes` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/daily-course` | `dailyCourseRoutes` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/exam` | `examRoutes` | [`apps/api/src/routes/v1/exam.ts`](../../apps/api/src/routes/v1/exam.ts) |
| `/api/v1/surveys` | `surveysRoutes` | [`apps/api/src/routes/v1/surveys.ts`](../../apps/api/src/routes/v1/surveys.ts) |
| `/api/v1/offline` | `offlineRoutes` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/achievements` | `achievementsRoutes` | [`apps/api/src/routes/v1/achievements.ts`](../../apps/api/src/routes/v1/achievements.ts) |
| `/api/v1/subscriptions` | `subscriptionsRoutes` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/notes` | `notesRoutes` | [`apps/api/src/routes/v1/notes.ts`](../../apps/api/src/routes/v1/notes.ts) |
| `/api/v1/reminders` | `remindersRoutes` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/` | `paymentProviderWebhooks` | [`apps/api/src/routes/v1/payment-provider-webhooks.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.ts) |
| `/api/v1/payments` | `paymentsRoutes` | [`apps/api/src/routes/v1/payments.ts`](../../apps/api/src/routes/v1/payments.ts) |
| `/api/v1/consultations` | `consultationsRoutes` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/app-subscription` | `appSubscriptionRoutes` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `appleTokenInitializationReviewRoutes` | [`apps/api/src/routes/v1/g1-apple-token-initialization.review.ts`](../../apps/api/src/routes/v1/g1-apple-token-initialization.review.ts) |
| `/api/v1/rewarded-ads` | `rewardedAdsRoutes` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/partners` | `partnersRoutes` | [`apps/api/src/routes/v1/partners.ts`](../../apps/api/src/routes/v1/partners.ts) |

Всего монтирований: **76**.

## Статически распознанные HTTP-методы

Строковые пути в исходниках; динамические/nested пути могут отсутствовать. Проверяйте файлы и тесты.

| Prefix | HTTP | Path | Module |
|---|---|---|---|
| `/` | `GET` | `/health` | [`apps/api/src/routes/v1/health.ts`](../../apps/api/src/routes/v1/health.ts) |
| `/` | `GET` | `/ready` | [`apps/api/src/routes/v1/health.ts`](../../apps/api/src/routes/v1/health.ts) |
| `/` | `GET` | `/metrics/course-cache` | [`apps/api/src/routes/v1/health.ts`](../../apps/api/src/routes/v1/health.ts) |
| `/api/v1/public` | `GET` | `/mobile-app` | [`apps/api/src/routes/v1/public-mobile.ts`](../../apps/api/src/routes/v1/public-mobile.ts) |
| `/api/v1/public/paid-course-outline` | `GET` | `/:courseType` | [`apps/api/src/routes/v1/public-paid-course-outline.ts`](../../apps/api/src/routes/v1/public-paid-course-outline.ts) |
| `/api/v1/public/platform-stats` | `GET` | `/` | [`apps/api/src/routes/v1/public-stats.ts`](../../apps/api/src/routes/v1/public-stats.ts) |
| `/api/v1/media-delivery` | `GET` | `/status` | [`apps/api/src/routes/v1/media-delivery.ts`](../../apps/api/src/routes/v1/media-delivery.ts) |
| `/api/v1/media-cdn-probe` | `GET` | `/` | [`apps/api/src/routes/v1/media-cdn-probe.ts`](../../apps/api/src/routes/v1/media-cdn-probe.ts) |
| `/api/v1/media-cdn-probe` | `GET` | `user` | [`apps/api/src/routes/v1/media-cdn-probe.ts`](../../apps/api/src/routes/v1/media-cdn-probe.ts) |
| `/api/v1/admin/media` | `GET` | `/stats` | [`apps/api/src/routes/v1/admin-media.ts`](../../apps/api/src/routes/v1/admin-media.ts) |
| `/api/v1/admin/partners` | `GET` | `/` | [`apps/api/src/routes/v1/admin-partners.ts`](../../apps/api/src/routes/v1/admin-partners.ts) |
| `/api/v1/admin/partners` | `GET` | `user` | [`apps/api/src/routes/v1/admin-partners.ts`](../../apps/api/src/routes/v1/admin-partners.ts) |
| `/api/v1/admin/partners` | `GET` | `/:partnerId` | [`apps/api/src/routes/v1/admin-partners.ts`](../../apps/api/src/routes/v1/admin-partners.ts) |
| `/api/v1/admin/partners` | `POST` | `/:partnerId/mark-paid` | [`apps/api/src/routes/v1/admin-partners.ts`](../../apps/api/src/routes/v1/admin-partners.ts) |
| `/api/v1/admin/users` | `GET` | `/` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/users` | `GET` | `user` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/users` | `PATCH` | `/:userId` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/users` | `DELETE` | `/:userId` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/users` | `GET` | `/:userId/app-subscription` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/users` | `POST` | `/:userId/app-subscription` | [`apps/api/src/routes/v1/admin-users.ts`](../../apps/api/src/routes/v1/admin-users.ts) |
| `/api/v1/admin/feature-flags` | `GET` | `/` | [`apps/api/src/routes/v1/admin-feature-flags.ts`](../../apps/api/src/routes/v1/admin-feature-flags.ts) |
| `/api/v1/admin/feature-flags` | `GET` | `user` | [`apps/api/src/routes/v1/admin-feature-flags.ts`](../../apps/api/src/routes/v1/admin-feature-flags.ts) |
| `/api/v1/admin/feature-flags` | `PUT` | `/` | [`apps/api/src/routes/v1/admin-feature-flags.ts`](../../apps/api/src/routes/v1/admin-feature-flags.ts) |
| `/api/v1/admin/mail` | `GET` | `/` | [`apps/api/src/routes/v1/admin-mail.ts`](../../apps/api/src/routes/v1/admin-mail.ts) |
| `/api/v1/admin/mail` | `GET` | `user` | [`apps/api/src/routes/v1/admin-mail.ts`](../../apps/api/src/routes/v1/admin-mail.ts) |
| `/api/v1/admin/mail` | `GET` | `/alerts` | [`apps/api/src/routes/v1/admin-mail.ts`](../../apps/api/src/routes/v1/admin-mail.ts) |
| `/api/v1/admin/analytics` | `GET` | `/reengagement` | [`apps/api/src/routes/v1/admin-analytics.ts`](../../apps/api/src/routes/v1/admin-analytics.ts) |
| `/api/v1/admin/analytics` | `GET` | `user` | [`apps/api/src/routes/v1/admin-analytics.ts`](../../apps/api/src/routes/v1/admin-analytics.ts) |
| `/api/v1/admin/analytics` | `GET` | `/rewarded-ads` | [`apps/api/src/routes/v1/admin-analytics.ts`](../../apps/api/src/routes/v1/admin-analytics.ts) |
| `/api/v1/admin/reengagement` | `POST` | `/run` | [`apps/api/src/routes/v1/admin-reengagement-trigger.ts`](../../apps/api/src/routes/v1/admin-reengagement-trigger.ts) |
| `/api/v1/admin/reengagement` | `GET` | `user` | [`apps/api/src/routes/v1/admin-reengagement-trigger.ts`](../../apps/api/src/routes/v1/admin-reengagement-trigger.ts) |
| `/api/v1/admin/cache` | `GET` | `/` | [`apps/api/src/routes/v1/admin-cache.ts`](../../apps/api/src/routes/v1/admin-cache.ts) |
| `/api/v1/admin/cache` | `GET` | `user` | [`apps/api/src/routes/v1/admin-cache.ts`](../../apps/api/src/routes/v1/admin-cache.ts) |
| `/api/v1/admin/cache` | `POST` | `/courses/refresh` | [`apps/api/src/routes/v1/admin-cache.ts`](../../apps/api/src/routes/v1/admin-cache.ts) |
| `/api/v1/admin/profit` | `GET` | `/` | [`apps/api/src/routes/v1/admin-profit.ts`](../../apps/api/src/routes/v1/admin-profit.ts) |
| `/api/v1/admin/profit` | `GET` | `user` | [`apps/api/src/routes/v1/admin-profit.ts`](../../apps/api/src/routes/v1/admin-profit.ts) |
| `/api/v1/admin/profit` | `POST` | `/video-expenses` | [`apps/api/src/routes/v1/admin-profit.ts`](../../apps/api/src/routes/v1/admin-profit.ts) |
| `/api/v1/admin/profit` | `POST` | `/video-expenses/cancel` | [`apps/api/src/routes/v1/admin-profit.ts`](../../apps/api/src/routes/v1/admin-profit.ts) |
| `/api/v1/admin/moderation` | `GET` | `/feed/reports` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/moderation` | `GET` | `user` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/moderation` | `POST` | `/feed/reports/:reportId` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/moderation` | `GET` | `/questions/reports` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/moderation` | `POST` | `/questions/reports` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/moderation` | `DELETE` | `/questions/blocks/:userId` | [`apps/api/src/routes/v1/admin-moderation.ts`](../../apps/api/src/routes/v1/admin-moderation.ts) |
| `/api/v1/admin/app-subscriptions` | `GET` | `/` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `GET` | `user` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `POST` | `/promo-codes` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `PATCH` | `/promo-codes/:id` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `DELETE` | `/promo-codes/:id` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `POST` | `/npd/:receiptId/retry` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/app-subscriptions` | `POST` | `/npd/:receiptId/reconcile` | [`apps/api/src/routes/v1/admin-subscriptions.ts`](../../apps/api/src/routes/v1/admin-subscriptions.ts) |
| `/api/v1/admin/broadcasts` | `GET` | `/preview` | [`apps/api/src/routes/v1/admin-broadcasts.ts`](../../apps/api/src/routes/v1/admin-broadcasts.ts) |
| `/api/v1/admin/broadcasts` | `GET` | `user` | [`apps/api/src/routes/v1/admin-broadcasts.ts`](../../apps/api/src/routes/v1/admin-broadcasts.ts) |
| `/api/v1/admin/broadcasts` | `POST` | `/` | [`apps/api/src/routes/v1/admin-broadcasts.ts`](../../apps/api/src/routes/v1/admin-broadcasts.ts) |
| `/api/v1/admin/settings` | `GET` | `/subscriptions` | [`apps/api/src/routes/v1/admin-settings.ts`](../../apps/api/src/routes/v1/admin-settings.ts) |
| `/api/v1/admin/settings` | `GET` | `user` | [`apps/api/src/routes/v1/admin-settings.ts`](../../apps/api/src/routes/v1/admin-settings.ts) |
| `/api/v1/admin/settings` | `PUT` | `/subscriptions` | [`apps/api/src/routes/v1/admin-settings.ts`](../../apps/api/src/routes/v1/admin-settings.ts) |
| `/api/v1/admin/consultations/schedules` | `GET` | `/:trainerId` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `GET` | `user` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `PUT` | `/:trainerId` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `POST` | `/:trainerId/day-offs` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `DELETE` | `/:trainerId/day-offs/:dayOffId` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `POST` | `/:trainerId/exceptions` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/consultations/schedules` | `DELETE` | `/:trainerId/exceptions/:exceptionId` | [`apps/api/src/routes/v1/admin-consultation-schedules.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.ts) |
| `/api/v1/admin/gafus-operations` | `GET` | `/fraud` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/admin/gafus-operations` | `GET` | `user` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/admin/gafus-operations` | `POST` | `/fraud/:signalId/review` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/admin/gafus-operations` | `GET` | `/legacy/preflight` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/admin/gafus-operations` | `POST` | `/legacy/import` | [`apps/api/src/routes/v1/admin-gafus-operations.ts`](../../apps/api/src/routes/v1/admin-gafus-operations.ts) |
| `/api/v1/auth/vk-web` | `POST` | `/start` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `/api/v1/auth/vk-web` | `GET` | `/callback` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `/api/v1/auth/vk-web` | `GET` | `/consent` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `/api/v1/auth/vk-web` | `POST` | `/consent` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `/api/v1/auth` | `POST` | `/login` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/register` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/registration-promo-preview` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `GET` | `/me` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `GET` | `user` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/refresh` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/logout` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/logout-all` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/check-phone-match` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/password-reset-request` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/reset-password` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/email-change-request` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/email-change-confirm` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `GET` | `/vk-consent/:contextToken` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/vk` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/vk-consent` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/vk-phone-set` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/vk-link` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/set-password` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/change-password` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `GET` | `/username-available` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/auth` | `POST` | `/username-change` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `/api/v1/mobile-intro` | `POST` | `/events` | [`apps/api/src/routes/v1/mobile-intro.ts`](../../apps/api/src/routes/v1/mobile-intro.ts) |
| `/api/v1/mobile-intro` | `POST` | `/auth-outcome` | [`apps/api/src/routes/v1/mobile-intro.ts`](../../apps/api/src/routes/v1/mobile-intro.ts) |
| `/api/v1/mobile-intro` | `GET` | `user` | [`apps/api/src/routes/v1/mobile-intro.ts`](../../apps/api/src/routes/v1/mobile-intro.ts) |
| `/api/v1/mobile-intro` | `GET` | `/admin/report` | [`apps/api/src/routes/v1/mobile-intro.ts`](../../apps/api/src/routes/v1/mobile-intro.ts) |
| `/api/v1/chats` | `GET` | `user` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/realtime/connect` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id/realtime` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/users` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/discover` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/direct` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/cynologist` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/community` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/courses` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/courses/:courseId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/groups` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/block` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id/messages` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/messages` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `PATCH` | `/:id/messages/:messageId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `DELETE` | `/:id/messages/:messageId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/messages/:messageId/reaction` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/read` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/media/v2/reserve` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/media/v2/:mediaId/confirm` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id/media/v2/:mediaId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/media/v2/:mediaId/attach` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/attachments` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `file` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id/attachments/:attachmentId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `DELETE` | `/:id/attachments/:attachmentId` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/join` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/leave` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/invite` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/avatar` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `DELETE` | `/:id/avatar` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `PATCH` | `/:id/group` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/moderate` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/transfer-owner` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/mute` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/messages/:messageId/report` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/moderation/reports` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/moderation/reports/:reportId/resolve` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `GET` | `/:id/reports` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/chats` | `POST` | `/:id/reports/:reportId/resolve` | [`apps/api/src/routes/v1/chats.ts`](../../apps/api/src/routes/v1/chats.ts) |
| `/api/v1/questions` | `POST` | `/photos/reservations` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `GET` | `user` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `POST` | `/photos/:id/confirm` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `GET` | `/photos/:id/status` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `DELETE` | `/photos/:id` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `POST` | `/photos` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/questions` | `ALL` | `*` | [`apps/api/src/routes/v1/questions.ts`](../../apps/api/src/routes/v1/questions.ts) |
| `/api/v1/gafus` | `GET` | `/status` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `GET` | `user` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `GET` | `/history` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `POST` | `/unlock` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `GET` | `/reaction-progress/:postId` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `GET` | `/mini-guides` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus` | `GET` | `/mini-guide/:courseId` | [`apps/api/src/routes/v1/gafus.ts`](../../apps/api/src/routes/v1/gafus.ts) |
| `/api/v1/gafus/admin` | `GET` | `/dashboard` | [`apps/api/src/routes/v1/gafus-admin.ts`](../../apps/api/src/routes/v1/gafus-admin.ts) |
| `/api/v1/gafus/admin` | `GET` | `user` | [`apps/api/src/routes/v1/gafus-admin.ts`](../../apps/api/src/routes/v1/gafus-admin.ts) |
| `/api/v1/gafus/admin` | `PATCH` | `/settings` | [`apps/api/src/routes/v1/gafus-admin.ts`](../../apps/api/src/routes/v1/gafus-admin.ts) |
| `/api/v1/gafus/admin` | `POST` | `/adjust` | [`apps/api/src/routes/v1/gafus-admin.ts`](../../apps/api/src/routes/v1/gafus-admin.ts) |
| `/api/v1/gallery` | `ALL` | `*` | [`apps/api/src/routes/v1/gallery.ts`](../../apps/api/src/routes/v1/gallery.ts) |
| `/api/v1/gallery` | `GET` | `user` | [`apps/api/src/routes/v1/gallery.ts`](../../apps/api/src/routes/v1/gallery.ts) |
| `/api/v1/feed` | `ALL` | `*` | [`apps/api/src/routes/v1/feed.ts`](../../apps/api/src/routes/v1/feed.ts) |
| `/api/v1/feed` | `GET` | `user` | [`apps/api/src/routes/v1/feed.ts`](../../apps/api/src/routes/v1/feed.ts) |
| `/internal/gallery` | `ALL` | `*` | [`apps/api/src/routes/internal/gallery.ts`](../../apps/api/src/routes/internal/gallery.ts) |
| `/internal/feed` | `ALL` | `*` | [`apps/api/src/routes/internal/feed.ts`](../../apps/api/src/routes/internal/feed.ts) |
| `/internal/chat2/media/jobs` | `GET` | `content-type` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/chat2/media/jobs` | `GET` | `content-length` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/chat2/media/jobs` | `GET` | `x-chat2-timestamp` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/chat2/media/jobs` | `GET` | `x-chat2-nonce` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/chat2/media/jobs` | `GET` | `x-chat2-signature` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/chat2/media/jobs` | `ALL` | `*` | [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `/internal/questions/media/jobs` | `GET` | `content-type` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/internal/questions/media/jobs` | `GET` | `content-length` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/internal/questions/media/jobs` | `GET` | `x-questions-timestamp` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/internal/questions/media/jobs` | `GET` | `x-questions-nonce` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/internal/questions/media/jobs` | `GET` | `x-questions-signature` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/internal/questions/media/jobs` | `ALL` | `*` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) |
| `/api/v1/user` | `GET` | `/profile/public` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `GET` | `/profile` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `GET` | `user` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `GET` | `/push-subscription-status` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `GET` | `/onboarding-tour` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `POST` | `/onboarding-tour/complete` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `PUT` | `/profile` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `POST` | `/avatar` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `GET` | `/account/deletion-preflight` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `POST` | `/account/deletion-code` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/user` | `POST` | `/account/delete` | [`apps/api/src/routes/v1/user.ts`](../../apps/api/src/routes/v1/user.ts) |
| `/api/v1/articles` | `GET` | `/` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/articles` | `GET` | `user` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/articles` | `POST` | `/:id/like` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/articles` | `POST` | `/:slug/view` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/articles` | `GET` | `/:slug` | [`apps/api/src/routes/v1/articles.ts`](../../apps/api/src/routes/v1/articles.ts) |
| `/api/v1/courses` | `GET` | `/` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `GET` | `user` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `GET` | `/access` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `GET` | `/favorites` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `POST` | `/favorites` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `POST` | `/personalization` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `GET` | `/metadata` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `GET` | `/reviews` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `POST` | `/reviews` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `PATCH` | `/reviews` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/courses` | `DELETE` | `/reviews` | [`apps/api/src/routes/v1/courses.ts`](../../apps/api/src/routes/v1/courses.ts) |
| `/api/v1/trainer/courses` | `GET` | `//draft` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `GET` | `/:courseId/draft` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `GET` | `/:courseId/editor-snapshot` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `GET` | `/:courseId/version` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `PATCH` | `/:courseId/name` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `POST` | `/` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses` | `PUT` | `/:courseId` | [`apps/api/src/routes/v1/trainer-courses.ts`](../../apps/api/src/routes/v1/trainer-courses.ts) |
| `/api/v1/trainer/courses/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-course-full-manage.ts`](../../apps/api/src/routes/v1/trainer-course-full-manage.ts) |
| `/api/v1/trainer/courses/manage` | `POST` | `/` | [`apps/api/src/routes/v1/trainer-course-full-manage.ts`](../../apps/api/src/routes/v1/trainer-course-full-manage.ts) |
| `/api/v1/trainer/courses/manage` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/trainer-course-full-manage.ts`](../../apps/api/src/routes/v1/trainer-course-full-manage.ts) |
| `/api/v1/trainer/courses/manage` | `PUT` | `/:id` | [`apps/api/src/routes/v1/trainer-course-full-manage.ts`](../../apps/api/src/routes/v1/trainer-course-full-manage.ts) |
| `/api/v1/trainer/statistics` | `GET` | `/courses` | [`apps/api/src/routes/v1/trainer-statistics.ts`](../../apps/api/src/routes/v1/trainer-statistics.ts) |
| `/api/v1/trainer/statistics` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-statistics.ts`](../../apps/api/src/routes/v1/trainer-statistics.ts) |
| `/api/v1/trainer/statistics` | `GET` | `/steps` | [`apps/api/src/routes/v1/trainer-statistics.ts`](../../apps/api/src/routes/v1/trainer-statistics.ts) |
| `/api/v1/trainer/steps` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-steps.ts`](../../apps/api/src/routes/v1/trainer-steps.ts) |
| `/api/v1/trainer/steps` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-steps.ts`](../../apps/api/src/routes/v1/trainer-steps.ts) |
| `/api/v1/trainer/steps/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/steps/manage` | `GET` | `content-length` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/steps/manage` | `GET` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/steps/manage` | `PUT` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/steps/manage` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/authoring` | `POST` | `/steps` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/authoring` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/authoring` | `POST` | `/courses` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/authoring` | `POST` | `/articles` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/authoring` | `POST` | `/days` | [`apps/api/src/routes/v1/trainer-authoring.ts`](../../apps/api/src/routes/v1/trainer-authoring.ts) |
| `/api/v1/trainer/templates` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-templates.ts`](../../apps/api/src/routes/v1/trainer-templates.ts) |
| `/api/v1/trainer/templates` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-templates.ts`](../../apps/api/src/routes/v1/trainer-templates.ts) |
| `/api/v1/trainer/daily-course` | `GET` | `/bundles` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course` | `GET` | `/bundle-step-candidates` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course` | `GET` | `/schedule-range` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course` | `GET` | `/candidates` | [`apps/api/src/routes/v1/trainer-daily-bundles.ts`](../../apps/api/src/routes/v1/trainer-daily-bundles.ts) |
| `/api/v1/trainer/daily-course/statistics` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-daily-statistics.ts`](../../apps/api/src/routes/v1/trainer-daily-statistics.ts) |
| `/api/v1/trainer/daily-course/statistics` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-daily-statistics.ts`](../../apps/api/src/routes/v1/trainer-daily-statistics.ts) |
| `/api/v1/trainer/daily-course/manage` | `PUT` | `/bundles` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/daily-course/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/daily-course/manage` | `DELETE` | `/bundles/:bundleId` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/daily-course/manage` | `PUT` | `/schedule` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/daily-course/manage` | `DELETE` | `/schedule/:scheduleId` | [`apps/api/src/routes/v1/trainer-daily-manage.ts`](../../apps/api/src/routes/v1/trainer-daily-manage.ts) |
| `/api/v1/trainer/days` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-days.ts`](../../apps/api/src/routes/v1/trainer-days.ts) |
| `/api/v1/trainer/days` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-days.ts`](../../apps/api/src/routes/v1/trainer-days.ts) |
| `/api/v1/trainer/days/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/days/manage` | `GET` | `content-length` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/days/manage` | `GET` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/days/manage` | `PUT` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/days/manage` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/trainer-content-manage.ts`](../../apps/api/src/routes/v1/trainer-content-manage.ts) |
| `/api/v1/trainer/exam-results` | `GET` | `/summary` | [`apps/api/src/routes/v1/trainer-exam-summary.ts`](../../apps/api/src/routes/v1/trainer-exam-summary.ts) |
| `/api/v1/trainer/exam-results` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-exam-summary.ts`](../../apps/api/src/routes/v1/trainer-exam-summary.ts) |
| `/api/v1/trainer/exam-results` | `GET` | `/pending-summary` | [`apps/api/src/routes/v1/trainer-exam-summary.ts`](../../apps/api/src/routes/v1/trainer-exam-summary.ts) |
| `/api/v1/trainer/exam-results/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-exam-manage.ts`](../../apps/api/src/routes/v1/trainer-exam-manage.ts) |
| `/api/v1/trainer/exam-results/manage` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-exam-manage.ts`](../../apps/api/src/routes/v1/trainer-exam-manage.ts) |
| `/api/v1/trainer/exam-results/manage` | `POST` | `/review` | [`apps/api/src/routes/v1/trainer-exam-manage.ts`](../../apps/api/src/routes/v1/trainer-exam-manage.ts) |
| `/api/v1/trainer/notes` | `GET` | `/summary` | [`apps/api/src/routes/v1/trainer-notes-summary.ts`](../../apps/api/src/routes/v1/trainer-notes-summary.ts) |
| `/api/v1/trainer/notes` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-notes-summary.ts`](../../apps/api/src/routes/v1/trainer-notes-summary.ts) |
| `/api/v1/trainer/notes/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/notes/manage` | `GET` | `/` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/notes/manage` | `GET` | `/lookup` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/notes/manage` | `POST` | `/` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/notes/manage` | `PUT` | `/:id` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/notes/manage` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/trainer-notes-manage.ts`](../../apps/api/src/routes/v1/trainer-notes-manage.ts) |
| `/api/v1/trainer/articles` | `GET` | `/own-summary` | [`apps/api/src/routes/v1/trainer-articles-own-summary.ts`](../../apps/api/src/routes/v1/trainer-articles-own-summary.ts) |
| `/api/v1/trainer/articles` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-articles-own-summary.ts`](../../apps/api/src/routes/v1/trainer-articles-own-summary.ts) |
| `/api/v1/trainer/articles/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-articles-manage.ts`](../../apps/api/src/routes/v1/trainer-articles-manage.ts) |
| `/api/v1/trainer/articles/manage` | `GET` | `/:id` | [`apps/api/src/routes/v1/trainer-articles-manage.ts`](../../apps/api/src/routes/v1/trainer-articles-manage.ts) |
| `/api/v1/trainer/articles/manage` | `PUT` | `/:id` | [`apps/api/src/routes/v1/trainer-articles-manage.ts`](../../apps/api/src/routes/v1/trainer-articles-manage.ts) |
| `/api/v1/trainer/articles/manage` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/trainer-articles-manage.ts`](../../apps/api/src/routes/v1/trainer-articles-manage.ts) |
| `/api/v1/trainer/videos` | `GET` | `/metadata` | [`apps/api/src/routes/v1/trainer-videos-metadata.ts`](../../apps/api/src/routes/v1/trainer-videos-metadata.ts) |
| `/api/v1/trainer/videos` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-videos-metadata.ts`](../../apps/api/src/routes/v1/trainer-videos-metadata.ts) |
| `/api/v1/trainer/videos/manage` | `PUT` | `/:id/name` | [`apps/api/src/routes/v1/trainer-videos-manage.ts`](../../apps/api/src/routes/v1/trainer-videos-manage.ts) |
| `/api/v1/trainer/videos/manage` | `GET` | `user` | [`apps/api/src/routes/v1/trainer-videos-manage.ts`](../../apps/api/src/routes/v1/trainer-videos-manage.ts) |
| `/api/v1/pets` | `GET` | `user` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `POST` | `/` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/:petId/weight` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `POST` | `/:petId/weight` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `DELETE` | `/:petId/weight/:entryId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `PUT` | `/:petId/weight/target` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/:petId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `POST` | `/:petId/photo` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/:petId/documents` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `POST` | `/:petId/documents` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `DELETE` | `/:petId/documents/:documentId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `PUT` | `/:petId/documents/:documentId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/:petId/documents/:documentId/download` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `PUT` | `/:petId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `DELETE` | `/:petId` | [`apps/api/src/routes/v1/pets.ts`](../../apps/api/src/routes/v1/pets.ts) |
| `/api/v1/pets` | `GET` | `/:petId/prevention` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `GET` | `user` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `POST` | `/:petId/prevention` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `POST` | `/:petId/prevention/batch` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `PUT` | `/:petId/prevention/:entryId` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `DELETE` | `/:petId/prevention/:entryId` | [`apps/api/src/routes/v1/pet-prevention.ts`](../../apps/api/src/routes/v1/pet-prevention.ts) |
| `/api/v1/pets` | `ALL` | `/:petId/vet-visits` | [`apps/api/src/routes/v1/pet-vet-visits.ts`](../../apps/api/src/routes/v1/pet-vet-visits.ts) |
| `/api/v1/pets` | `GET` | `user` | [`apps/api/src/routes/v1/pet-vet-visits.ts`](../../apps/api/src/routes/v1/pet-vet-visits.ts) |
| `/api/v1/pets` | `ALL` | `/:petId/vet-visits/*` | [`apps/api/src/routes/v1/pet-vet-visits.ts`](../../apps/api/src/routes/v1/pet-vet-visits.ts) |
| `/api/v1/training` | `GET` | `user` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/days` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/day` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/start` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/pause` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/resume` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/reset` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/complete/practice` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/step/complete/theory` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/diary` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/diary` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/video/preview` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/video/url` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/video/:videoId/progress` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `POST` | `/video/:videoId/progress` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/video/:videoId/manifest` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/video/:videoId/manifest.m3u8` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `/video/:videoId/segment` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/training` | `GET` | `content-type` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `/api/v1/daily-course` | `GET` | `/today` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `GET` | `user` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `GET` | `/day` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `POST` | `/step/start` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `POST` | `/step/pause` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `POST` | `/step/resume` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `POST` | `/step/reset` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/daily-course` | `POST` | `/step/complete` | [`apps/api/src/routes/v1/daily-course.ts`](../../apps/api/src/routes/v1/daily-course.ts) |
| `/api/v1/exam` | `GET` | `/result` | [`apps/api/src/routes/v1/exam.ts`](../../apps/api/src/routes/v1/exam.ts) |
| `/api/v1/exam` | `GET` | `user` | [`apps/api/src/routes/v1/exam.ts`](../../apps/api/src/routes/v1/exam.ts) |
| `/api/v1/exam` | `POST` | `/submit` | [`apps/api/src/routes/v1/exam.ts`](../../apps/api/src/routes/v1/exam.ts) |
| `/api/v1/exam` | `POST` | `/upload-video` | [`apps/api/src/routes/v1/exam.ts`](../../apps/api/src/routes/v1/exam.ts) |
| `/api/v1/surveys` | `GET` | `/comparison` | [`apps/api/src/routes/v1/surveys.ts`](../../apps/api/src/routes/v1/surveys.ts) |
| `/api/v1/surveys` | `GET` | `user` | [`apps/api/src/routes/v1/surveys.ts`](../../apps/api/src/routes/v1/surveys.ts) |
| `/api/v1/surveys` | `GET` | `/:slug` | [`apps/api/src/routes/v1/surveys.ts`](../../apps/api/src/routes/v1/surveys.ts) |
| `/api/v1/surveys` | `POST` | `/:slug/response` | [`apps/api/src/routes/v1/surveys.ts`](../../apps/api/src/routes/v1/surveys.ts) |
| `/api/v1/offline` | `GET` | `/course/version` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/offline` | `GET` | `/course/updates` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/offline` | `GET` | `/course/download` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/offline` | `GET` | `user` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/offline` | `POST` | `/mutations` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/offline` | `GET` | `/mutations/:eventId` | [`apps/api/src/routes/v1/offline.ts`](../../apps/api/src/routes/v1/offline.ts) |
| `/api/v1/achievements` | `GET` | `user` | [`apps/api/src/routes/v1/achievements.ts`](../../apps/api/src/routes/v1/achievements.ts) |
| `/api/v1/achievements` | `GET` | `/training-dates` | [`apps/api/src/routes/v1/achievements.ts`](../../apps/api/src/routes/v1/achievements.ts) |
| `/api/v1/achievements` | `GET` | `/` | [`apps/api/src/routes/v1/achievements.ts`](../../apps/api/src/routes/v1/achievements.ts) |
| `/api/v1/subscriptions` | `GET` | `/push/public-key` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/subscriptions` | `GET` | `/push` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/subscriptions` | `GET` | `user` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/subscriptions` | `POST` | `/push` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/subscriptions` | `POST` | `/push/device-status` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/subscriptions` | `DELETE` | `/push` | [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts) |
| `/api/v1/notes` | `GET` | `/student` | [`apps/api/src/routes/v1/notes.ts`](../../apps/api/src/routes/v1/notes.ts) |
| `/api/v1/notes` | `GET` | `user` | [`apps/api/src/routes/v1/notes.ts`](../../apps/api/src/routes/v1/notes.ts) |
| `/api/v1/reminders` | `GET` | `/` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/api/v1/reminders` | `GET` | `user` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/api/v1/reminders` | `POST` | `/` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/api/v1/reminders` | `PUT` | `/:id` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/api/v1/reminders` | `DELETE` | `/:id` | [`apps/api/src/routes/v1/reminders.ts`](../../apps/api/src/routes/v1/reminders.ts) |
| `/` | `POST` | `/api/v1/payments/webhook` | [`apps/api/src/routes/v1/payment-provider-webhooks.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.ts) |
| `/` | `POST` | `/api/v1/app-subscription/apple/notifications` | [`apps/api/src/routes/v1/payment-provider-webhooks.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.ts) |
| `/api/v1/payments` | `POST` | `/create` | [`apps/api/src/routes/v1/payments.ts`](../../apps/api/src/routes/v1/payments.ts) |
| `/api/v1/payments` | `POST` | `/apple/verify` | [`apps/api/src/routes/v1/payments.ts`](../../apps/api/src/routes/v1/payments.ts) |
| `/api/v1/payments` | `GET` | `/apple/course-metadata` | [`apps/api/src/routes/v1/payments.ts`](../../apps/api/src/routes/v1/payments.ts) |
| `/api/v1/consultations` | `GET` | `user` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/bookings/:bookingId/voximplant/prepare` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/bookings/:bookingId/voximplant/admission` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/bookings/:bookingId/voximplant/sign` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/cynologists` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/cynologists/:cynologistUserId/slots/:slotId/verify` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/cynologists/:cynologistUserId/slots` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/book/lookup` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/book` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/my` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/bookings/:bookingId/cancel` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/trainer/bookings` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/bookings/:bookingId/confirm` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/bookings/:bookingId/complete` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/bookings/:bookingId/no-show` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/bookings/:bookingId/reject` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/trainer/availability` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `PUT` | `/trainer/availability` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/day-offs` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `DELETE` | `/trainer/day-offs/:dayOffId` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `POST` | `/trainer/exceptions` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `DELETE` | `/trainer/exceptions/:exceptionId` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/admin/cynologists` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `PUT` | `/admin/cynologists/listed` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/consultations` | `GET` | `/admin/bookings` | [`apps/api/src/routes/v1/consultations.ts`](../../apps/api/src/routes/v1/consultations.ts) |
| `/api/v1/app-subscription` | `GET` | `/status` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `GET` | `user` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `GET` | `/offer` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/promo-code/preview` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/yookassa/start` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/yookassa/cancel` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/apple/verify` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/apple/restore` | [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `/api/v1/app-subscription` | `POST` | `/apple/token/initialize` | [`apps/api/src/routes/v1/g1-apple-token-initialization.review.ts`](../../apps/api/src/routes/v1/g1-apple-token-initialization.review.ts) |
| `/api/v1/app-subscription` | `GET` | `user` | [`apps/api/src/routes/v1/g1-apple-token-initialization.review.ts`](../../apps/api/src/routes/v1/g1-apple-token-initialization.review.ts) |
| `/api/v1/rewarded-ads` | `GET` | `/status` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/rewarded-ads` | `GET` | `user` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/rewarded-ads` | `POST` | `/session` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/rewarded-ads` | `POST` | `/events` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/rewarded-ads` | `POST` | `/grant` | [`apps/api/src/routes/v1/rewarded-ads.ts`](../../apps/api/src/routes/v1/rewarded-ads.ts) |
| `/api/v1/partners` | `GET` | `/me` | [`apps/api/src/routes/v1/partners.ts`](../../apps/api/src/routes/v1/partners.ts) |
| `/api/v1/partners` | `GET` | `user` | [`apps/api/src/routes/v1/partners.ts`](../../apps/api/src/routes/v1/partners.ts) |
| `/api/v1/partners` | `POST` | `/attribution` | [`apps/api/src/routes/v1/partners.ts`](../../apps/api/src/routes/v1/partners.ts) |
| `/api/v1/partners` | `POST` | `/payouts` | [`apps/api/src/routes/v1/partners.ts`](../../apps/api/src/routes/v1/partners.ts) |

Статически распознано HTTP-методов: **407**. Подробности DTO, security, query/body: код и тесты.

Закрытые job endpoints: `/internal/*`. Не вызывать вне разрешённого локального окружения.
