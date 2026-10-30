# Переменные окружения: безопасный индекс имён

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

**Только имена**: значения .env, токены, креденшелы, key-файлы не прочитаны и не включены.
Упоминание переменной не означает обязательность для каждого сервиса.

| Имя | Использование (до 3 источников) |
|---|---|
| `ACCOUNT_CLEANUP_TEST_DATABASE_URL` | [`packages/core/src/services/accountCleanup/accountCleanup.integration.test.ts`](../../packages/core/src/services/accountCleanup/accountCleanup.integration.test.ts) |
| `ACCOUNT_DELETE_PLAYWRIGHT_WORK` | [`apps/api/src/test/account-delete-playwright-work-20261026.acceptance.ts`](../../apps/api/src/test/account-delete-playwright-work-20261026.acceptance.ts) |
| `ACCOUNT_DEV_MARKER_TX_PROOF` | [`apps/api/src/test/account-dev-locator-tx-rollback.acceptance.ts`](../../apps/api/src/test/account-dev-locator-tx-rollback.acceptance.ts) |
| `ACCOUNT_PREFLIGHT_BROWSER_TEST` | [`apps/api/src/test/account-deletion-preflight-playwright-20261026.acceptance.ts`](../../apps/api/src/test/account-deletion-preflight-playwright-20261026.acceptance.ts) |
| `ACCOUNT_STORAGE_CLEANUP_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `ADMIN2_REAL_PG` | [`apps/api/src/routes/v1/admin2-real-postgres-http.test.ts`](../../apps/api/src/routes/v1/admin2-real-postgres-http.test.ts) |
| `ADMIN5_SCHEDULE_REALPG_RUN` | [`apps/api/src/routes/v1/admin-consultation-schedules.realpg.test.ts`](../../apps/api/src/routes/v1/admin-consultation-schedules.realpg.test.ts), [`packages/core/src/services/consultation/admin5ScheduleRealPG.integration.test.ts`](../../packages/core/src/services/consultation/admin5ScheduleRealPG.integration.test.ts) |
| `AG1_ACCOUNT_DELETE_ORIGINAL_WORK` | [`apps/api/src/test/ag1-account-self-delete-packaged-hono-work.acceptance.ts`](../../apps/api/src/test/ag1-account-self-delete-packaged-hono-work.acceptance.ts) |
| `AG1_ACCOUNT_DELETE_PUBLIC_ONLY` | [`apps/api/src/test/ag1-account-self-delete-packaged-hono-work.acceptance.ts`](../../apps/api/src/test/ag1-account-self-delete-packaged-hono-work.acceptance.ts) |
| `AG1_ACCOUNT_SCOPE_LOCAL_TX_PROOF` | [`apps/api/src/test/ag1-account-scope-live-work-rollback.acceptance.ts`](../../apps/api/src/test/ag1-account-scope-live-work-rollback.acceptance.ts) |
| `AG1_ARTICLES_WORK_HTTP` | [`apps/api/src/test/ag1-articles-work-http.acceptance.ts`](../../apps/api/src/test/ag1-articles-work-http.acceptance.ts) |
| `AG1_ARTICLE_CUTOFF_OWN_PG18` | [`apps/api/src/modules/trainer-articles/infrastructure/own-article-cutoff.real-pg.mounted.test.ts`](../../apps/api/src/modules/trainer-articles/infrastructure/own-article-cutoff.real-pg.mounted.test.ts) |
| `AG1_AVATAR_PACKAGED_HTTP_WORK` | [`apps/api/src/test/ag1-avatar-packaged-hono-work-http.acceptance.ts`](../../apps/api/src/test/ag1-avatar-packaged-hono-work-http.acceptance.ts) |
| `AG1_AVATAR_SOURCE_WORK_PROOF` | [`apps/api/src/test/ag1-avatar-source-s3-work.acceptance.ts`](../../apps/api/src/test/ag1-avatar-source-s3-work.acceptance.ts) |
| `AG1_BEST_DISTINCT_REAL_HTTP` | [`apps/api/src/test/ag1-questions-different-best-close-delete-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-questions-different-best-close-delete-original-http-work.acceptance.ts) |
| `AG1_BEST_REWARD_REAL_HTTP` | [`apps/api/src/test/ag1-questions-best-bonus-concurrent-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-questions-best-bonus-concurrent-original-http-work.acceptance.ts) |
| `AG1_BOOKING_REALPG_HTTP` | [`apps/api/src/routes/v1/g1-booking-realpg-http.integration.test.ts`](../../apps/api/src/routes/v1/g1-booking-realpg-http.integration.test.ts) |
| `AG1_BOOKING_REALPG_RUN` | [`packages/core/src/services/consultation/g1BookingRealPG.integration.test.ts`](../../packages/core/src/services/consultation/g1BookingRealPG.integration.test.ts) |
| `AG1_BOUND_NOTIF_SUBSCRIBED_WORK` | [`apps/api/src/test/ag1-normal-bound-notification-stale-reorder-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-normal-bound-notification-stale-reorder-original-http-work.acceptance.ts), [`apps/api/src/test/ag1-normal-bound-subscribed-notification-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-normal-bound-subscribed-notification-original-http-work.acceptance.ts) |
| `AG1_BOUND_NOTIF_WORK_PG` | [`packages/core/src/services/notifications/g1-bound-step-notification.realpg.test.ts`](../../packages/core/src/services/notifications/g1-bound-step-notification.realpg.test.ts) |
| `AG1_BOUND_OUTBOX_FAULT_WORK` | [`apps/api/src/test/ag1-bound-notification-crash-intent-work.acceptance.ts`](../../apps/api/src/test/ag1-bound-notification-crash-intent-work.acceptance.ts) |
| `AG1_CHAT_WORK_HTTP` | [`apps/api/src/test/ag1-chat-read-work-http.acceptance.ts`](../../apps/api/src/test/ag1-chat-read-work-http.acceptance.ts) |
| `AG1_CONSULT_BROWSER_LEASE_SETUP` | [`apps/api/src/test/ag1-consultations-browser-lease.setup.ts`](../../apps/api/src/test/ag1-consultations-browser-lease.setup.ts) |
| `AG1_CONSULT_RETIRE_PREFLIGHT` | [`apps/api/src/test/ag1-consultations-lease-retire.preflight.ts`](../../apps/api/src/test/ag1-consultations-lease-retire.preflight.ts) |
| `AG1_CONS_BROWSER_RETIRE_AFTER_AG2_DONE` | [`apps/api/src/test/ag1-consultations-browser-lease.retire.ts`](../../apps/api/src/test/ag1-consultations-browser-lease.retire.ts) |
| `AG1_CONS_RETIRE_VERIFY` | [`apps/api/src/test/ag1-consultations-lease-retire.verify.ts`](../../apps/api/src/test/ag1-consultations-lease-retire.verify.ts) |
| `AG1_CONS_TRUE_RACE_HTTP` | [`apps/api/src/test/ag1-consultations-simultaneous-slot-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-consultations-simultaneous-slot-original-http-work.acceptance.ts) |
| `AG1_CONS_WORK_HTTP` | [`apps/api/src/test/ag1-consultations-work-http.acceptance.ts`](../../apps/api/src/test/ag1-consultations-work-http.acceptance.ts) |
| `AG1_COORDINATOR_RUNTIME_READY` | [`apps/api/src/test/ag1-account-private-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-account-private-original-http-work.acceptance.ts) |
| `AG1_COURSES_WORK_HTTP` | [`apps/api/src/test/ag1-courses-work-http.acceptance.ts`](../../apps/api/src/test/ag1-courses-work-http.acceptance.ts) |
| `AG1_COURSE_PRIVATE_CATALOG_WORK_HTTP` | [`apps/api/src/test/ag1-course-catalog-private-actor-real-work-http.acceptance.ts`](../../apps/api/src/test/ag1-course-catalog-private-actor-real-work-http.acceptance.ts) |
| `AG1_CROSS_PROFILE_ARTICLE_WORK_HTTP` | [`apps/api/src/test/ag1-profile-article-cross-work-http.acceptance.ts`](../../apps/api/src/test/ag1-profile-article-cross-work-http.acceptance.ts) |
| `AG1_DAILY_BOUND_WORK_HTTP` | [`apps/api/src/test/ag1-daily-bound-work-http.acceptance.ts`](../../apps/api/src/test/ag1-daily-bound-work-http.acceptance.ts) |
| `AG1_DAILY_BOUND_WORK_PG` | [`packages/core/src/services/dailyCourse/g1-daily-bound-work.realpg.test.ts`](../../packages/core/src/services/dailyCourse/g1-daily-bound-work.realpg.test.ts) |
| `AG1_DAILY_LIFECYCLE_PACKAGED_WORK` | [`apps/api/src/test/ag1-daily-source-real-pg-race.acceptance.ts`](../../apps/api/src/test/ag1-daily-source-real-pg-race.acceptance.ts), [`apps/api/src/test/ag1-daily-training-complete-packaged-hono-work.acceptance.ts`](../../apps/api/src/test/ag1-daily-training-complete-packaged-hono-work.acceptance.ts), [`apps/api/src/test/ag1-daily-training-simultaneous-http-work.acceptance.ts`](../../apps/api/src/test/ag1-daily-training-simultaneous-http-work.acceptance.ts) |
| `AG1_DIARY_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-diary-get-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-diary-get-real-pg.mounted.test.ts) |
| `AG1_EXAM_RESULT_OWN_PG18` | [`packages/core/src/services/exam/examService.real-pg.mounted.test.ts`](../../packages/core/src/services/exam/examService.real-pg.mounted.test.ts) |
| `AG1_FAVORITES_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-favorites-registered-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-favorites-registered-real-pg.mounted.test.ts) |
| `AG1_FEED_READY_WORK_HTTP` | [`apps/api/src/test/ag1-feed-ready-real-worker-work-http.acceptance.ts`](../../apps/api/src/test/ag1-feed-ready-real-worker-work-http.acceptance.ts) |
| `AG1_FEED_TEXT_WORK_PG` | [`packages/core/src/services/feed/g1-feed-text-work.realpg.test.ts`](../../packages/core/src/services/feed/g1-feed-text-work.realpg.test.ts) |
| `AG1_FEED_VIDEO_WORK_HTTP` | [`apps/api/src/test/ag1-feed-video-hls-real-worker-work-http.acceptance.ts`](../../apps/api/src/test/ag1-feed-video-hls-real-worker-work-http.acceptance.ts) |
| `AG1_G03_CAPTURE` | [`apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts`](../../apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts) |
| `AG1_G03_HONO_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-ag1-g03-username.producer.contract.test.ts`](../../apps/api/src/routes/v1/g1-ag1-g03-username.producer.contract.test.ts) |
| `AG1_G03_LEASE_FILE` | [`apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts`](../../apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts) |
| `AG1_G03_REALJWT_PG_REDIS` | [`apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts`](../../apps/api/src/routes/v1/g1-g03-realjwt-core-pg-redis.integration.test.ts), [`apps/api/src/test/fixtures/g03/g03-postwrite-readback.adapter.ts`](../../apps/api/src/test/fixtures/g03/g03-postwrite-readback.adapter.ts) |
| `AG1_G03_SAFE_DELTA_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-ag1-g03-username.privacy-error-delta.test.ts`](../../apps/api/src/routes/v1/g1-ag1-g03-username.privacy-error-delta.test.ts) |
| `AG1_G05_APPROVAL_FILE` | [`apps/api/src/routes/v1/g1-g05-duplicate-risk.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-duplicate-risk.realpg.test.ts), [`apps/api/src/routes/v1/g1-g05-realjwt-core-pg.integration.test.ts`](../../apps/api/src/routes/v1/g1-g05-realjwt-core-pg.integration.test.ts) |
| `AG1_G05_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-g05-pet-create.green-source.test.ts`](../../apps/api/src/routes/v1/g1-g05-pet-create.green-source.test.ts), [`apps/api/src/routes/v1/g1-g05-pet-create.source-contract.test.ts`](../../apps/api/src/routes/v1/g1-g05-pet-create.source-contract.test.ts) |
| `AG1_G05_DUPLICATE_RISK_OPTIN` | [`apps/api/src/routes/v1/g1-g05-duplicate-risk.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-duplicate-risk.realpg.test.ts) |
| `AG1_G05_IDEMPOTENCY_EXPECTED_OPTIN` | [`apps/api/src/routes/v1/g1-g05-idempotency-expected.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-idempotency-expected.realpg.test.ts), [`apps/api/src/routes/v1/g1-g05-idempotency-isolated-prisma.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-idempotency-isolated-prisma.realpg.test.ts) |
| `AG1_G05_NEW_SCOPE_FILE` | [`apps/api/src/routes/v1/g1-g05-idempotency-expected.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-idempotency-expected.realpg.test.ts), [`apps/api/src/routes/v1/g1-g05-idempotency-isolated-prisma.realpg.test.ts`](../../apps/api/src/routes/v1/g1-g05-idempotency-isolated-prisma.realpg.test.ts), [`apps/api/src/routes/v1/g1-g05-packaged-core-realpg.integration.test.ts`](../../apps/api/src/routes/v1/g1-g05-packaged-core-realpg.integration.test.ts) |
| `AG1_G05_PACKAGED_RUNTIME_OPTIN` | [`apps/api/src/routes/v1/g1-g05-packaged-core-realpg.integration.test.ts`](../../apps/api/src/routes/v1/g1-g05-packaged-core-realpg.integration.test.ts) |
| `AG1_G05_REALPG_EXPLICIT_APPROVAL` | [`apps/api/src/routes/v1/g1-g05-realjwt-core-pg.integration.test.ts`](../../apps/api/src/routes/v1/g1-g05-realjwt-core-pg.integration.test.ts) |
| `AG1_G05_WORK_HTTP` | [`apps/api/src/test/ag1-g05-pets-work-http.acceptance.ts`](../../apps/api/src/test/ag1-g05-pets-work-http.acceptance.ts) |
| `AG1_G3_TRAINER_METADATA_OWN_PG18` | [`apps/api/src/routes/v1/g1-trainer-notes-articles-two-registered.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-notes-articles-two-registered.real-pg.mounted.test.ts) |
| `AG1_GALLERY_ALBUM_WORK_PG` | [`packages/core/src/services/gallery/g1-album-metadata-work.realpg.test.ts`](../../packages/core/src/services/gallery/g1-album-metadata-work.realpg.test.ts) |
| `AG1_GALLERY_FEED_WORK_HTTP` | [`apps/api/src/test/ag1-gallery-feed-media-real-s3-work-http.acceptance.ts`](../../apps/api/src/test/ag1-gallery-feed-media-real-s3-work-http.acceptance.ts) |
| `AG1_GALLERY_REAL_READY_WORK_HTTP` | [`apps/api/src/test/ag1-gallery-ready-real-worker-work-http.acceptance.ts`](../../apps/api/src/test/ag1-gallery-ready-real-worker-work-http.acceptance.ts) |
| `AG1_HONO_61S_VIDEO_WORK_HTTP` | [`apps/api/src/test/ag1-hono-61s-hls-real-worker.acceptance.ts`](../../apps/api/src/test/ag1-hono-61s-hls-real-worker.acceptance.ts) |
| `AG1_LEARN032_WORK_HTTP` | [`apps/api/src/test/ag1-learn032-work-http.acceptance.ts`](../../apps/api/src/test/ag1-learn032-work-http.acceptance.ts) |
| `AG1_LEARN032_WORK_PG` | [`packages/core/src/services/training/g1-learn032-bound-work.realpg.test.ts`](../../packages/core/src/services/training/g1-learn032-bound-work.realpg.test.ts) |
| `AG1_LEARNER_DAILY_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-learner-daily-today-day-registered.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-learner-daily-today-day-registered.real-pg.mounted.test.ts) |
| `AG1_NORMAL_COURSE_PACKAGED_WORK` | [`apps/api/src/test/ag1-normal-bound-notification-stale-reorder-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-normal-bound-notification-stale-reorder-original-http-work.acceptance.ts), [`apps/api/src/test/ag1-normal-bound-subscribed-notification-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-normal-bound-subscribed-notification-original-http-work.acceptance.ts), [`apps/api/src/test/ag1-normal-source-real-pg-race.acceptance.ts`](../../apps/api/src/test/ag1-normal-source-real-pg-race.acceptance.ts) (ещё 2) |
| `AG1_NOTES_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-student-notes-registered-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-student-notes-registered-real-pg.mounted.test.ts) |
| `AG1_OFF021_ACK_GAP_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-off021-postcommit-ack-boundary.test.ts`](../../apps/api/src/routes/v1/g1-off021-postcommit-ack-boundary.test.ts) |
| `AG1_OFF021_E2E_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts`](../../apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts) |
| `AG1_OFF021_E2E_HTTP` | [`apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts`](../../apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts) |
| `AG1_OFF021_JOURNAL_LEASE_FILE` | [`apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts`](../../apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts), [`apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts`](../../apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts), [`packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts`](../../packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts) (ещё 2) |
| `AG1_OFF021_JOURNAL_PG_URL` | [`apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts`](../../apps/api/src/routes/v1/g1-off021-e2e-tcp.realpg.test.ts), [`apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts`](../../apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts), [`packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts`](../../packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts) (ещё 2) |
| `AG1_OFF021_PREVENTION_CAPTURE_DIR` | [`packages/core/src/services/offline/g1-off021-prevention-batch.realpg.test.ts`](../../packages/core/src/services/offline/g1-off021-prevention-batch.realpg.test.ts) |
| `AG1_OFF021_PREVENTION_PG` | [`packages/core/src/services/offline/g1-off021-prevention-batch.realpg.test.ts`](../../packages/core/src/services/offline/g1-off021-prevention-batch.realpg.test.ts) |
| `AG1_OFF021_REALJWT` | [`apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts`](../../apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts) |
| `AG1_OFF021_REALJWT_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts`](../../apps/api/src/routes/v1/g1-off021-practice-realjwt-postgres.auth.test.ts) |
| `AG1_OFF021_REALPG_CAPTURE_DIR` | [`packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts`](../../packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts) |
| `AG1_OUTBOX_FAULT_AFTER_SQL_COMMIT` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `AG1_OUTBOX_FAULT_USER_ID` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `AG1_OUTBOX_ORIGINAL_HTTP_WORK` | [`apps/api/src/test/ag1-bound-notification-restart-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-bound-notification-restart-original-http-work.acceptance.ts) |
| `AG1_PET_DOCUMENTS_WORK_HTTP` | [`apps/api/src/test/ag1-pet-documents-real-s3-work-http.acceptance.ts`](../../apps/api/src/test/ag1-pet-documents-real-s3-work-http.acceptance.ts) |
| `AG1_PET_WEIGHT_PARALLEL_HTTP` | [`apps/api/src/test/ag1-pet-weight-parallel-delete-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-pet-weight-parallel-delete-original-http-work.acceptance.ts) |
| `AG1_PET_WEIGHT_SOURCE_RACE` | [`apps/api/src/test/ag1-pet-weight-source-parallel-real-work.acceptance.ts`](../../apps/api/src/test/ag1-pet-weight-source-parallel-real-work.acceptance.ts) |
| `AG1_PRIVATE_ACCOUNT_ORIGINAL_HTTP_WORK` | [`apps/api/src/test/ag1-account-private-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-account-private-original-http-work.acceptance.ts) |
| `AG1_PRIVATE_CLEANER_OWN_TEST` | [`apps/api/src/test/ag1-account-private-cleaner-real-minio.acceptance.ts`](../../apps/api/src/test/ag1-account-private-cleaner-real-minio.acceptance.ts) |
| `AG1_PROFILE_SECURITY_HTTP` | [`apps/api/src/test/ag1-profile-security-role-massassignment-original-http-work.acceptance.ts`](../../apps/api/src/test/ag1-profile-security-role-massassignment-original-http-work.acceptance.ts) |
| `AG1_PROFILE_WORK_HTTP` | [`apps/api/src/test/ag1-profile-work-http.acceptance.ts`](../../apps/api/src/test/ag1-profile-work-http.acceptance.ts) |
| `AG1_PUSH_REALPG_RUN` | [`packages/core/src/services/subscriptions/g1PushRealPG.integration.test.ts`](../../packages/core/src/services/subscriptions/g1PushRealPG.integration.test.ts) |
| `AG1_QUESTIONS_ISOLATED_S3_PHYSICAL` | [`scripts/refactor/ag1-questions-real-s3-physical-proof.ts`](../../scripts/refactor/ag1-questions-real-s3-physical-proof.ts) |
| `AG1_QUESTIONS_PHOTO_REAL_HONO` | [`apps/api/src/test/ag1-questions-photo-real-hono-s3.acceptance.ts`](../../apps/api/src/test/ag1-questions-photo-real-hono-s3.acceptance.ts) |
| `AG1_QUESTIONS_WORK_HTTP` | [`apps/api/src/test/ag1-questions-work-http.acceptance.ts`](../../apps/api/src/test/ag1-questions-work-http.acceptance.ts) |
| `AG1_Q_DELETED_PARENT_RETENTION_WORK` | [`apps/api/src/test/ag1-question-deleted-parent-answer-retention-work-http.acceptance.ts`](../../apps/api/src/test/ag1-question-deleted-parent-answer-retention-work-http.acceptance.ts) |
| `AG1_RECOVER_DOCS_OWN_FIXTURE` | [`apps/api/src/test/ag1-pet-docs-orphan-recovery.ts`](../../apps/api/src/test/ag1-pet-docs-orphan-recovery.ts) |
| `AG1_REMINDERS_WORK_ACCEPT` | [`apps/api/src/test/ag1-reminders-work-http.acceptance.ts`](../../apps/api/src/test/ag1-reminders-work-http.acceptance.ts) |
| `AG1_SCOPED_OWN_FEED_DELETE_WORK` | [`apps/api/src/test/ag1-scoped-feed-retired-delete-real-work.acceptance.ts`](../../apps/api/src/test/ag1-scoped-feed-retired-delete-real-work.acceptance.ts) |
| `AG1_SCOPED_OWN_GALLERY_DELETE_WORK` | [`apps/api/src/test/ag1-scoped-gallery-retired-delete-real-work.acceptance.ts`](../../apps/api/src/test/ag1-scoped-gallery-retired-delete-real-work.acceptance.ts) |
| `AG1_SURVEY_COMPARISON_PG18` | [`packages/core/src/services/survey/surveyService.comparison.real-pg.mounted.test.ts`](../../packages/core/src/services/survey/surveyService.comparison.real-pg.mounted.test.ts) |
| `AG1_SURVEY_CONCURRENT_OWN_PG18` | [`packages/core/src/services/survey/surveyService.concurrent.real-pg.mounted.test.ts`](../../packages/core/src/services/survey/surveyService.concurrent.real-pg.mounted.test.ts) |
| `AG1_SURVEY_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-surveys-read-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-surveys-read-real-pg.mounted.test.ts) |
| `AG1_SURVEY_SAME_STEP_OWN_PG18` | [`packages/core/src/services/survey/surveyService.same-step.real-pg.mounted.test.ts`](../../packages/core/src/services/survey/surveyService.same-step.real-pg.mounted.test.ts) |
| `AG1_TEMPLATES_OWN_PG18` | [`packages/core/src/services/trainerStep/trainerStepService.public-templates.real-pg.mounted.test.ts`](../../packages/core/src/services/trainerStep/trainerStepService.public-templates.real-pg.mounted.test.ts) |
| `AG1_TR014_FOUR_OWN_PG18` | [`packages/core/src/services/dailyCourse/dailyCourseService.trainer-four-reads.real-pg.mounted.test.ts`](../../packages/core/src/services/dailyCourse/dailyCourseService.trainer-four-reads.real-pg.mounted.test.ts) |
| `AG1_TR014_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-tr014-four-registered-read.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-tr014-four-registered-read.real-pg.mounted.test.ts) |
| `AG1_TRAINER_CAS_WORK_HTTP` | [`apps/api/src/test/ag1-trainer-course-name-cas-real-work-http.acceptance.ts`](../../apps/api/src/test/ag1-trainer-course-name-cas-real-work-http.acceptance.ts) |
| `AG1_TRAINER_EXAM_HONO_OWN_PG18` | [`apps/api/src/routes/v1/g1-trainer-exam-two-registered.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-exam-two-registered.real-pg.mounted.test.ts) |
| `AG1_TRAINER_EXAM_OWN_PG18` | [`packages/core/src/services/exam/examService.trainer-metadata.real-pg.mounted.test.ts`](../../packages/core/src/services/exam/examService.trainer-metadata.real-pg.mounted.test.ts) |
| `AG1_TRAINER_JOINT_OWN_PG18` | [`apps/api/src/routes/v1/g1-trainer-three-reads.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-three-reads.real-pg.mounted.test.ts) |
| `AG1_TRAINER_NOTES_SUMMARY_PG18` | [`apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.real-pg.mounted.test.ts`](../../apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.real-pg.mounted.test.ts) |
| `AG1_TRAINER_NOTES_TIE_REAL_PG18` | [`apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.tie-real-pg.mounted.test.ts`](../../apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.tie-real-pg.mounted.test.ts) |
| `AG1_TRAINING_FORWARD_OWN_PG18` | [`apps/api/src/routes/v1/g1-training-current-two-reads.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-training-current-two-reads.real-pg.mounted.test.ts) |
| `AG1_VISIBLE_DAYS_OWN_PG18` | [`packages/core/src/services/trainingDay/trainingDayService.visible-days.real-pg.mounted.test.ts`](../../packages/core/src/services/trainingDay/trainingDayService.visible-days.real-pg.mounted.test.ts) |
| `AG1_VISIBLE_STEPS_OWN_PG18` | [`packages/core/src/services/trainerStep/trainerStepService.visible-steps.real-pg.mounted.test.ts`](../../packages/core/src/services/trainerStep/trainerStepService.visible-steps.real-pg.mounted.test.ts) |
| `AG2_ACHIEVEMENTS_COOKIE_A` | [`apps/web-vite/scripts/achievements-read-batch-runner.mjs`](../../apps/web-vite/scripts/achievements-read-batch-runner.mjs) |
| `AG2_ACHIEVEMENTS_COOKIE_B` | [`apps/web-vite/scripts/achievements-read-batch-runner.mjs`](../../apps/web-vite/scripts/achievements-read-batch-runner.mjs) |
| `AG2_ACHIEVEMENTS_REAL_GET` | [`apps/web-vite/scripts/achievements-read-batch-runner.mjs`](../../apps/web-vite/scripts/achievements-read-batch-runner.mjs) |
| `AG2_BROWSER_IDLE_CONFIRMED` | [`apps/api/src/test/ag1-avatar-packaged-hono-work-http.acceptance.ts`](../../apps/api/src/test/ag1-avatar-packaged-hono-work-http.acceptance.ts) |
| `AG2_FEED_COOKIE_B` | [`apps/web-vite/scripts/feed-author-read-runner.mjs`](../../apps/web-vite/scripts/feed-author-read-runner.mjs) |
| `AG2_FEED_REAL_GET` | [`apps/web-vite/scripts/feed-author-read-runner.mjs`](../../apps/web-vite/scripts/feed-author-read-runner.mjs) |
| `AG2_PROFILE_COOKIE_A` | [`apps/web-vite/scripts/profile-hono-runner.mjs`](../../apps/web-vite/scripts/profile-hono-runner.mjs) |
| `AG2_PROFILE_COOKIE_B` | [`apps/web-vite/scripts/profile-hono-runner.mjs`](../../apps/web-vite/scripts/profile-hono-runner.mjs) |
| `AG2_PROFILE_REAL_HTTP` | [`apps/web-vite/scripts/profile-hono-runner.mjs`](../../apps/web-vite/scripts/profile-hono-runner.mjs) |
| `AG2_WALLET_COOKIE_A` | [`apps/web-vite/scripts/wallet-read-batch-runner.mjs`](../../apps/web-vite/scripts/wallet-read-batch-runner.mjs) |
| `AG2_WALLET_COOKIE_B` | [`apps/web-vite/scripts/wallet-read-batch-runner.mjs`](../../apps/web-vite/scripts/wallet-read-batch-runner.mjs) |
| `AG2_WALLET_REAL_GET` | [`apps/web-vite/scripts/wallet-read-batch-runner.mjs`](../../apps/web-vite/scripts/wallet-read-batch-runner.mjs) |
| `AG_WEB3_TIMER_ISOLATED_PG` | [`packages/core/src/services/training/web3-timer-isolated.realpg.test.ts`](../../packages/core/src/services/training/web3-timer-isolated.realpg.test.ts) |
| `API_HOST` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts`](../../apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts) (ещё 7) |
| `API_PORT` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts), [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts) (ещё 11) |
| `API_URL` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `APPLE_APP_ID` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_BUNDLE_ID` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_ISSUER_ID` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_KEY_ID` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_PRIVATE_KEY` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_PRIVATE_KEY_PATH` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APPLE_USE_SANDBOX` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `APP_ENV` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js), [`apps/mobile/plugins/withAppTracerNative.js`](../../apps/mobile/plugins/withAppTracerNative.js) |
| `APP_SUBSCRIPTION_CARD_FINGERPRINT_SECRET` | [`packages/core/src/services/appSubscription/paymentService.ts`](../../packages/core/src/services/appSubscription/paymentService.ts) |
| `BEGET_CDN_API_TOKEN` | [`infra/cloudru/beget-release-readiness.mjs`](../../infra/cloudru/beget-release-readiness.mjs), [`packages/cdn-upload/src/begetCdnPurge.test.ts`](../../packages/cdn-upload/src/begetCdnPurge.test.ts) |
| `BEGET_CDN_CACHE_KEY_VERIFIED` | [`packages/cdn-upload/src/begetCdnPurge.test.ts`](../../packages/cdn-upload/src/begetCdnPurge.test.ts) |
| `BEGET_CDN_PURGE_API_VERIFIED` | [`packages/cdn-upload/src/begetCdnPurge.test.ts`](../../packages/cdn-upload/src/begetCdnPurge.test.ts) |
| `CDN_CLEANUP_SERVICE_ACCOUNT_KEY` | [`packages/cdn-upload/src/accountStorageCleanup.ts`](../../packages/cdn-upload/src/accountStorageCleanup.ts) |
| `CHAT2_API_ENABLED` | [`apps/api/src/app.ts`](../../apps/api/src/app.ts), [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts) (ещё 1) |
| `CHAT2_CENTRIFUGO_API_KEY` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts), [`apps/api/src/modules/chat2/revocation.ts`](../../apps/api/src/modules/chat2/revocation.ts), [`packages/worker/src/chat2-outbox-worker.ts`](../../packages/worker/src/chat2-outbox-worker.ts) |
| `CHAT2_CENTRIFUGO_HTTP_API` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts), [`apps/api/src/modules/chat2/revocation.ts`](../../apps/api/src/modules/chat2/revocation.ts), [`packages/worker/src/chat2-outbox-worker.ts`](../../packages/worker/src/chat2-outbox-worker.ts) |
| `CHAT2_CENTRIFUGO_TOKEN_SECRET` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts), [`apps/api/src/modules/chat2/realtime.ts`](../../apps/api/src/modules/chat2/realtime.ts) |
| `CHAT2_DB_ACCEPTANCE_ONLY` | [`apps/api/scripts/chat2-v2-isolated-db-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-db-acceptance.ts), [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts) |
| `CHAT2_IMPORT_ISOLATED` | [`apps/api/src/modules/chat2/archive.ts`](../../apps/api/src/modules/chat2/archive.ts) |
| `CHAT2_INTERNAL_HMAC_SECRET` | [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts), [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) |
| `CHAT2_JOB_VCPU` | [`apps/feed-cloud/src/chat2-v2-processor.ts`](../../apps/feed-cloud/src/chat2-v2-processor.ts) |
| `CHAT2_NONPROD_CORE_BASE_URL` | [`infra/cloudru/chat2-job-provision.mjs`](../../infra/cloudru/chat2-job-provision.mjs) |
| `CHAT2_NONPROD_CORE_VERIFIED` | [`infra/cloudru/chat2-job-provision.mjs`](../../infra/cloudru/chat2-job-provision.mjs) |
| `CHAT2_PHOTO_JOB_IMAGE` | [`infra/cloudru/chat2-job-provision.mjs`](../../infra/cloudru/chat2-job-provision.mjs) |
| `CHAT2_PRIVATE_MEDIA_ENABLED` | [`apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts), [`apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts), [`packages/cdn-upload/src/chat2Media.ts`](../../packages/cdn-upload/src/chat2Media.ts) |
| `CHAT2_PROCESSOR_READY` | [`apps/api/src/modules/chat2/media-v2-upload.ts`](../../apps/api/src/modules/chat2/media-v2-upload.ts), [`packages/worker/src/chat2-media-processing-trigger-worker.ts`](../../packages/worker/src/chat2-media-processing-trigger-worker.ts), [`packages/worker/src/chat2-media-recovery.ts`](../../packages/worker/src/chat2-media-recovery.ts) (ещё 1) |
| `CHAT2_PUBLIC_WS_URL` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts), [`apps/api/src/modules/chat2/realtime.ts`](../../apps/api/src/modules/chat2/realtime.ts) |
| `CHAT2_S3_ACCESS_KEY_ID` | [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs), [`infra/cloudru/chat2-presigned-post-smoke.mjs`](../../infra/cloudru/chat2-presigned-post-smoke.mjs) |
| `CHAT2_S3_BUCKET` | [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs), [`infra/cloudru/chat2-presigned-post-smoke.mjs`](../../infra/cloudru/chat2-presigned-post-smoke.mjs) |
| `CHAT2_S3_ENDPOINT` | [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs), [`infra/cloudru/chat2-presigned-post-smoke.mjs`](../../infra/cloudru/chat2-presigned-post-smoke.mjs) |
| `CHAT2_S3_REAL_ACCEPTANCE` | [`apps/feed-cloud/src/chat2-s3-acceptance.ts`](../../apps/feed-cloud/src/chat2-s3-acceptance.ts) |
| `CHAT2_S3_SECRET_ACCESS_KEY` | [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs), [`infra/cloudru/chat2-presigned-post-smoke.mjs`](../../infra/cloudru/chat2-presigned-post-smoke.mjs) |
| `CHAT2_V2_CORE_ENABLED` | [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts), [`apps/api/src/modules/chat2/media-v2-upload.ts`](../../apps/api/src/modules/chat2/media-v2-upload.ts), [`apps/api/src/routes/internal/chat2-media-jobs.ts`](../../apps/api/src/routes/internal/chat2-media-jobs.ts) (ещё 3) |
| `CHAT2_V2_MEDIA_ENABLED` | [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts), [`apps/api/src/modules/chat2/media-v2-upload.ts`](../../apps/api/src/modules/chat2/media-v2-upload.ts), [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs) (ещё 4) |
| `CHAT2_VIDEO_JOB_IMAGE` | [`infra/cloudru/chat2-job-provision.mjs`](../../infra/cloudru/chat2-job-provision.mjs) |
| `CHAT2_VIDEO_TRANSCODE_MODE` | [`apps/feed-cloud/src/chat2-v2-processor.ts`](../../apps/feed-cloud/src/chat2-v2-processor.ts) |
| `CHAT2_WORKER_ENABLED` | [`packages/worker/src/chat2-manual-worker.ts`](../../packages/worker/src/chat2-manual-worker.ts), [`packages/worker/src/chat2-outbox-worker.ts`](../../packages/worker/src/chat2-outbox-worker.ts) |
| `CI` | [`.github/skills/impeccable/scripts/detector/engines/browser/detect-url.mjs`](../../.github/skills/impeccable/scripts/detector/engines/browser/detect-url.mjs), [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `CLOUDRU_BROWSER_TEST_ORIGIN` | [`infra/cloudru/signed-browser-smoke.mjs`](../../infra/cloudru/signed-browser-smoke.mjs) |
| `CLOUDRU_CDN_ACCOUNT_NAME` | [`packages/cdn-upload/src/cloudruCdnPurge.ts`](../../packages/cdn-upload/src/cloudruCdnPurge.ts), [`packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts`](../../packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts) |
| `CLOUDRU_CDN_API_TOKEN` | [`packages/cdn-upload/src/cloudruCdnPurge.ts`](../../packages/cdn-upload/src/cloudruCdnPurge.ts), [`packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts`](../../packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts) |
| `CLOUDRU_CDN_CACHE_KEY_VERIFIED` | [`packages/cdn-upload/src/cloudruCdnPurge.ts`](../../packages/cdn-upload/src/cloudruCdnPurge.ts), [`packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts`](../../packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts) |
| `CLOUDRU_CDN_PURGE_API_VERIFIED` | [`packages/cdn-upload/src/cloudruCdnPurge.ts`](../../packages/cdn-upload/src/cloudruCdnPurge.ts), [`packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts`](../../packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts) |
| `CLOUDRU_CORS_CONFIRM` | [`infra/cloudru/s3-cors.mjs`](../../infra/cloudru/s3-cors.mjs) |
| `CLOUDRU_DOCUMENTS_BUCKET_VERSIONING` | [`packages/core/src/services/accountCleanup/privateUserMedia.operations.test.ts`](../../packages/core/src/services/accountCleanup/privateUserMedia.operations.test.ts) |
| `CLOUDRU_MEDIA_JOBS_ENABLED` | [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts), [`packages/gallery-server/src/index.ts`](../../packages/gallery-server/src/index.ts), [`packages/worker/src/chat2-media-processing-trigger-worker.ts`](../../packages/worker/src/chat2-media-processing-trigger-worker.ts) (ещё 7) |
| `CLOUDRU_PRIVACY_GUARD_CONFIRM` | [`infra/cloudru/private-bucket-guard.mjs`](../../infra/cloudru/private-bucket-guard.mjs) |
| `CLOUDRU_QUESTIONS_BUCKET_VERSIONING` | [`packages/core/src/services/accountCleanup/privateUserMedia.operations.test.ts`](../../packages/core/src/services/accountCleanup/privateUserMedia.operations.test.ts) |
| `CLOUDRU_S3_ACCESS_KEY_ID` | [`infra/cloudru/cleanup-stage-fixtures.mjs`](../../infra/cloudru/cleanup-stage-fixtures.mjs), [`infra/cloudru/private-bucket-guard.mjs`](../../infra/cloudru/private-bucket-guard.mjs), [`infra/cloudru/s3-cors.mjs`](../../infra/cloudru/s3-cors.mjs) |
| `CLOUDRU_S3_ENDPOINT` | [`infra/cloudru/local-oci-origin-acceptance.mjs`](../../infra/cloudru/local-oci-origin-acceptance.mjs), [`infra/cloudru/private-bucket-guard.mjs`](../../infra/cloudru/private-bucket-guard.mjs), [`infra/cloudru/s3-cors.mjs`](../../infra/cloudru/s3-cors.mjs) (ещё 1) |
| `CLOUDRU_S3_SECRET_ACCESS_KEY` | [`infra/cloudru/cleanup-stage-fixtures.mjs`](../../infra/cloudru/cleanup-stage-fixtures.mjs), [`infra/cloudru/private-bucket-guard.mjs`](../../infra/cloudru/private-bucket-guard.mjs), [`infra/cloudru/s3-cors.mjs`](../../infra/cloudru/s3-cors.mjs) |
| `COMMUNITY_CHAT_ENABLED` | [`packages/core/src/services/cynologistChat/community.test.ts`](../../packages/core/src/services/cynologistChat/community.test.ts), [`packages/core/src/services/cynologistChat/community.ts`](../../packages/core/src/services/cynologistChat/community.ts), [`scripts/check-community-chat-live.mjs`](../../scripts/check-community-chat-live.mjs) |
| `COMSPEC` | [`.github/skills/impeccable/scripts/lib/open-system-browser.mjs`](../../.github/skills/impeccable/scripts/lib/open-system-browser.mjs) |
| `CONSENT_CLEANUP_DAYS` | [`packages/core/src/services/consent/consentService.ts`](../../packages/core/src/services/consent/consentService.ts), [`packages/core/src/services/consent/deleteOldFailedConsentLogs.test.ts`](../../packages/core/src/services/consent/deleteOldFailedConsentLogs.test.ts) |
| `CONSENT_VERSION` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts), [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts) |
| `CONSULTATION_LIMIT_TEST_DB` | [`packages/core/src/services/consultation/bookingLimits.integration.test.ts`](../../packages/core/src/services/consultation/bookingLimits.integration.test.ts) |
| `COURSE_CACHE_METRICS_TOKEN` | [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts), [`packages/core/src/services/training/trainingContentMetrics.test.ts`](../../packages/core/src/services/training/trainingContentMetrics.test.ts), [`packages/core/src/services/training/trainingContentMetrics.ts`](../../packages/core/src/services/training/trainingContentMetrics.ts) |
| `COURSE_CACHE_SYNC_ENABLED` | [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts), [`packages/core/src/services/training/trainingContentMetrics.test.ts`](../../packages/core/src/services/training/trainingContentMetrics.test.ts), [`packages/core/src/services/training/trainingContentMetrics.ts`](../../packages/core/src/services/training/trainingContentMetrics.ts) (ещё 3) |
| `CURSOR_PROJECT_DIR` | [`.github/skills/impeccable/scripts/hook-lib.mjs`](../../.github/skills/impeccable/scripts/hook-lib.mjs) |
| `CYNOLOGIST_CHAT_ENABLED` | [`apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts`](../../apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts), [`packages/core/src/services/cynologistChat/stream.ts`](../../packages/core/src/services/cynologistChat/stream.ts), [`scripts/check-cynologist-chat-live.mjs`](../../scripts/check-cynologist-chat-live.mjs) |
| `CYNOLOGIST_CHAT_TRAINER_USER_ID` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts), [`apps/api/src/modules/chat2/service.test.ts`](../../apps/api/src/modules/chat2/service.test.ts), [`apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts`](../../apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts) (ещё 4) |
| `DATABASE_URL` | [`apps/api/scripts/chat2-v2-isolated-db-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-db-acceptance.ts), [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts), [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts) (ещё 194) |
| `DISABLE_CONSOLE_LOGGING` | [`packages/logger/src/LoggerFactory.ts`](../../packages/logger/src/LoggerFactory.ts), [`packages/logger/test-logging-control.js`](../../packages/logger/test-logging-control.js) |
| `DISABLE_ERROR_DASHBOARD_LOGGING` | [`packages/logger/test-logging-control.js`](../../packages/logger/test-logging-control.js) |
| `DISABLE_LOGGING` | [`packages/logger/src/LoggerFactory.ts`](../../packages/logger/src/LoggerFactory.ts), [`packages/logger/test-logging-control.js`](../../packages/logger/test-logging-control.js) |
| `DISPLAY` | [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `DO_NOT_TRACK` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `ENABLE_COURSE_CACHE` | [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts), [`apps/api/src/routes/v1/g1-ag1-001-training-day-read.actual-core.mounted.test.ts`](../../apps/api/src/routes/v1/g1-ag1-001-training-day-read.actual-core.mounted.test.ts), [`apps/api/src/routes/v1/g1-training-online-read.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-training-online-read.real-pg.mounted.test.ts) (ещё 7) |
| `ERROR_DASHBOARD_URL` | [`packages/logger/test-logging-control.js`](../../packages/logger/test-logging-control.js) |
| `EXPO_ACCESS_TOKEN` | [`packages/webpush/src/expoPush.ts`](../../packages/webpush/src/expoPush.ts) |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | [`apps/mobile/app/(main)/profile/delete-account.tsx`](../../apps/mobile/app/%28main%29/profile/delete-account.tsx) |
| `EXPO_PUBLIC_API_BASE_URL` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js), [`apps/mobile/src/shared/config/index.ts`](../../apps/mobile/src/shared/config/index.ts) |
| `EXPO_PUBLIC_APP_VERSION` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_CHAT2_API_ORIGIN` | [`apps/mobile/src/features/chat2/api.ts`](../../apps/mobile/src/features/chat2/api.ts) |
| `EXPO_PUBLIC_CHAT2_MEDIA_V2` | [`apps/mobile/src/features/chat2/api.ts`](../../apps/mobile/src/features/chat2/api.ts) |
| `EXPO_PUBLIC_ENABLE_TRACER` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js), [`packages/analytics/src/client.ts`](../../packages/analytics/src/client.ts) |
| `EXPO_PUBLIC_REWARDED_ADS_ANDROID_PLACEMENT_ID` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_REWARDED_ADS_IOS_PLACEMENT_ID` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_REWARDED_ADS_TEST_MODE` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_TRACER_APP_TOKEN` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_IOS` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_TRACER_APP_TOKEN_JS` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_YM_MOBILE_API_KEY` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `EXPO_PUBLIC_YM_MOBILE_ENABLED` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `FEED_BEGET_CDN_SERVICE_ID` | [`packages/cdn-upload/src/begetCdnPurge.test.ts`](../../packages/cdn-upload/src/begetCdnPurge.test.ts) |
| `FEED_BUCKET` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts), [`apps/feed-cloud/src/dispatch.ts`](../../apps/feed-cloud/src/dispatch.ts), [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts) (ещё 1) |
| `FEED_CDN_BASE_URL` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts) |
| `FEED_CDN_EDGE_CACHE_HIT_VERIFIED` | [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_CDN_EDGE_TOKEN_VERIFIED` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts), [`apps/feed-cloud/src/origin-service.ts`](../../apps/feed-cloud/src/origin-service.ts), [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_CDN_SECRET` | [`apps/feed-cloud/src/origin-service.ts`](../../apps/feed-cloud/src/origin-service.ts), [`infra/cloudru/beget-release-readiness.mjs`](../../infra/cloudru/beget-release-readiness.mjs) |
| `FEED_DUAL_PROVIDER_CLEANUP` | [`packages/core/src/services/accountCleanup/enqueue.ts`](../../packages/core/src/services/accountCleanup/enqueue.ts) |
| `FEED_ENABLED` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts) (ещё 3) |
| `FEED_INTERNAL_BASE_URL` | [`apps/feed-cloud/src/server.ts`](../../apps/feed-cloud/src/server.ts) |
| `FEED_INTERNAL_HMAC_SECRET` | [`apps/feed-cloud/src/server.ts`](../../apps/feed-cloud/src/server.ts), [`packages/feed-server/src/internal.ts`](../../packages/feed-server/src/internal.ts) |
| `FEED_MAINTENANCE_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `FEED_MEDIA_FALLBACK_ENABLED` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts), [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts) |
| `FEED_ORIGIN_HEADER` | [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_ORIGIN_SECRET` | [`apps/feed-cloud/src/origin-service.ts`](../../apps/feed-cloud/src/origin-service.ts), [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts), [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_POLL_TEST_DATABASE_URL` | [`packages/core/src/services/feed/polls.integration.test.ts`](../../packages/core/src/services/feed/polls.integration.test.ts) |
| `FEED_PROCESSOR_READY` | [`apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts), [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts), [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts) (ещё 3) |
| `FEED_PUSH_ENABLED` | [`packages/worker/src/feed-worker.ts`](../../packages/worker/src/feed-worker.ts) |
| `FEED_QUEUE_ACCESS_KEY_ID` | [`apps/feed-cloud/src/dispatch.ts`](../../apps/feed-cloud/src/dispatch.ts) |
| `FEED_QUEUE_SECRET_ACCESS_KEY` | [`apps/feed-cloud/src/dispatch.ts`](../../apps/feed-cloud/src/dispatch.ts) |
| `FEED_RUN_ONCE` | [`apps/feed-cloud/src/server.ts`](../../apps/feed-cloud/src/server.ts) |
| `FEED_S3_ACCESS_KEY_ID` | [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_S3_ENDPOINT` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts), [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts), [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_S3_SECRET_ACCESS_KEY` | [`apps/feed-cloud/src/origin.ts`](../../apps/feed-cloud/src/origin.ts) |
| `FEED_SMART_AB_ENABLED` | [`packages/core/src/services/feed/smart-experiment.ts`](../../packages/core/src/services/feed/smart-experiment.ts) |
| `FEED_SMART_AB_PERCENT` | [`packages/core/src/services/feed/smart-experiment.ts`](../../packages/core/src/services/feed/smart-experiment.ts) |
| `FEED_SMART_AB_REPORT_CONFIRM` | [`packages/worker/src/smart-experiment-report.ts`](../../packages/worker/src/smart-experiment-report.ts) |
| `FEED_SMART_AB_REPORT_DATABASE_URL` | [`packages/worker/src/smart-experiment-report.ts`](../../packages/worker/src/smart-experiment-report.ts) |
| `FEED_SMART_AB_TREATMENT_PERCENT` | [`packages/core/src/services/feed/smart-experiment.ts`](../../packages/core/src/services/feed/smart-experiment.ts) |
| `FEED_SMART_AFFINITY_ENABLED` | [`packages/core/src/services/feed/smart-data.ts`](../../packages/core/src/services/feed/smart-data.ts), [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `FEED_SMART_DIAGNOSTICS` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts) |
| `FEED_SMART_ENABLED` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts), [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts) |
| `FEED_SMART_EVENTS_ENABLED` | [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts) |
| `FEED_SMART_EXPOSURE_TOKENS_REQUIRED` | [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts) |
| `FEED_SMART_ML_ENABLED` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts) |
| `FEED_SMART_ML_PROMOTE_CONFIRM` | [`packages/worker/src/smart-ml-promote.ts`](../../packages/worker/src/smart-ml-promote.ts) |
| `FEED_SMART_ML_TRAIN_CONFIRM` | [`packages/worker/src/smart-ml-train.ts`](../../packages/worker/src/smart-ml-train.ts) |
| `FEED_SMART_ML_TRAIN_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `FEED_SMART_MONITOR_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `FEED_SMART_MULTI_SOURCE_ENABLED` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts) |
| `FEED_SMART_REDIS_TEST_CONFIRM` | [`packages/worker/src/smart-feed-redis-smoke.ts`](../../packages/worker/src/smart-feed-redis-smoke.ts) |
| `FEED_SMART_SHADOW_ENABLED` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts) |
| `FEED_SMART_SHADOW_PERCENT` | [`packages/core/src/services/feed/service.ts`](../../packages/core/src/services/feed/service.ts) |
| `FEED_SMART_SQL_BENCHMARK` | [`packages/worker/src/smart-feed-sql-smoke.ts`](../../packages/worker/src/smart-feed-sql-smoke.ts) |
| `FEED_SMART_STATS_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `FEED_SMART_TEST_CONFIRM` | [`packages/worker/src/smart-feed-sql-smoke.ts`](../../packages/worker/src/smart-feed-sql-smoke.ts) |
| `FEED_SMART_TEST_DATABASE_URL` | [`packages/worker/src/smart-feed-sql-smoke.ts`](../../packages/worker/src/smart-feed-sql-smoke.ts) |
| `FEED_SMART_TEST_REDIS_URL` | [`packages/worker/src/smart-feed-redis-smoke.ts`](../../packages/worker/src/smart-feed-redis-smoke.ts) |
| `FEED_STAGING_GALLERY_SECRET` | [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts) |
| `FEED_TEST_DATABASE_URL` | [`packages/core/src/services/feed/feed.integration.test.ts`](../../packages/core/src/services/feed/feed.integration.test.ts), [`packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts), [`packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts) |
| `FEED_WORKER_TYPE` | [`apps/feed-cloud/src/server.ts`](../../apps/feed-cloud/src/server.ts) |
| `FFPROBE_PATH` | [`packages/core/src/services/cynologistChat/upload.ts`](../../packages/core/src/services/cynologistChat/upload.ts) |
| `G05_AG2_WEB_REAL_EXPLICIT` | [`apps/web-vite/scripts/g05-web-runner.mjs`](../../apps/web-vite/scripts/g05-web-runner.mjs) |
| `G05_AG3_REAL_ENDPOINT_TEST` | [`apps/mobile/src/features/pets/g05SyntheticCreateAdapter.realpg.g05.test.ts`](../../apps/mobile/src/features/pets/g05SyntheticCreateAdapter.realpg.g05.test.ts) |
| `G15_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-g15-chat.keep.http.test.ts`](../../apps/api/src/routes/v1/g1-g15-chat.keep.http.test.ts), [`apps/api/src/routes/v1/g1-g15-chat.multipart.http.test.ts`](../../apps/api/src/routes/v1/g1-g15-chat.multipart.http.test.ts) |
| `G1_AG1_ACHIEVEMENTS_PG18` | [`packages/core/src/services/achievements/achievements.real-pg.mounted.test.ts`](../../packages/core/src/services/achievements/achievements.real-pg.mounted.test.ts) |
| `G1_AG1_ARTICLES_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-articles-own.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-articles-own.real-pg.mounted.test.ts) |
| `G1_AG1_CALENDAR_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-calendar-read.real-prisma-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-calendar-read.real-prisma-pg.mounted.test.ts) |
| `G1_AG1_COURSE_REVIEW_PG18` | [`packages/core/src/services/course/reviewService.real-pg.mounted.test.ts`](../../packages/core/src/services/course/reviewService.real-pg.mounted.test.ts) |
| `G1_AG1_DAILY_OWN_PG18` | [`packages/core/src/services/dailyCourse/dailyCourseService.real-pg.mounted.test.ts`](../../packages/core/src/services/dailyCourse/dailyCourseService.real-pg.mounted.test.ts) |
| `G1_AG1_DIARY_OWN_PG18` | [`packages/core/src/services/diary/diaryService.real-pg.mounted.test.ts`](../../packages/core/src/services/diary/diaryService.real-pg.mounted.test.ts) |
| `G1_AG1_FAVORITE_OWN_PG18` | [`packages/core/src/services/course/favoriteService.real-pg.mounted.test.ts`](../../packages/core/src/services/course/favoriteService.real-pg.mounted.test.ts) |
| `G1_AG1_FEED_HTTP_ADMIN_URL` | [`apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts) |
| `G1_AG1_GAFUS_ADMIN_URL` | [`apps/api/src/routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts) |
| `G1_AG1_NOTES_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-notes-summary.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-notes-summary.real-pg.mounted.test.ts) |
| `G1_AG1_NOTES_OWN_PG18` | [`packages/core/src/services/notes/notesService.real-pg.mounted.test.ts`](../../packages/core/src/services/notes/notesService.real-pg.mounted.test.ts) |
| `G1_AG1_NOTICE_ADMIN_URL` | [`packages/core/src/services/feed/g1-notification-recipient.real-pg.test.ts`](../../packages/core/src/services/feed/g1-notification-recipient.real-pg.test.ts) |
| `G1_AG1_OWN_PG` | [`apps/api/src/routes/v1/g1-course-editor-snapshot.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-course-editor-snapshot.real-pg.mounted.test.ts), [`apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-feed-notifications-real-pg.mounted.test.ts), [`apps/api/src/routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-gafus-admin-dashboard.real-prisma-pg.mounted.test.ts) (ещё 14) |
| `G1_AG1_PERSONALIZATION_PG18` | [`packages/core/src/services/course/personalizationService.real-pg.mounted.test.ts`](../../packages/core/src/services/course/personalizationService.real-pg.mounted.test.ts) |
| `G1_AG1_POLL_OWN_PG18` | [`packages/core/src/services/feed/polls.real-pg.mounted.test.ts`](../../packages/core/src/services/feed/polls.real-pg.mounted.test.ts) |
| `G1_AG1_PUBLIC_CATALOG_OWN_PG18` | [`apps/api/src/routes/v1/public-courses.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/public-courses.real-pg.mounted.test.ts) |
| `G1_AG1_STATS_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-statistics-courses.real-prisma-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-statistics-courses.real-prisma-pg.mounted.test.ts) |
| `G1_AG1_STATS_STEPS_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-statistics-steps.real-prisma-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-statistics-steps.real-prisma-pg.mounted.test.ts) |
| `G1_AG1_SURVEY_TX_PG18` | [`packages/core/src/services/survey/surveyService.real-pg.mounted.test.ts`](../../packages/core/src/services/survey/surveyService.real-pg.mounted.test.ts) |
| `G1_AG1_TRAINING_ADMIN_URL` | [`apps/api/src/routes/v1/g1-training-online-read.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-training-online-read.real-pg.mounted.test.ts) |
| `G1_AG1_VIDEO_META_ADMIN_URL` | [`apps/api/src/routes/v1/g1-trainer-videos-metadata.real-pg.mounted.test.ts`](../../apps/api/src/routes/v1/g1-trainer-videos-metadata.real-pg.mounted.test.ts) |
| `G1_AG1_WEB040_ADMIN_URL` | [`packages/core/src/services/questions/g1-web040-author-read.real-pg.test.ts`](../../packages/core/src/services/questions/g1-web040-author-read.real-pg.test.ts) |
| `G1_AG2_FOURPOST_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-ag2-w1-fourpost.auth-cookie-origin.contract.test.ts`](../../apps/api/src/routes/v1/g1-ag2-w1-fourpost.auth-cookie-origin.contract.test.ts) |
| `G1_AG3_WIRE_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-ag3-offline-progress-prevention.contract.test.ts`](../../apps/api/src/routes/v1/g1-ag3-offline-progress-prevention.contract.test.ts) |
| `G1_AG4_ACTIVE_LEASE_ID` | [`packages/core/src/services/consultation/g1-prisma-real-alias.proof.test.ts`](../../packages/core/src/services/consultation/g1-prisma-real-alias.proof.test.ts), [`scripts/refactor/g1_core_db_override_lease_guard.mjs`](../../scripts/refactor/g1_core_db_override_lease_guard.mjs), [`scripts/refactor/g1_prisma_core_window_guard.mjs`](../../scripts/refactor/g1_prisma_core_window_guard.mjs) |
| `G1_LOCAL_PG_INTEGRATION` | [`apps/api/src/middleware/g1-postgres-transactions.integration.test.ts`](../../apps/api/src/middleware/g1-postgres-transactions.integration.test.ts) |
| `G1_LOCAL_PG_URL` | [`apps/api/src/middleware/g1-postgres-transactions.integration.test.ts`](../../apps/api/src/middleware/g1-postgres-transactions.integration.test.ts) |
| `G1_LOCAL_REDIS_INTEGRATION` | [`apps/api/src/middleware/g1-redis-rate-limit.integration.test.ts`](../../apps/api/src/middleware/g1-redis-rate-limit.integration.test.ts), [`apps/api/src/routes/v1/g1-chat-real-redis.integration.test.ts`](../../apps/api/src/routes/v1/g1-chat-real-redis.integration.test.ts) |
| `G1_LOCAL_REDIS_URL` | [`apps/api/src/middleware/g1-redis-rate-limit.integration.test.ts`](../../apps/api/src/middleware/g1-redis-rate-limit.integration.test.ts), [`apps/api/src/routes/v1/g1-chat-real-redis.integration.test.ts`](../../apps/api/src/routes/v1/g1-chat-real-redis.integration.test.ts) |
| `G1_NATIVE_REAL_PG_URL` | [`packages/core/src/services/petPrevention/g1-native-sync.realpg.test.ts`](../../packages/core/src/services/petPrevention/g1-native-sync.realpg.test.ts), [`packages/core/src/services/training/g1-native-sync-progress-concurrency.realpg.test.ts`](../../packages/core/src/services/training/g1-native-sync-progress-concurrency.realpg.test.ts) |
| `G1_PRISMA_SCRATCH_FACADE` | [`packages/core/src/services/consultation/g1-prisma-real-alias.proof.test.ts`](../../packages/core/src/services/consultation/g1-prisma-real-alias.proof.test.ts) |
| `GAFUS_ADMIN18_LIVE_READONLY` | [`apps/api/src/test/admin18-live-readonly.smoke.ts`](../../apps/api/src/test/admin18-live-readonly.smoke.ts) |
| `GAFUS_ADMIN_ISOLATED_ALTERNATE` | [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts), [`scripts/refactor/admin-live-cookie-browser.mjs`](../../scripts/refactor/admin-live-cookie-browser.mjs), [`scripts/refactor/admin-work-vite.config.mjs`](../../scripts/refactor/admin-work-vite.config.mjs) |
| `GAFUS_ADMIN_MODERATOR_SAFE_WORK` | [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts) |
| `GAFUS_ADMIN_PROMO_SAFE_WORK` | [`apps/api/src/test/admin-promo-live-safe.smoke.ts`](../../apps/api/src/test/admin-promo-live-safe.smoke.ts) |
| `GAFUS_ADMIN_WRITES_ONLY` | [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts), [`scripts/refactor/admin-live-cookie-browser.mjs`](../../scripts/refactor/admin-live-cookie-browser.mjs) |
| `GAFUS_AG1_FULLSCHEMA_STAGE_CAS` | [`packages/core/src/services/trainerCourse/g1-fullschema-course-version-work-stage.real-pg.test.ts`](../../packages/core/src/services/trainerCourse/g1-fullschema-course-version-work-stage.real-pg.test.ts) |
| `GAFUS_API_REALPG_ISOLATED` | [`apps/api/vitest.realpg.config.ts`](../../apps/api/vitest.realpg.config.ts) |
| `GAFUS_AUTH_ISOLATED_WORK_TEST` | [`apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts`](../../apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts) |
| `GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts) |
| `GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_TEST_ONLY` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts) |
| `GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_USER_ID` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts) |
| `GAFUS_CHAT2_ARCHIVE_TEST` | [`apps/api/src/modules/chat2/archive.real-pg.test.ts`](../../apps/api/src/modules/chat2/archive.real-pg.test.ts) |
| `GAFUS_CHAT2_AVATAR_ACCEPTANCE` | [`apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts) |
| `GAFUS_CHAT2_HTTP_ACCEPTANCE` | [`apps/api/src/modules/chat2/chats.http.real-pg.test.ts`](../../apps/api/src/modules/chat2/chats.http.real-pg.test.ts) |
| `GAFUS_CHAT2_JOB_CREATE_CONFIRM` | [`infra/cloudru/chat2-job-provision.mjs`](../../infra/cloudru/chat2-job-provision.mjs) |
| `GAFUS_CHAT2_LOCAL_MANUAL_TEST` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`packages/worker/src/chat2-manual-worker.ts`](../../packages/worker/src/chat2-manual-worker.ts) |
| `GAFUS_CHAT2_LOCAL_MEDIA_QA` | [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs) |
| `GAFUS_CHAT2_NEW_ORG_S3_SMOKE` | [`infra/cloudru/chat2-new-org-s3-smoke.mjs`](../../infra/cloudru/chat2-new-org-s3-smoke.mjs) |
| `GAFUS_CHAT2_POST_SMOKE` | [`infra/cloudru/chat2-presigned-post-smoke.mjs`](../../infra/cloudru/chat2-presigned-post-smoke.mjs) |
| `GAFUS_CHAT2_REALTIME_ACCEPTANCE` | [`apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts`](../../apps/api/src/modules/chat2/chat2.realtime.real-pg.test.ts) |
| `GAFUS_CHAT2_REAL_PG_ACCEPTANCE` | [`apps/api/src/modules/chat2/chat2.real-pg.integration.test.ts`](../../apps/api/src/modules/chat2/chat2.real-pg.integration.test.ts) |
| `GAFUS_CHAT2_REAL_S3_ACCEPTANCE` | [`apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts) |
| `GAFUS_CHAT_S3_CONFIRM` | [`infra/cloudru/chat-public-s3.mjs`](../../infra/cloudru/chat-public-s3.mjs) |
| `GAFUS_CHAT_S3_SMOKE_CONFIRM` | [`infra/cloudru/chat-public-acceptance.mjs`](../../infra/cloudru/chat-public-acceptance.mjs) |
| `GAFUS_CHECK_LIVE_BROWSER_LOGIN` | [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts), [`scripts/refactor/admin-live-cookie-browser.mjs`](../../scripts/refactor/admin-live-cookie-browser.mjs) |
| `GAFUS_CLIENT_STAGE_ONLY` | [`apps/api/staging-client-api.ts`](../../apps/api/staging-client-api.ts) |
| `GAFUS_FEED_V2_E2E_PHOTO_SHAPE` | [`apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts`](../../apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts) |
| `GAFUS_FEED_V2_E2E_VIDEO_SECONDS` | [`apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts`](../../apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts) |
| `GAFUS_FEED_V2_EPHEMERAL_E2E` | [`apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts`](../../apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts) |
| `GAFUS_FEED_V2_LOCAL_BROWSER` | [`apps/web-vite/vite.feed-local.config.mjs`](../../apps/web-vite/vite.feed-local.config.mjs) |
| `GAFUS_GALLERY_ISOLATED_HONO` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts) |
| `GAFUS_ISOLATED_CORE_CONFIRM` | [`infra/cloudru/setup-isolated-core-staging.mjs`](../../infra/cloudru/setup-isolated-core-staging.mjs) |
| `GAFUS_ISOLATED_NONPROD_S3` | [`apps/api/src/lib/localLegacyTrainingVideo.ts`](../../apps/api/src/lib/localLegacyTrainingVideo.ts), [`apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.group-avatar.real-isolated.test.ts), [`apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts`](../../apps/api/src/modules/chat2/chat2.s3.real-isolated.test.ts) (ещё 24) |
| `GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET` | [`scripts/refactor/web2-pet-photo-hono-work-proof.ts`](../../scripts/refactor/web2-pet-photo-hono-work-proof.ts), [`scripts/refactor/web2-pet-photo-pg-s3-work-proof.ts`](../../scripts/refactor/web2-pet-photo-pg-s3-work-proof.ts), [`scripts/refactor/web2-pet-photo-s3-check.ts`](../../scripts/refactor/web2-pet-photo-s3-check.ts) |
| `GAFUS_ISOLATED_S3_ENDPOINT` | [`apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts`](../../apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts), [`apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts`](../../apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts), [`apps/gallery-cloud/src/gallery-v2.s3.integration.test.ts`](../../apps/gallery-cloud/src/gallery-v2.s3.integration.test.ts) (ещё 6) |
| `GAFUS_ISOLATED_S3_FEED_BUCKET` | [`packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts), [`packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts), [`packages/feed-storage/src/web4-functional-minio.acceptance.test.ts`](../../packages/feed-storage/src/web4-functional-minio.acceptance.test.ts) |
| `GAFUS_ISOLATED_S3_GALLERY_BUCKET` | [`apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts`](../../apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts) |
| `GAFUS_ISOLATED_STOP_CONFIRM` | [`infra/cloudru/stop-isolated-core-staging.mjs`](../../infra/cloudru/stop-isolated-core-staging.mjs) |
| `GAFUS_ISOLATED_TEST_DB` | [`packages/core/src/services/appSubscription/__tests__/admin2PartnerPayout.postgres.test.ts`](../../packages/core/src/services/appSubscription/__tests__/admin2PartnerPayout.postgres.test.ts), [`packages/core/src/services/appSubscription/__tests__/partnerPayout.postgres.test.ts`](../../packages/core/src/services/appSubscription/__tests__/partnerPayout.postgres.test.ts), [`packages/core/src/services/appSubscription/npdOperationPersistence.postgres.test.ts`](../../packages/core/src/services/appSubscription/npdOperationPersistence.postgres.test.ts) (ещё 1) |
| `GAFUS_LEGACY_IMPORT_ENABLED` | [`packages/core/src/services/gafus/legacyImportService.test.ts`](../../packages/core/src/services/gafus/legacyImportService.test.ts), [`packages/core/src/services/gafus/legacyImportService.ts`](../../packages/core/src/services/gafus/legacyImportService.ts) |
| `GAFUS_LEGACY_REWARDED_DISABLED` | [`packages/core/src/services/gafus/legacyImportService.test.ts`](../../packages/core/src/services/gafus/legacyImportService.test.ts), [`packages/core/src/services/gafus/legacyImportService.ts`](../../packages/core/src/services/gafus/legacyImportService.ts), [`packages/core/src/services/rewardedCredits/adSessionService.ts`](../../packages/core/src/services/rewardedCredits/adSessionService.ts) (ещё 1) |
| `GAFUS_LOCAL_BROWSER_AUTH` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts`](../../apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts) (ещё 3) |
| `GAFUS_LOCAL_ISOLATED_API` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts), [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/lib/localLegacyTrainingVideo.ts`](../../apps/api/src/lib/localLegacyTrainingVideo.ts) (ещё 64) |
| `GAFUS_LOCAL_LEGACY_VIDEO_READ_ONLY` | [`apps/api/src/lib/localLegacyTrainingVideo.ts`](../../apps/api/src/lib/localLegacyTrainingVideo.ts) |
| `GAFUS_LOCAL_OCI_TEST` | [`infra/cloudru/local-oci-origin-acceptance.mjs`](../../infra/cloudru/local-oci-origin-acceptance.mjs) |
| `GAFUS_LOCAL_READONLY_CDN` | [`apps/api/src/test/live-cdn-preview-readonly.http.ts`](../../apps/api/src/test/live-cdn-preview-readonly.http.ts), [`packages/feed-server/src/index.ts`](../../packages/feed-server/src/index.ts), [`packages/gallery-server/src/index.ts`](../../packages/gallery-server/src/index.ts) |
| `GAFUS_MANIFEST_PREVIEW_CONFIRM` | [`infra/cloudru/prepare-preproduction-origin-jobs.mjs`](../../infra/cloudru/prepare-preproduction-origin-jobs.mjs) |
| `GAFUS_MEDIA_CORE_STAGE_ONLY` | [`apps/api/src/staging-media-core.ts`](../../apps/api/src/staging-media-core.ts) |
| `GAFUS_NONPROD_S3_REAL_ACCEPTANCE` | [`scripts/refactor/ag1-nonprod-s3-physical-proof.ts`](../../scripts/refactor/ag1-nonprod-s3-physical-proof.ts) |
| `GAFUS_NOTIFICATIONS_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `GAFUS_OFFLINE_ISOLATED_ACCEPT` | [`packages/core/src/services/offline/offlineMutationJournal.isolated-real-pg.test.ts`](../../packages/core/src/services/offline/offlineMutationJournal.isolated-real-pg.test.ts) |
| `GAFUS_OFFLINE_ISOLATED_ROOT` | [`packages/core/src/services/offline/offlineMutationJournal.isolated-real-pg.test.ts`](../../packages/core/src/services/offline/offlineMutationJournal.isolated-real-pg.test.ts) |
| `GAFUS_PARITY_ISOLATED_DB` | [`apps/api/src/routes/v1/gafus.unlock.isolatedpg.route.test.ts`](../../apps/api/src/routes/v1/gafus.unlock.isolatedpg.route.test.ts), [`packages/core/src/services/gafus/gafus-content-parity.isolatedpg.test.ts`](../../packages/core/src/services/gafus/gafus-content-parity.isolatedpg.test.ts) |
| `GAFUS_QUESTIONS_ISOLATED_QA` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs) (ещё 1) |
| `GAFUS_REFACTOR_MOCK_PORT` | [`scripts/refactor/read-only-api.mjs`](../../scripts/refactor/read-only-api.mjs) |
| `GAFUS_STAGE_CLEAN` | [`infra/cloudru/cleanup-stage-fixtures.mjs`](../../infra/cloudru/cleanup-stage-fixtures.mjs) |
| `GAFUS_STAGING_CORE_URL` | [`infra/cloudru/isolated-core-smoke.mjs`](../../infra/cloudru/isolated-core-smoke.mjs) |
| `GAFUS_STAGING_ORIGIN_MODE` | [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts), [`apps/gallery-cloud/src/origin-staging-service.ts`](../../apps/gallery-cloud/src/origin-staging-service.ts) |
| `GAFUS_TEST_BROWSER_WORK` | [`scripts/refactor/admin-live-cookie-browser.mjs`](../../scripts/refactor/admin-live-cookie-browser.mjs) |
| `GAFUS_TEST_DATABASE_URL` | [`packages/core/src/services/gafus/admin2GafusConcurrency.postgres.test.ts`](../../packages/core/src/services/gafus/admin2GafusConcurrency.postgres.test.ts), [`packages/core/src/services/gafus/gafus.postgres.test.ts`](../../packages/core/src/services/gafus/gafus.postgres.test.ts) |
| `GAFUS_TRAINER_DEV_API_MODE` | [`apps/trainer-panel/src/trainer-vite/live/vite.config.mjs`](../../apps/trainer-panel/src/trainer-vite/live/vite.config.mjs) |
| `GAFUS_TRAINER_WORK_REALPG` | [`packages/core/src/services/consultation/trainerTransitionsWorkRealPg20261027.test.ts`](../../packages/core/src/services/consultation/trainerTransitionsWorkRealPg20261027.test.ts), [`packages/core/src/services/notifications/trainerPushWorkRealPg20261027.test.ts`](../../packages/core/src/services/notifications/trainerPushWorkRealPg20261027.test.ts), [`packages/core/src/services/trainerCourse/trainerWorkRealPg20261027.test.ts`](../../packages/core/src/services/trainerCourse/trainerWorkRealPg20261027.test.ts) |
| `GAFUS_VISUAL_PORT` | [`scripts/refactor/visual-regression.mjs`](../../scripts/refactor/visual-regression.mjs) |
| `GAFUS_VISUAL_SCREEN` | [`scripts/refactor/visual-regression.mjs`](../../scripts/refactor/visual-regression.mjs) |
| `GAFUS_WEB1_ALT_HONO` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts) (ещё 1) |
| `GAFUS_WEB1_ALT_NEXT_PORT` | [`scripts/refactor/web1-public-source-pair.mjs`](../../scripts/refactor/web1-public-source-pair.mjs), [`scripts/refactor/web1-tour-reminders-parity.mjs`](../../scripts/refactor/web1-tour-reminders-parity.mjs) |
| `GAFUS_WEB1_ALT_VITE_PORT` | [`scripts/refactor/web1-logout-all-real-work.mjs`](../../scripts/refactor/web1-logout-all-real-work.mjs), [`scripts/refactor/web1-public-source-pair.mjs`](../../scripts/refactor/web1-public-source-pair.mjs), [`scripts/refactor/web1-public-visitor-real.mjs`](../../scripts/refactor/web1-public-visitor-real.mjs) (ещё 4) |
| `GAFUS_WEB1_FOCUS_NEXT_PORT` | [`scripts/refactor/web1-tour-reminders-parity.mjs`](../../scripts/refactor/web1-tour-reminders-parity.mjs) |
| `GAFUS_WEB1_ISOLATED_REMINDER_HONO_TEST` | [`apps/api/src/routes/v1/reminders-web1-isolated-work.integration.test.ts`](../../apps/api/src/routes/v1/reminders-web1-isolated-work.integration.test.ts) |
| `GAFUS_WEB1_ISOLATED_REMINDER_TEST` | [`packages/worker/src/training-reminders-web1-isolated-work.integration.test.ts`](../../packages/worker/src/training-reminders-web1-isolated-work.integration.test.ts) |
| `GAFUS_WEB1_REAL_BROWSER` | [`scripts/refactor/web1-first-login-browser.mjs`](../../scripts/refactor/web1-first-login-browser.mjs), [`scripts/refactor/web1-logout-all-real-work.mjs`](../../scripts/refactor/web1-logout-all-real-work.mjs), [`scripts/refactor/web1-public-source-pair.mjs`](../../scripts/refactor/web1-public-source-pair.mjs) (ещё 6) |
| `GAFUS_WEB2_WORK_MEDIA` | [`apps/api/src/routes/v1/web2-hono-media.work.test.ts`](../../apps/api/src/routes/v1/web2-hono-media.work.test.ts) |
| `GAFUS_WEB3_AUTH_TRANSPORT` | [`scripts/refactor/web3-real-sql-acceptance.ts`](../../scripts/refactor/web3-real-sql-acceptance.ts) |
| `GAFUS_WEB3_OWN_HTTP` | [`scripts/refactor/web3-owned-hono-server.ts`](../../scripts/refactor/web3-owned-hono-server.ts), [`scripts/refactor/web3-real-sql-acceptance.ts`](../../scripts/refactor/web3-real-sql-acceptance.ts), [`scripts/refactor/web3-survey-real-http.ts`](../../scripts/refactor/web3-survey-real-http.ts) |
| `GAFUS_WEB3_REAL_BROWSER` | [`scripts/refactor/web3-real-sql-acceptance.ts`](../../scripts/refactor/web3-real-sql-acceptance.ts), [`scripts/refactor/web3-survey-real-http.ts`](../../scripts/refactor/web3-survey-real-http.ts), [`scripts/refactor/web3-unified-fixture.ts`](../../scripts/refactor/web3-unified-fixture.ts) (ещё 1) |
| `GAFUS_WEB3_SURVEY_REAL_HTTP` | [`scripts/refactor/web3-survey-real-http.ts`](../../scripts/refactor/web3-survey-real-http.ts) |
| `GAFUS_WEB3_VISUAL_RUN_LABEL` | [`scripts/refactor/web3-vite-paywall-visual.mjs`](../../scripts/refactor/web3-vite-paywall-visual.mjs) |
| `GAFUS_WEB3_VITE_ONLY` | [`scripts/refactor/web3-vite-paywall-visual.mjs`](../../scripts/refactor/web3-vite-paywall-visual.mjs) |
| `GAFUS_WEB4_ISOLATED_MEDIA` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/test/feed-v2-local-link-seed.ts`](../../apps/api/src/test/feed-v2-local-link-seed.ts) (ещё 1) |
| `GAFUS_WEB5_BROWSER_LIVE` | [`scripts/refactor/web5-browser-live-e2e.mjs`](../../scripts/refactor/web5-browser-live-e2e.mjs) |
| `GAFUS_WEB5_ISOLATED_CHAT_STREAM_TEST` | [`apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts`](../../apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts) |
| `GAFUS_WEB_DEV_API_MODE` | [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs), [`apps/web-vite/vite.config.test.mjs`](../../apps/web-vite/vite.config.test.mjs), [`apps/web-vite/vite.feed-local.config.mjs`](../../apps/web-vite/vite.feed-local.config.mjs) (ещё 1) |
| `GAFUS_WEB_GALLERY_FULL_HONO` | [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs), [`apps/web-vite/vite.config.test.mjs`](../../apps/web-vite/vite.config.test.mjs) |
| `GAFUS_WEB_QA_BASE_DIR` | [`scripts/refactor/admin-work-vite.config.mjs`](../../scripts/refactor/admin-work-vite.config.mjs) |
| `GALLERY_BEGET_CDN_SERVICE_ID` | [`packages/cdn-upload/src/begetCdnPurge.test.ts`](../../packages/cdn-upload/src/begetCdnPurge.test.ts) |
| `GALLERY_BUCKET` | [`apps/gallery-cloud/src/dispatch.ts`](../../apps/gallery-cloud/src/dispatch.ts), [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts), [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts) (ещё 3) |
| `GALLERY_BUCKET_PUBLIC` | [`packages/cdn-upload/src/vetVisitStorage.ts`](../../packages/cdn-upload/src/vetVisitStorage.ts) |
| `GALLERY_CDN_BASE_URL` | [`packages/cdn-upload/src/vetVisitStorage.ts`](../../packages/cdn-upload/src/vetVisitStorage.ts) |
| `GALLERY_CDN_EDGE_CACHE_HIT_VERIFIED` | [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts) |
| `GALLERY_CDN_EDGE_TOKEN_VERIFIED` | [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`packages/cdn-upload/src/vetVisitStorage.ts`](../../packages/cdn-upload/src/vetVisitStorage.ts) |
| `GALLERY_CDN_PROVIDER` | [`packages/cdn-upload/src/vetVisitStorage.ts`](../../packages/cdn-upload/src/vetVisitStorage.ts) |
| `GALLERY_CDN_SECRET` | [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`apps/gallery-cloud/src/origin.ts`](../../apps/gallery-cloud/src/origin.ts), [`infra/cloudru/beget-release-readiness.mjs`](../../infra/cloudru/beget-release-readiness.mjs) (ещё 1) |
| `GALLERY_CLOUDRU_CDN_DOMAINS` | [`packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts`](../../packages/core/src/services/accountCleanup/cloudruCdnPurge.test.ts) |
| `GALLERY_DUAL_PROVIDER_CLEANUP` | [`packages/core/src/services/accountCleanup/enqueue.ts`](../../packages/core/src/services/accountCleanup/enqueue.ts) |
| `GALLERY_ENABLED` | [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`apps/api/src/staging-media-core.ts`](../../apps/api/src/staging-media-core.ts) (ещё 6) |
| `GALLERY_FIVE_MOVE_WORK_HTTP` | [`apps/api/src/test/gallery-five-upload-move-delete-isolated-work.acceptance.ts`](../../apps/api/src/test/gallery-five-upload-move-delete-isolated-work.acceptance.ts) |
| `GALLERY_INTERNAL_BASE_URL` | [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts) |
| `GALLERY_INTERNAL_HMAC_SECRET` | [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts), [`packages/gallery-server/src/index.ts`](../../packages/gallery-server/src/index.ts) |
| `GALLERY_MEDIA_FALLBACK_ENABLED` | [`packages/gallery-server/src/index.ts`](../../packages/gallery-server/src/index.ts) |
| `GALLERY_ORIGIN_SECRET` | [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`apps/gallery-cloud/src/origin-staging-service.ts`](../../apps/gallery-cloud/src/origin-staging-service.ts), [`apps/gallery-cloud/src/origin.ts`](../../apps/gallery-cloud/src/origin.ts) |
| `GALLERY_ORIGIN_VERIFY_TOKEN` | [`apps/gallery-cloud/src/origin.ts`](../../apps/gallery-cloud/src/origin.ts) |
| `GALLERY_PROCESSOR_READY` | [`packages/gallery-server/src/index.ts`](../../packages/gallery-server/src/index.ts), [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts), [`packages/worker/src/gallery-processing-trigger-worker.ts`](../../packages/worker/src/gallery-processing-trigger-worker.ts) |
| `GALLERY_S3_ACCESS_KEY_ID` | [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts), [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`apps/gallery-cloud/src/origin-staging-service.ts`](../../apps/gallery-cloud/src/origin-staging-service.ts) (ещё 1) |
| `GALLERY_S3_ENDPOINT` | [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts), [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`apps/gallery-cloud/src/origin-staging-service.ts`](../../apps/gallery-cloud/src/origin-staging-service.ts) (ещё 1) |
| `GALLERY_S3_SECRET_ACCESS_KEY` | [`apps/gallery-cloud/src/job.ts`](../../apps/gallery-cloud/src/job.ts), [`apps/gallery-cloud/src/origin-service.ts`](../../apps/gallery-cloud/src/origin-service.ts), [`apps/gallery-cloud/src/origin-staging-service.ts`](../../apps/gallery-cloud/src/origin-staging-service.ts) (ещё 1) |
| `GALLERY_TEST_DATABASE_URL` | [`apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts`](../../apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts), [`packages/core/src/services/gallery/gallery.integration.test.ts`](../../packages/core/src/services/gallery/gallery.integration.test.ts) |
| `GALLERY_V2_ARTIFACT_REVISION` | [`apps/gallery-cloud/scripts/prepare-v2-image.mjs`](../../apps/gallery-cloud/scripts/prepare-v2-image.mjs) |
| `GALLERY_V2_BROWSER_OWNER_ID` | [`apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts`](../../apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts) |
| `GALLERY_V2_BROWSER_UPLOAD_ID` | [`apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts`](../../apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts) |
| `GALLERY_V2_BROWSER_WORKER_ACTION` | [`apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts`](../../apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts) |
| `GALLERY_V2_REAL_FLOW_TEST` | [`apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts`](../../apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts) |
| `GALLERY_V2_REAL_S3_TEST` | [`apps/gallery-cloud/src/gallery-v2.s3.integration.test.ts`](../../apps/gallery-cloud/src/gallery-v2.s3.integration.test.ts) |
| `GITHUB_EVENT_NAME` | [`infra/cloudru/beget-release-readiness.mjs`](../../infra/cloudru/beget-release-readiness.mjs) |
| `GITHUB_REF` | [`infra/cloudru/beget-release-readiness.mjs`](../../infra/cloudru/beget-release-readiness.mjs) |
| `GITHUB_SHA` | [`scripts/refactor/ci033-architecture-report.mjs`](../../scripts/refactor/ci033-architecture-report.mjs) |
| `HOME` | [`.github/skills/impeccable/scripts/hook-lib.mjs`](../../.github/skills/impeccable/scripts/hook-lib.mjs), [`infra/cloudru/beget-synthetic-acceptance.test.mjs`](../../infra/cloudru/beget-synthetic-acceptance.test.mjs) |
| `HOSTNAME` | [`packages/logger/src/tracerServer.ts`](../../packages/logger/src/tracerServer.ts) |
| `IMPECCABLE_API_TIMEOUT` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_API_URL` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_CARD_BASE` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_CATALOG_DIR` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_COMPOSITIONS` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_CONCEPT_SEED` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_CONTEXT_DIR` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs) |
| `IMPECCABLE_CRITIQUE_META` | [`.github/skills/impeccable/scripts/critique-storage.mjs`](../../.github/skills/impeccable/scripts/critique-storage.mjs) |
| `IMPECCABLE_HOOK_DEBUG` | [`.github/skills/impeccable/scripts/hook-before-edit.mjs`](../../.github/skills/impeccable/scripts/hook-before-edit.mjs), [`.github/skills/impeccable/scripts/hook.mjs`](../../.github/skills/impeccable/scripts/hook.mjs) |
| `IMPECCABLE_HOOK_DEPTH` | [`.github/skills/impeccable/scripts/hook.mjs`](../../.github/skills/impeccable/scripts/hook.mjs) |
| `IMPECCABLE_HOOK_DISABLED` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs), [`.github/skills/impeccable/scripts/hook-admin.mjs`](../../.github/skills/impeccable/scripts/hook-admin.mjs), [`.github/skills/impeccable/scripts/hook-before-edit.mjs`](../../.github/skills/impeccable/scripts/hook-before-edit.mjs) |
| `IMPECCABLE_IMAGE_GEN_FAKE` | [`.github/skills/impeccable/scripts/generate-image.mjs`](../../.github/skills/impeccable/scripts/generate-image.mjs) |
| `IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS` | [`.github/skills/impeccable/scripts/live/manual-apply.mjs`](../../.github/skills/impeccable/scripts/live/manual-apply.mjs) |
| `IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS` | [`.github/skills/impeccable/scripts/live/manual-apply.mjs`](../../.github/skills/impeccable/scripts/live/manual-apply.mjs) |
| `IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS` | [`.github/skills/impeccable/scripts/live-commit-manual-edits.mjs`](../../.github/skills/impeccable/scripts/live-commit-manual-edits.mjs) |
| `IMPECCABLE_LIVE_DEBUG_EVENTS` | [`.github/skills/impeccable/scripts/live-server.mjs`](../../.github/skills/impeccable/scripts/live-server.mjs) |
| `IMPECCABLE_LIVE_SVELTE_COMPONENT` | [`.github/skills/impeccable/scripts/live/svelte-component.mjs`](../../.github/skills/impeccable/scripts/live/svelte-component.mjs) |
| `IMPECCABLE_NO_STALENESS_CHECK` | [`.github/skills/impeccable/scripts/lib/staleness-notice.mjs`](../../.github/skills/impeccable/scripts/lib/staleness-notice.mjs) |
| `IMPECCABLE_NO_TELEMETRY` | [`.github/skills/impeccable/scripts/concept-seed.mjs`](../../.github/skills/impeccable/scripts/concept-seed.mjs) |
| `IMPECCABLE_NO_UPDATE_CHECK` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs) |
| `IMPECCABLE_PALETTE_SEED` | [`.github/skills/impeccable/scripts/palette.mjs`](../../.github/skills/impeccable/scripts/palette.mjs) |
| `IMPECCABLE_QUESTION_DISABLED` | [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `IMPECCABLE_QUESTION_FORCE` | [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `IMPECCABLE_STALENESS_CACHE` | [`.github/skills/impeccable/scripts/lib/staleness-notice.mjs`](../../.github/skills/impeccable/scripts/lib/staleness-notice.mjs) |
| `IMPECCABLE_UPDATE_CACHE` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs) |
| `IMPECCABLE_UPDATE_HOST` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs) |
| `JWT_REFRESH_SECRET` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts), [`apps/api/src/test/gallery-v2-isolated-hono.ts`](../../apps/api/src/test/gallery-v2-isolated-hono.ts), [`packages/auth/src/jwt.ts`](../../packages/auth/src/jwt.ts) |
| `JWT_SECRET` | [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts), [`apps/api/src/modules/chat2/chats.http.real-pg.test.ts`](../../apps/api/src/modules/chat2/chats.http.real-pg.test.ts), [`apps/api/src/routes/v1/admin2-real-postgres-http.test.ts`](../../apps/api/src/routes/v1/admin2-real-postgres-http.test.ts) (ещё 74) |
| `MAIL_FROM` | [`packages/mailer/src/env.test.ts`](../../packages/mailer/src/env.test.ts), [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `MAIL_FROM_NAME` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `MAIL_OUTBOX_ENABLED` | [`packages/mailer/src/outbox.ts`](../../packages/mailer/src/outbox.ts) |
| `MAIL_OUTBOX_ENCRYPTION_KEY` | [`packages/mailer/src/outbox.ts`](../../packages/mailer/src/outbox.ts) |
| `MAIL_PROVIDER` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `MAIL_REPLY_TO` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `MEDIA_CDN_PURGE_WORKER_ENABLED` | [`packages/core/src/services/mediaDelivery/purgeWorker.ts`](../../packages/core/src/services/mediaDelivery/purgeWorker.ts), [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `MEDIA_MIGRATION_MAX_FILES` | [`infra/cloudru/migrate-legacy-media.mjs`](../../infra/cloudru/migrate-legacy-media.mjs) |
| `MOBILE_ANDROID_MIN_VERSION` | [`packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts`](../../packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts) |
| `MOBILE_ANDROID_STORE_URL` | [`packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts`](../../packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts) |
| `MOBILE_IOS_MIN_VERSION` | [`packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts`](../../packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts) |
| `MOBILE_IOS_STORE_URL` | [`packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts`](../../packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts) |
| `NEXTAUTH_SECRET` | [`scripts/refactor/web1-tour-reminders-parity.mjs`](../../scripts/refactor/web1-tour-reminders-parity.mjs) |
| `NEXTAUTH_URL` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `NEXT_PUBLIC_API_URL` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts) |
| `NEXT_PUBLIC_APP_URL` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `NEXT_PUBLIC_APP_VERSION` | [`packages/logger/src/tracerServer.ts`](../../packages/logger/src/tracerServer.ts), [`packages/ui-components/src/TracerProvider.tsx`](../../packages/ui-components/src/TracerProvider.tsx) |
| `NEXT_PUBLIC_ENABLE_TRACER` | [`packages/ui-components/src/TracerProvider.tsx`](../../packages/ui-components/src/TracerProvider.tsx) |
| `NEXT_PUBLIC_GAFUS_ANALYTICS_DEBUG` | [`packages/analytics/src/client.ts`](../../packages/analytics/src/client.ts) |
| `NEXT_PUBLIC_SITE_URL` | [`packages/core/src/services/mail/publicWebBaseUrl.ts`](../../packages/core/src/services/mail/publicWebBaseUrl.ts) |
| `NEXT_PUBLIC_TRACER_APP_TOKEN` | [`packages/logger/src/tracerServer.ts`](../../packages/logger/src/tracerServer.ts), [`packages/ui-components/src/TracerProvider.tsx`](../../packages/ui-components/src/TracerProvider.tsx) |
| `NEXT_PUBLIC_TRAINER_PANEL_URL` | [`packages/core/src/services/consultation/consultationTransactionalMail.ts`](../../packages/core/src/services/consultation/consultationTransactionalMail.ts) |
| `NEXT_PUBLIC_WEB_APP_URL` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts) |
| `NEXT_PUBLIC_YM_COUNTER_ID` | [`packages/analytics/src/client.ts`](../../packages/analytics/src/client.ts) |
| `NODE_ENV` | [`apps/api/src/index.ts`](../../apps/api/src/index.ts), [`apps/api/src/lib/browser-auth.ts`](../../apps/api/src/lib/browser-auth.ts), [`apps/api/src/lib/localLegacyTrainingVideo.ts`](../../apps/api/src/lib/localLegacyTrainingVideo.ts) (ещё 68) |
| `NODE_OPTIONS` | [`scripts/refactor/g1_core_db_override_lease_guard.mjs`](../../scripts/refactor/g1_core_db_override_lease_guard.mjs), [`scripts/refactor/g1_prisma_core_window_guard.mjs`](../../scripts/refactor/g1_prisma_core_window_guard.mjs), [`scripts/refactor/g1_prisma_prep_guard.mjs`](../../scripts/refactor/g1_prisma_prep_guard.mjs) |
| `NODE_PATH` | [`scripts/refactor/g1_core_db_override_lease_guard.mjs`](../../scripts/refactor/g1_core_db_override_lease_guard.mjs), [`scripts/refactor/g1_prisma_core_window_guard.mjs`](../../scripts/refactor/g1_prisma_core_window_guard.mjs), [`scripts/refactor/g1_prisma_prep_guard.mjs`](../../scripts/refactor/g1_prisma_prep_guard.mjs) |
| `NPD_BATCH_SIZE` | [`packages/worker/src/npd-worker.ts`](../../packages/worker/src/npd-worker.ts) |
| `NPD_PROCESSING_ENABLED` | [`packages/worker/src/npd-worker.ts`](../../packages/worker/src/npd-worker.ts) |
| `NPD_RECEIPT_EMAIL_BATCH_SIZE` | [`packages/core/src/services/appSubscription/npdEmailDeliveryService.ts`](../../packages/core/src/services/appSubscription/npdEmailDeliveryService.ts) |
| `NPD_RECEIPT_EMAIL_ENABLED` | [`packages/core/src/services/appSubscription/npdEmailDeliveryService.ts`](../../packages/core/src/services/appSubscription/npdEmailDeliveryService.ts) |
| `NPD_REQUEST_TIMEOUT_MS` | [`packages/worker/src/npd-worker.ts`](../../packages/worker/src/npd-worker.ts) |
| `NPD_TOKEN_ENCRYPTION_KEY` | [`packages/npd/src/crypto.ts`](../../packages/npd/src/crypto.ts) |
| `OPENAI_API_KEY` | [`.github/skills/impeccable/scripts/context.mjs`](../../.github/skills/impeccable/scripts/context.mjs), [`.github/skills/impeccable/scripts/generate-image.mjs`](../../.github/skills/impeccable/scripts/generate-image.mjs) |
| `PATH` | [`apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts`](../../apps/api/src/routes/v1/auth-session-isolated-work.integration.test.ts), [`apps/api/src/test/admin-moderator-safe-work.smoke.ts`](../../apps/api/src/test/admin-moderator-safe-work.smoke.ts), [`ci-cd/scripts/cloudru-publish-retry.test.mjs`](../../ci-cd/scripts/cloudru-publish-retry.test.mjs) (ещё 21) |
| `PET_MEDIA_CLEANUP_WORKER_ENABLED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts) |
| `PET_MEDIA_DELETION_OUTBOX_ENABLED` | [`packages/core/src/services/pets/petDeletePostCommit.mounted.test.ts`](../../packages/core/src/services/pets/petDeletePostCommit.mounted.test.ts), [`packages/core/src/services/pets/petMediaDeletionSql.ts`](../../packages/core/src/services/pets/petMediaDeletionSql.ts), [`packages/core/src/services/pets/petMediaDirectPhotoFence.mounted.test.ts`](../../packages/core/src/services/pets/petMediaDirectPhotoFence.mounted.test.ts) (ещё 3) |
| `PET_PROFILE_TEST_DATABASE_URL` | [`packages/core/src/services/pets/petProfileVisibility.integration.test.ts`](../../packages/core/src/services/pets/petProfileVisibility.integration.test.ts) |
| `PINO_USE_WORKER_TRANSPORTS` | [`packages/logger/src/UnifiedLogger.ts`](../../packages/logger/src/UnifiedLogger.ts) |
| `PORT` | [`apps/bull-board/bull-board.ts`](../../apps/bull-board/bull-board.ts), [`apps/feed-cloud/src/origin-service.ts`](../../apps/feed-cloud/src/origin-service.ts), [`apps/feed-cloud/src/origin-staging-service.ts`](../../apps/feed-cloud/src/origin-staging-service.ts) (ещё 3) |
| `PROFIT_INTEGRATION_TESTS` | [`packages/core/src/services/appSubscription/__tests__/profitService.integration.test.ts`](../../packages/core/src/services/appSubscription/__tests__/profitService.integration.test.ts) |
| `QA_ONLY_ROLE` | [`scripts/qa/chromium-commercial-screens.cjs`](../../scripts/qa/chromium-commercial-screens.cjs) |
| `QA_TRAINER_SHARED_ORIGIN` | [`scripts/qa/chromium-trainer-step-crud.cjs`](../../scripts/qa/chromium-trainer-step-crud.cjs) |
| `QUESTIONS_TEST_DATABASE_URL` | [`packages/core/src/services/questions/questions.integration.test.ts`](../../packages/core/src/services/questions/questions.integration.test.ts) |
| `QUESTIONS_V2_CDN_BASE_URL` | [`packages/cdn-upload/src/questionsV2Media.test.ts`](../../packages/cdn-upload/src/questionsV2Media.test.ts), [`packages/cdn-upload/src/questionsV2Media.ts`](../../packages/cdn-upload/src/questionsV2Media.ts) |
| `QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED` | [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts), [`packages/worker/src/questions-photo-recovery.ts`](../../packages/worker/src/questions-photo-recovery.ts), [`packages/worker/src/questions-photo-trigger-worker.ts`](../../packages/worker/src/questions-photo-trigger-worker.ts) |
| `QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME` | [`apps/feed-cloud/src/questions-v2-job-core.test.ts`](../../apps/feed-cloud/src/questions-v2-job-core.test.ts), [`apps/feed-cloud/src/questions-v2-job-core.ts`](../../apps/feed-cloud/src/questions-v2-job-core.ts), [`packages/worker/src/questions-photo-recovery.test.ts`](../../packages/worker/src/questions-photo-recovery.test.ts) (ещё 1) |
| `QUESTIONS_V2_INTERNAL_BASE_URL` | [`packages/worker/src/questions-photo-recovery.test.ts`](../../packages/worker/src/questions-photo-recovery.test.ts), [`packages/worker/src/questions-photo-recovery.ts`](../../packages/worker/src/questions-photo-recovery.ts) |
| `QUESTIONS_V2_INTERNAL_HMAC_SECRET` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts), [`packages/worker/src/questions-photo-recovery.test.ts`](../../packages/worker/src/questions-photo-recovery.test.ts), [`packages/worker/src/questions-photo-recovery.ts`](../../packages/worker/src/questions-photo-recovery.ts) |
| `QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED` | [`apps/feed-cloud/src/questions-v2-job-core.test.ts`](../../apps/feed-cloud/src/questions-v2-job-core.test.ts), [`apps/feed-cloud/src/questions-v2-job-core.ts`](../../apps/feed-cloud/src/questions-v2-job-core.ts), [`packages/worker/src/questions-photo-recovery.test.ts`](../../packages/worker/src/questions-photo-recovery.test.ts) (ещё 1) |
| `QUESTIONS_V2_MEDIA_ENABLED` | [`apps/api/src/modules/questions/media-v2-upload.test.ts`](../../apps/api/src/modules/questions/media-v2-upload.test.ts), [`apps/api/src/modules/questions/media-v2-upload.ts`](../../apps/api/src/modules/questions/media-v2-upload.ts), [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts) (ещё 3) |
| `QUESTIONS_V2_PROCESSOR_READY` | [`apps/api/src/routes/internal/questions-media-jobs.ts`](../../apps/api/src/routes/internal/questions-media-jobs.ts), [`packages/worker/src/cron-scheduler.ts`](../../packages/worker/src/cron-scheduler.ts), [`packages/worker/src/questions-photo-recovery.ts`](../../packages/worker/src/questions-photo-recovery.ts) (ещё 1) |
| `QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED` | [`packages/worker/src/questions-photo-trigger-worker.ts`](../../packages/worker/src/questions-photo-trigger-worker.ts) |
| `QUESTIONS_V2_S3_ACCESS_KEY_ID` | [`apps/feed-cloud/src/questions-v2-loopback-s3.test.ts`](../../apps/feed-cloud/src/questions-v2-loopback-s3.test.ts) |
| `QUESTIONS_V2_S3_BUCKET` | [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`packages/cdn-upload/src/questionsV2Media.test.ts`](../../packages/cdn-upload/src/questionsV2Media.test.ts), [`packages/cdn-upload/src/questionsV2Media.ts`](../../packages/cdn-upload/src/questionsV2Media.ts) |
| `QUESTIONS_V2_S3_ENDPOINT` | [`apps/api/src/middleware/cors.ts`](../../apps/api/src/middleware/cors.ts), [`packages/cdn-upload/src/questionsV2Media.test.ts`](../../packages/cdn-upload/src/questionsV2Media.test.ts), [`packages/cdn-upload/src/questionsV2Media.ts`](../../packages/cdn-upload/src/questionsV2Media.ts) |
| `QUESTIONS_V2_S3_SECRET_ACCESS_KEY` | [`apps/feed-cloud/src/questions-v2-loopback-s3.test.ts`](../../apps/feed-cloud/src/questions-v2-loopback-s3.test.ts) |
| `REDIS_URL` | [`apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`](../../apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts), [`apps/api/scripts/local-course-cache-http-smoke.ts`](../../apps/api/scripts/local-course-cache-http-smoke.ts), [`apps/api/src/index.ts`](../../apps/api/src/index.ts) (ещё 27) |
| `RESEND_API_KEY` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `RESEND_FROM` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `RESEND_WEBHOOK_SECRET` | [`packages/mailer/src/webhook.ts`](../../packages/mailer/src/webhook.ts) |
| `RUNNER_TEMP` | [`infra/cloudru/production-cdn-release.mjs`](../../infra/cloudru/production-cdn-release.mjs) |
| `RUSTORE_PROJECT_ID` | [`packages/webpush/src/rustorePush.ts`](../../packages/webpush/src/rustorePush.ts), [`packages/worker/src/feed-worker.ts`](../../packages/worker/src/feed-worker.ts) |
| `RUSTORE_PUSH_SERVICE_TOKEN` | [`packages/webpush/src/rustorePush.ts`](../../packages/webpush/src/rustorePush.ts), [`packages/worker/src/feed-worker.ts`](../../packages/worker/src/feed-worker.ts) |
| `SMTP_HOST` | [`packages/mailer/src/env.test.ts`](../../packages/mailer/src/env.test.ts), [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `SMTP_PASS` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `SMTP_PORT` | [`packages/mailer/src/env.test.ts`](../../packages/mailer/src/env.test.ts), [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `SMTP_SECURE` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `SMTP_USER` | [`packages/mailer/src/env.ts`](../../packages/mailer/src/env.ts) |
| `SSH_CONNECTION` | [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `STREAM_API_KEY` | [`apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts`](../../apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts), [`packages/core/src/services/cynologistChat/stream.ts`](../../packages/core/src/services/cynologistChat/stream.ts), [`scripts/refactor/web5-r47-dev-two-identity-unread.mjs`](../../scripts/refactor/web5-r47-dev-two-identity-unread.mjs) (ещё 2) |
| `STREAM_API_SECRET` | [`apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts`](../../apps/api/src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts), [`packages/core/src/services/cynologistChat/stream.ts`](../../packages/core/src/services/cynologistChat/stream.ts), [`scripts/check-cynologist-chat-live.mjs`](../../scripts/check-cynologist-chat-live.mjs) (ещё 3) |
| `TEST_DATABASE_URL` | [`packages/core/src/services/auth/registerUserWithCredentials.integration.test.ts`](../../packages/core/src/services/auth/registerUserWithCredentials.integration.test.ts) |
| `TMPDIR` | [`apps/api/src/routes/v1/g1-ag1-g03-username.privacy-error-delta.test.ts`](../../apps/api/src/routes/v1/g1-ag1-g03-username.privacy-error-delta.test.ts), [`apps/api/src/routes/v1/g1-ag1-g03-username.producer.contract.test.ts`](../../apps/api/src/routes/v1/g1-ag1-g03-username.producer.contract.test.ts), [`apps/api/src/routes/v1/g1-ag2-w1-fourpost.auth-cookie-origin.contract.test.ts`](../../apps/api/src/routes/v1/g1-ag2-w1-fourpost.auth-cookie-origin.contract.test.ts) (ещё 19) |
| `TRACER_APP_TOKEN` | [`packages/logger/src/tracerServer.ts`](../../packages/logger/src/tracerServer.ts) |
| `TRACER_SERVER_ENABLED` | [`packages/logger/src/tracerServer.ts`](../../packages/logger/src/tracerServer.ts) |
| `TRACER_SOURCEMAP_TOKEN_MOBILE` | [`apps/mobile/scripts/publish-update-with-apptracer.mjs`](../../apps/mobile/scripts/publish-update-with-apptracer.mjs), [`apps/mobile/scripts/upload-apptracer-sourcemaps.mjs`](../../apps/mobile/scripts/upload-apptracer-sourcemaps.mjs) |
| `TRACER_SOURCEMAP_VERSION_CODE` | [`apps/mobile/scripts/upload-apptracer-sourcemaps.mjs`](../../apps/mobile/scripts/upload-apptracer-sourcemaps.mjs) |
| `TRACER_SOURCEMAP_VERSION_NAME` | [`apps/mobile/scripts/upload-apptracer-sourcemaps.mjs`](../../apps/mobile/scripts/upload-apptracer-sourcemaps.mjs) |
| `TRAINER_PANEL_URL` | [`packages/core/src/services/consultation/consultationTransactionalMail.ts`](../../packages/core/src/services/consultation/consultationTransactionalMail.ts) |
| `TRANSACTIONAL_EMAIL_LOGO_PATH` | [`packages/core/src/services/mail/transactionalEmailLayout.ts`](../../packages/core/src/services/mail/transactionalEmailLayout.ts) |
| `TZ` | [`apps/web-vite/src/features/profile/StudentNotesDates.test.ts`](../../apps/web-vite/src/features/profile/StudentNotesDates.test.ts), [`packages/core/src/services/achievements/achievements.real-pg.mounted.test.ts`](../../packages/core/src/services/achievements/achievements.real-pg.mounted.test.ts) |
| `USER` | [`infra/cloudru/serve-staging-core.mjs`](../../infra/cloudru/serve-staging-core.mjs), [`infra/cloudru/setup-isolated-core-staging.mjs`](../../infra/cloudru/setup-isolated-core-staging.mjs) |
| `USERPROFILE` | [`.github/skills/impeccable/scripts/hook-lib.mjs`](../../.github/skills/impeccable/scripts/hook-lib.mjs) |
| `VAPID_PRIVATE_KEY` | [`packages/webpush/src/service.ts`](../../packages/webpush/src/service.ts) |
| `VAPID_PUBLIC_KEY` | [`apps/api/src/routes/v1/push-public-key.route.test.ts`](../../apps/api/src/routes/v1/push-public-key.route.test.ts), [`apps/api/src/routes/v1/subscriptions.ts`](../../apps/api/src/routes/v1/subscriptions.ts), [`packages/webpush/src/service.ts`](../../packages/webpush/src/service.ts) |
| `VAPID_SUBJECT` | [`packages/webpush/src/service.ts`](../../packages/webpush/src/service.ts) |
| `VET_PREVIEW_ASYNC_ENABLED` | [`packages/core/src/services/pets/petVetVisitService.ts`](../../packages/core/src/services/pets/petVetVisitService.ts), [`packages/core/src/services/pets/vetPreviewQueue.test.ts`](../../packages/core/src/services/pets/vetPreviewQueue.test.ts) |
| `VET_VISIT_TEST_DATABASE_URL` | [`packages/core/src/services/pets/petVetVisit.integration.test.ts`](../../packages/core/src/services/pets/petVetVisit.integration.test.ts) |
| `VIDEO_ACCESS_SECRET` | [`apps/api/src/routes/v1/training.ts`](../../apps/api/src/routes/v1/training.ts), [`apps/api/src/routes/v1/training.validation.test.ts`](../../apps/api/src/routes/v1/training.validation.test.ts), [`packages/video-access/src/index.ts`](../../packages/video-access/src/index.ts) |
| `VITEST` | [`apps/feed-cloud/src/chat2-job-runner.ts`](../../apps/feed-cloud/src/chat2-job-runner.ts), [`apps/feed-cloud/src/chat2-v2-processor.ts`](../../apps/feed-cloud/src/chat2-v2-processor.ts), [`apps/feed-cloud/src/worker.ts`](../../apps/feed-cloud/src/worker.ts) |
| `VITE_API_BASE_URL` | [`apps/trainer-panel/src/trainer-vite/live/vite.config.mjs`](../../apps/trainer-panel/src/trainer-vite/live/vite.config.mjs), [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs), [`apps/web-vite/vite.config.test.mjs`](../../apps/web-vite/vite.config.test.mjs) |
| `VITE_CHAT2_LOCAL_S3_RELAY` | [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs) |
| `VITE_QUESTIONS_LOCAL_QA` | [`apps/web-vite/vite.config.mjs`](../../apps/web-vite/vite.config.mjs), [`apps/web-vite/vite.config.test.mjs`](../../apps/web-vite/vite.config.test.mjs) |
| `VITE_WEB4_PRIVATE_S3` | [`apps/web-vite/vite.feed-local.config.mjs`](../../apps/web-vite/vite.feed-local.config.mjs) |
| `VK_CLIENT_ID` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts), [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts), [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `VK_CLIENT_ID_ANDROID` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts), [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `VK_CLIENT_ID_IOS` | [`apps/api/src/routes/v1/auth.ts`](../../apps/api/src/routes/v1/auth.ts), [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `VK_MOBILE_REDIRECT_URI` | [`apps/mobile/app.config.js`](../../apps/mobile/app.config.js) |
| `VK_WEB_COOKIE_SECRET` | [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `VK_WEB_REDIRECT_URI` | [`apps/api/src/routes/v1/auth-vk-web.route.test.ts`](../../apps/api/src/routes/v1/auth-vk-web.route.test.ts), [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) |
| `VOXIMPLANT_ACCOUNT_ID` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_ACCOUNT_NAME` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_ADMISSION_SECRET` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_APPLICATION_ID` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_APPLICATION_NAME` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_CREDENTIAL_SECRET` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_KEY_ID` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_PRIVATE_KEY` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `VOXIMPLANT_PRIVATE_KEY_BASE64` | [`packages/core/src/services/consultation/voximplantService.ts`](../../packages/core/src/services/consultation/voximplantService.ts) |
| `W1_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-w1-email-change.http.capture.test.ts`](../../apps/api/src/routes/v1/g1-w1-email-change.http.capture.test.ts) |
| `W1_G02_CAPTURE_DIR` | [`apps/api/src/routes/v1/g1-w1-g02-password.http.capture.test.ts`](../../apps/api/src/routes/v1/g1-w1-g02-password.http.capture.test.ts) |
| `W1_G02_REAL_DATABASE_URL` | [`packages/core/src/services/auth/g1-w1-g02-password.realdb.test.ts`](../../packages/core/src/services/auth/g1-w1-g02-password.realdb.test.ts) |
| `W1_REAL_DATABASE_URL` | [`packages/core/src/services/auth/g1-w1-email-change.realdb.test.ts`](../../packages/core/src/services/auth/g1-w1-email-change.realdb.test.ts) |
| `WAYLAND_DISPLAY` | [`.github/skills/impeccable/scripts/serve-question.mjs`](../../.github/skills/impeccable/scripts/serve-question.mjs) |
| `WEB1_E2E_OUTPUT_TAG` | [`scripts/refactor/web1-unified-browser-e2e.mjs`](../../scripts/refactor/web1-unified-browser-e2e.mjs) |
| `WEB1_PUBLIC_IDENTITY_MODE` | [`scripts/refactor/web1-public-visitor-real.mjs`](../../scripts/refactor/web1-public-visitor-real.mjs) |
| `WEB3_PREVIEW_REAL_ACCEPTANCE` | [`apps/api/src/routes/v1/training.preview.real-pg-s3.test.ts`](../../apps/api/src/routes/v1/training.preview.real-pg-s3.test.ts) |
| `WEB4_MIXED_READY_R37_WORK_HTTP` | [`apps/api/src/test/web4-mixed-photo-poll-ready-r37.acceptance.ts`](../../apps/api/src/test/web4-mixed-photo-poll-ready-r37.acceptance.ts) |
| `WEB4_OWN_FUNCTIONAL_S3_TEST` | [`packages/feed-storage/src/web4-functional-minio.acceptance.test.ts`](../../packages/feed-storage/src/web4-functional-minio.acceptance.test.ts) |
| `WEB4_OWN_PG_MINIO_WORKER` | [`packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-pg-minio-worker.acceptance.test.ts) |
| `WEB4_OWN_VIDEO_PG_MINIO_WORKER` | [`packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts`](../../packages/core/src/services/feed/web4-owned-video-pg-minio.acceptance.test.ts) |
| `WEB4_PROVISION_PRIVATE_S3` | [`scripts/refactor/web4-s3-buckets-init.ts`](../../scripts/refactor/web4-s3-buckets-init.ts) |
| `WEB4_REACTION_WORK_PG` | [`packages/core/src/services/feed/web4-reaction-wallet.work.realpg.test.ts`](../../packages/core/src/services/feed/web4-reaction-wallet.work.realpg.test.ts) |
| `WEB4_REAL_WORK_PG` | [`packages/core/src/services/feed/web4-polls.work.realpg.test.ts`](../../packages/core/src/services/feed/web4-polls.work.realpg.test.ts) |
| `WEB4_VIDEO120_BROWSER_HTTP` | [`apps/api/src/test/web4-video120-3501-browser.acceptance.ts`](../../apps/api/src/test/web4-video120-3501-browser.acceptance.ts) |
| `WEB4_VIDEO120_WORK_HTTP` | [`apps/api/src/test/web4-video120-real-work-http.acceptance.ts`](../../apps/api/src/test/web4-video120-real-work-http.acceptance.ts) |
| `WEB4_VIDEO_120_SOURCE_REAL` | [`scripts/refactor/web4-120-video-source-real.acceptance.ts`](../../scripts/refactor/web4-120-video-source-real.acceptance.ts) |
| `WEB4_WALLET_WORK_PG` | [`packages/core/src/services/feed/web4-wallet.work.realpg.test.ts`](../../packages/core/src/services/feed/web4-wallet.work.realpg.test.ts) |
| `WEB_APP_URL` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts), [`apps/api/src/routes/v1/auth-vk-web.ts`](../../apps/api/src/routes/v1/auth-vk-web.ts) (ещё 1) |
| `WELCOME_EMAIL_IOS_APP_URL` | [`packages/core/src/services/auth/transactionalAuthMail.ts`](../../packages/core/src/services/auth/transactionalAuthMail.ts) |
| `WORKER_HEALTH_PORT` | [`packages/worker/src/health-server.ts`](../../packages/worker/src/health-server.ts) |
| `YC_ACCESS_KEY_ID` | [`packages/cdn-upload/src/uploadToCDN.ts`](../../packages/cdn-upload/src/uploadToCDN.ts) |
| `YC_SECRET_ACCESS_KEY` | [`packages/cdn-upload/src/uploadToCDN.ts`](../../packages/cdn-upload/src/uploadToCDN.ts) |
| `YOOKASSA_SECRET_KEY` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts), [`apps/api/src/routes/v1/payment-provider-webhooks.test.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.test.ts) (ещё 4) |
| `YOOKASSA_SHOP_ID` | [`apps/api/src/routes/v1/app-subscription.route.test.ts`](../../apps/api/src/routes/v1/app-subscription.route.test.ts), [`apps/api/src/routes/v1/app-subscription.ts`](../../apps/api/src/routes/v1/app-subscription.ts), [`apps/api/src/routes/v1/payment-provider-webhooks.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.ts) (ещё 3) |
| `YOOKASSA_SKIP_IP_CHECK` | [`apps/api/src/routes/v1/payment-provider-webhooks.test.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.test.ts), [`apps/api/src/routes/v1/payment-provider-webhooks.ts`](../../apps/api/src/routes/v1/payment-provider-webhooks.ts) |

Найдено уникальных имён: **578**.
