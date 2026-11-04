-- GAFUS REVIEW-ONLY BOOTSTRAP: fresh, empty DB, NOT production migrations.
-- Historical SQL has been transplanted from unmodified migration files.
-- Apply ONLY after 000-current-prisma-schema.candidate.sql.

-- source: 20260126010000_add_note_entries (extension uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_original_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_original_amount_check" CHECK (
    "originalAmount" IS NULL OR ("amount" IS NOT NULL AND "originalAmount" >= 0)
  );

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionPayment_period_order_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_period_order_check" CHECK (
    "periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" > "periodStart"
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_amount_check" CHECK (
    "promoCodeId" IS NULL
    OR "amount" = ROUND(
      "originalAmount" * (100 - "promoDiscountPercent") / 100,
      2
    )
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_discount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_discount_check" CHECK (
    "promoDiscountPercent" IS NULL
    OR (
      "promoDiscountPercent" BETWEEN 1 AND 50
      AND "promoDiscountPercent" = TRUNC("promoDiscountPercent")
    )
  );

-- source: 20260813201000_expand_app_subscription_promo_scope (CHECK AppSubscriptionPayment_promo_scope_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_scope_check" CHECK (
    "promoCodeId" IS NULL
    OR (
      "provider" = 'YOOKASSA'
      AND "kind" = 'INITIAL'
      AND "planCode" IN ('MONTHLY', 'THREE_MONTHS')
      AND "currency" = 'RUB'
    )
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_snapshot_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_snapshot_check" CHECK (
    (
      "promoCodeId" IS NULL
      AND "promoCodeSnapshot" IS NULL
      AND "promoDiscountPercent" IS NULL
    )
    OR
    (
      "promoCodeId" IS NOT NULL
      AND "promoCodeSnapshot" IS NOT NULL
      AND "promoDiscountPercent" IS NOT NULL
      AND "originalAmount" IS NOT NULL
      AND "amount" IS NOT NULL
    )
  );

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionPayment_yookassa_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_yookassa_amount_check" CHECK (
    "provider" <> 'YOOKASSA' OR ("amount" IS NOT NULL AND "currency" = 'RUB')
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCodeEvent_discountPercent_check)
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCodeEvent_revision_check)
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_revision_check" CHECK ("revision" >= 1);

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_archived_inactive_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_archived_inactive_check" CHECK (
    "archivedAt" IS NULL OR "isActive" = false
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_code_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_code_check" CHECK (
    "code" = BTRIM("code")
    AND LENGTH("code") BETWEEN 1 AND 64
    AND "code" ~ '^[A-Za-z0-9_-]+$'
    AND "normalizedCode" = UPPER("code")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_discountPercent_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_revision_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_revision_check" CHECK ("revision" >= 1);

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionSettings_currency_check)
ALTER TABLE "AppSubscriptionSettings" ADD CONSTRAINT "AppSubscriptionSettings_currency_check" CHECK ("currency" = 'RUB');

-- source: 20261004120000_subscription_agreement_terms (CHECK AppSubscription_renewal_terms_positive)
ALTER TABLE "AppSubscription" ADD CONSTRAINT "AppSubscription_renewal_terms_positive" CHECK (("renewalPriceRub" IS NULL OR "renewalPriceRub" > 0)
    AND ("renewalIntervalDays" IS NULL OR "renewalIntervalDays" > 0));

-- source: 20261022153000_course_version_global_trigger (CHECK Course_version_positive)
ALTER TABLE "Course" ADD CONSTRAINT "Course_version_positive" CHECK ("version" > 0);

-- source: 20261010200000_smart_feed_events (CHECK FeedRankingEvent_duration_chk)
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_duration_chk" CHECK ("durationMs" >= 0 AND "durationMs" <= 120000);

-- source: 20261010200000_smart_feed_events (CHECK FeedRankingEvent_kind_chk)
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_kind_chk" CHECK ("kind" IN ('dwell','post_open','profile_open'));

-- source: 20261029173500_feed_comment_media (CHECK FeedUpload_purpose_check)
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_purpose_check" CHECK ("purpose" IN ('post', 'comment'));

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionMilestone_threshold_positive)
ALTER TABLE "GafusPostReactionMilestone" ADD CONSTRAINT "GafusPostReactionMilestone_threshold_positive" CHECK ("threshold" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionProgram_highwater_nonnegative)
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_highwater_nonnegative" CHECK ("highWaterReactionCount" >= 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionProgram_threshold_positive)
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_threshold_positive" CHECK ("thresholdStep" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusRewardEvent_amount_nonnegative)
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_amount_nonnegative" CHECK ("amount" >= 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusSettings_config_positive)
ALTER TABLE "GafusSettings" ADD CONSTRAINT "GafusSettings_config_positive" CHECK ("activityLimit" >= 0 AND "activityWindowSeconds" > 0 AND "reactionThreshold" > 0 AND "accessDurationSeconds" > 0 AND "postReward" >= 0 AND "questionReward" >= 0 AND "answerReward" >= 0 AND "reactionReward" >= 0 AND "bestAnswerReward" >= 0 AND "courseStepCost" > 0 AND "miniGuideCost" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusTargetAccess_positive_duration)
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_positive_duration" CHECK ("expiresAt" > "grantedAt");

-- source: 20261021135000_gafus_article_access (CHECK GafusTargetAccess_target_shape)
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_target_shape" CHECK (
  ("targetType"::text = 'COURSE_STEP' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL)
  OR ("targetType"::text = 'MINI_GUIDE' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL)
  OR ("targetType"::text = 'ARTICLE' AND "courseId" IS NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL AND "targetKey" LIKE 'article:%')
);

-- source: 20261010190000_add_gafus_economy (CHECK GafusTransaction_balances_valid)
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_balances_valid" CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0 AND "balanceAfter" = "balanceBefore" + "delta");

-- source: 20261010190000_add_gafus_economy (CHECK GafusTransaction_delta_nonzero)
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_delta_nonzero" CHECK ("delta" <> 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusWallet_balance_nonnegative)
ALTER TABLE "GafusWallet" ADD CONSTRAINT "GafusWallet_balance_nonnegative" CHECK ("balance" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_device_id_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_device_id_check" CHECK (length(btrim("deviceId")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_inn_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_inn_check" CHECK ("inn" ~ '^[0-9]{12}$');

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_cipher_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_cipher_check" CHECK (octet_length("refreshTokenCipher") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_iv_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_iv_check" CHECK (octet_length("refreshTokenIv") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_key_version_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_key_version_check" CHECK ("refreshTokenKeyVersion" > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_tag_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_tag_check" CHECK (octet_length("refreshTokenTag") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_singleton_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_singleton_check" CHECK ("id" = 'default');

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_attempt_count_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_attempt_count_check" CHECK ("attemptCount" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_lease_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_recipient_email_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_recipient_email_check" CHECK (length(btrim("recipientEmail")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptOperation_attempt_count_check)
ALTER TABLE "NpdReceiptOperation" ADD CONSTRAINT "NpdReceiptOperation_attempt_count_check" CHECK ("attemptCount" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptOperation_lease_check)
ALTER TABLE "NpdReceiptOperation" ADD CONSTRAINT "NpdReceiptOperation_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_amount_kopecks_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_amount_kopecks_check" CHECK ("amountKopecks" > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_currency_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_currency_check" CHECK ("currency" = 'RUB');

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_interval_days_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_interval_days_check" CHECK ("intervalDays" IN (14, 30, 90));

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_issued_urls_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_issued_urls_check" CHECK (
    "status" <> 'ISSUED' OR ("printUrl" IS NOT NULL AND "jsonUrl" IS NOT NULL)
  );

-- source: 20261022190000_npd_30_day_plan_intervals (CHECK NpdReceipt_plan_interval_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_plan_interval_check" CHECK (
    ("planCode" = 'TWO_WEEKS' AND "intervalDays" IN (14, 30))
    OR ("planCode" = 'MONTHLY' AND "intervalDays" = 30)
    OR ("planCode" = 'THREE_MONTHS' AND "intervalDays" IN (30, 90))
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_service_name_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_service_name_check" CHECK (length(btrim("serviceName")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_urls_paired_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_urls_paired_check" CHECK (
    ("printUrl" IS NULL) = ("jsonUrl" IS NULL)
  );

-- source: 20261017190000_g05_pet_create_receipt (CHECK PetCreateReceipt_payloadHash_format)
ALTER TABLE "PetCreateReceipt" ADD CONSTRAINT "PetCreateReceipt_payloadHash_format" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$');

-- source: 20261017190000_g05_pet_create_receipt (CHECK PetCreateReceipt_responseStatus_check)
ALTER TABLE "PetCreateReceipt" ADD CONSTRAINT "PetCreateReceipt_responseStatus_check" CHECK ("responseStatus" = 201);

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_attempts_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_attempts_check" CHECK ("attempts" >= 0);

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_provider_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_provider_check" CHECK ("provider" IN ('cloudru-documents','isolated-avatar','legacy-yandex'));

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_reason_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_reason_check" CHECK ("reason" IN ('pet-delete','document-delete','candidate','photo-replaced'));

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_status_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_status_check" CHECK ("status" IN ('pending','processing','done'));

-- source: 20261010150000_pet_vet_visits (CHECK PetVetAttachment_size_check)
ALTER TABLE "PetVetAttachment" ADD CONSTRAINT "PetVetAttachment_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);

-- source: 20260813180000_expand_rewarded_daily_limit (CHECK RewardedAdSettings_daily_limit_allowed)
ALTER TABLE "RewardedAdSettings" ADD CONSTRAINT "RewardedAdSettings_daily_limit_allowed" CHECK ("dailyAdLimit" BETWEEN 0 AND 100);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditTransaction_amount_positive)
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_amount_positive" CHECK ("amount" > 0);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditWallet_balance_range)
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_balance_range" CHECK ("balance" >= 0 AND "balance" <= 5);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditWallet_pending_refund_non_negative)
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_pending_refund_non_negative" CHECK ("pendingRefundCredits" >= 0);

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_source_consistency)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_source_consistency" CHECK (
        (
          "source" = 'REWARDED_AD'::"RewardedTargetAccessSource"
          AND "platform" IS NOT NULL
        )
        OR
        (
          "source" = 'LEGACY_GAFUS'::"RewardedTargetAccessSource"
          AND "platform" IS NULL
          AND "sessionId" IS NULL
        )
      );

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_target_id_nonempty)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_target_id_nonempty" CHECK (length(btrim("targetId")) > 0);

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_valid_period)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_valid_period" CHECK ("expiresAt" > "grantedAt");

-- source: 20261018113000_offline_resource_video_history_additive (CHECK off021_video_position_pair_ck)
ALTER TABLE "OfflineResourceRevision" ADD CONSTRAINT "off021_video_position_pair_ck" CHECK (
    ("videoLastPositionSec" IS NULL AND "videoRecordedAt" IS NULL)
    OR
    ("videoLastPositionSec" IS NOT NULL AND "videoRecordedAt" IS NOT NULL
     AND "videoLastPositionSec" BETWEEN 0 AND 2073600)
  );

-- source: 20261010160000_account_storage_cleanup + 20261025155900_account_cleanup_add_private_scopes
-- Explicitly named equivalent of the latest active legacy inline constraints.
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_status_check"
  CHECK ("status" IN ('pending','processing','done'));
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_scope_check"
  CHECK ("scope" IN ('public','gallery','feed','stream','questions','documents'));

-- source: 20260510235500_add_app_subscription (partial index AppSubscriptionEvent_idempotencyKey_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_idempotencyKey_unique"
  ON "AppSubscriptionEvent"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- source: 20260510235500_add_app_subscription (partial index AppSubscriptionEvent_providerEventKey_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_providerEventKey_unique"
  ON "AppSubscriptionEvent"("providerEventKey")
  WHERE "providerEventKey" IS NOT NULL;

-- source: 20260511203000_add_app_subscription_payment_succeeded_at (ordinary index AppSubscriptionPayment_subscriptionId_status_succeededAt_idx)
CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_subscriptionId_status_succeededAt_idx"
  ON "AppSubscriptionPayment"("subscriptionId", "status", "succeededAt");

-- source: 20260510235500_add_app_subscription (ordinary index AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx)
CREATE INDEX IF NOT EXISTS "AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx"
  ON "AppSubscription"("provider", "status", "cancelAtPeriodEnd", "currentPeriodEnd");

-- source: 20260510235500_add_app_subscription (partial index AppSubscription_userId_provider_active_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_userId_provider_active_unique"
  ON "AppSubscription"("userId", "provider")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE');

-- source: 20261027172500_chat2_v2_media_task (partial index Chat2V2MediaTask_cleanup_pending_idx)
CREATE INDEX IF NOT EXISTS "Chat2V2MediaTask_cleanup_pending_idx"
  ON "Chat2V2MediaTask"("cleanupKind","cleanupNextAt","cleanupLeaseUntil")
  WHERE "cleanupKind" IS NOT NULL AND "cleanupCompletedAt" IS NULL;

-- source: 20260421140000_consultation_booking_slot_partial_unique (partial index ConsultationBooking_slotId_active_key)
CREATE UNIQUE INDEX "ConsultationBooking_slotId_active_key"
ON "ConsultationBooking" ("slotId")
WHERE "status" IN ('PENDING_TRAINER_CONFIRMATION', 'CONFIRMED');

-- source: 20260429123000_enforce_pet_document_owner_consistency (ordinary index PetDocument_petId_ownerId_idx)
CREATE INDEX "PetDocument_petId_ownerId_idx" ON "PetDocument"("petId", "ownerId");

-- source: 20261025041500_step_notification_occurrence (partial index StepNotification_active_bound_unique)
CREATE UNIQUE INDEX "StepNotification_active_bound_unique"
  ON "StepNotification" ("userId", "dayOnCourseId", "stepOnDayId")
  WHERE "type" = 'step' AND "sent" = false
    AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION guard_app_subscription_promo_code_identity)
CREATE FUNCTION "guard_app_subscription_promo_code_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  state_changed BOOLEAN;
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."normalizedCode" IS DISTINCT FROM OLD."normalizedCode"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'promo code identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."archivedAt" IS NOT NULL
    AND NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt"
  THEN
    RAISE EXCEPTION 'archived promo code cannot be restored or re-archived' USING ERRCODE = '23514';
  END IF;

  state_changed := NEW."discountPercent" IS DISTINCT FROM OLD."discountPercent"
    OR NEW."isActive" IS DISTINCT FROM OLD."isActive"
    OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt";

  IF state_changed AND NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'promo code state change must increment revision exactly once' USING ERRCODE = '23514';
  END IF;

  IF NOT state_changed AND NEW."revision" <> OLD."revision" THEN
    RAISE EXCEPTION 'promo code revision cannot change without a state change' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION prevent_app_subscription_promo_code_event_mutation)
CREATE FUNCTION "prevent_app_subscription_promo_code_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'promo code events are immutable' USING ERRCODE = '23514';
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION guard_app_subscription_payment_price_snapshot)
CREATE FUNCTION "guard_app_subscription_payment_price_snapshot"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."originalAmount" IS DISTINCT FROM OLD."originalAmount"
    OR NEW."promoCodeId" IS DISTINCT FROM OLD."promoCodeId"
    OR NEW."promoCodeSnapshot" IS DISTINCT FROM OLD."promoCodeSnapshot"
    OR NEW."promoDiscountPercent" IS DISTINCT FROM OLD."promoDiscountPercent"
  THEN
    RAISE EXCEPTION 'app subscription payment price snapshot is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- source: 20261010180000_smart_feed (FUNCTION feed_normalize_profile_city)
CREATE FUNCTION "feed_normalize_profile_city"() RETURNS trigger AS $$
BEGIN
  NEW."cityKey" := CASE WHEN NEW."city" IS NULL THEN NULL
    ELSE NULLIF(LEFT(TRANSLATE(
      LOWER(TRIM(REGEXP_REPLACE(
        NORMALIZE(NEW."city", NFKC), '[[:space:]]+', ' ', 'g'
      ))),
      'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
      'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    ), 160), '') END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- source: 20261010200000_smart_feed_events (FUNCTION feed_normalize_breed_key)
CREATE FUNCTION "feed_normalize_breed_key"(raw TEXT) RETURNS VARCHAR(160) AS $$
DECLARE value TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  value := LEFT(TRANSLATE(
    LOWER(TRIM(REGEXP_REPLACE(NORMALIZE(raw, NFKC), '[[:space:]]+', ' ', 'g'))),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
  ), 160);
  IF value IN ('labrador', 'labrador retriever', 'лабрадор ретривер', 'лабрадор-ретривер') THEN value := 'лабрадор'; END IF;
  IF value IN ('golden', 'golden retriever') THEN value := 'золотистый ретривер'; END IF;
  IF value IN ('йорк', 'yorkshire terrier') THEN value := 'йоркширский терьер'; END IF;
  IF value = 'french bulldog' THEN value := 'французский бульдог'; END IF;
  RETURN NULLIF(value, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- source: 20261010200000_smart_feed_events (FUNCTION feed_normalize_pet_breed)
CREATE FUNCTION "feed_normalize_pet_breed"() RETURNS trigger AS $$
BEGIN
  NEW."breedKey" := "feed_normalize_breed_key"(NEW."breed");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- source: 20261015020000_course_content_revision (FUNCTION gafus_bump_course_content_revision)
CREATE FUNCTION gafus_bump_course_content_revision() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "CourseContentRevision"
       SET "revision" = "revision" + 1
     WHERE "id" = 1;
    RETURN NULL;
END;
$$;

-- source: 20261022153000_course_version_global_trigger (FUNCTION gafus_course_increment_version)
CREATE FUNCTION "gafus_course_increment_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Application code must NEVER bump/set version itself. One UPDATE = one
  -- database increment; explicit client-side increment would double count.
  IF NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Course.version is database-managed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."version" >= 2147483647 THEN
    RAISE EXCEPTION 'Course.version exhausted'
      USING ERRCODE = '22003';
  END IF;
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END
$fn$;

-- source: 20261027011000_chat2_media_deletion_ledger (FUNCTION chat2_capture_media_deletion)
CREATE FUNCTION "chat2_capture_media_deletion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Keep Prisma timestamp(3) values UTC despite database session timezone.
  INSERT INTO "Chat2MediaDeletionIntent"("objectKey", "availableAt", "createdAt")
    VALUES (OLD."objectKey", timezone('UTC', clock_timestamp()), timezone('UTC', clock_timestamp()))
  -- If a reserved/successful upload is subsequently cascaded out, re-arm it.
  ON CONFLICT ("objectKey") DO UPDATE SET
    "status"='PENDING',"availableAt"=timezone('UTC',clock_timestamp()),
    "claimedUntil"=NULL,"completedAt"=NULL,"errorCode"=NULL;
  RETURN NULL;
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPromoCode_identity_guard)
CREATE TRIGGER "AppSubscriptionPromoCode_identity_guard"
BEFORE UPDATE ON "AppSubscriptionPromoCode"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_promo_code_identity"();

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPromoCodeEvent_immutable)
CREATE TRIGGER "AppSubscriptionPromoCodeEvent_immutable"
BEFORE UPDATE OR DELETE ON "AppSubscriptionPromoCodeEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_app_subscription_promo_code_event_mutation"();

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPayment_price_snapshot_guard)
CREATE TRIGGER "AppSubscriptionPayment_price_snapshot_guard"
BEFORE UPDATE ON "AppSubscriptionPayment"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_payment_price_snapshot"();

-- source: 20261010180000_smart_feed (TRIGGER feed_profile_city_key_sync)
CREATE TRIGGER "feed_profile_city_key_sync"
  BEFORE INSERT OR UPDATE OF "city" ON "UserProfile"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_profile_city"();

-- source: 20261010200000_smart_feed_events (TRIGGER feed_pet_breed_key_sync)
CREATE TRIGGER "feed_pet_breed_key_sync"
  BEFORE INSERT OR UPDATE OF "breed" ON "Pet"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_pet_breed"();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_course)
CREATE TRIGGER "course_content_revision_course"
AFTER INSERT OR UPDATE OR DELETE ON "Course"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_day_on_course)
CREATE TRIGGER "course_content_revision_day_on_course"
AFTER INSERT OR UPDATE OR DELETE ON "DayOnCourse"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_training_day)
CREATE TRIGGER "course_content_revision_training_day"
AFTER INSERT OR UPDATE OR DELETE ON "TrainingDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_step_on_day)
CREATE TRIGGER "course_content_revision_step_on_day"
AFTER INSERT OR UPDATE OR DELETE ON "StepOnDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_step)
CREATE TRIGGER "course_content_revision_step"
AFTER INSERT OR UPDATE OR DELETE ON "Step"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261022153000_course_version_global_trigger (TRIGGER Course_global_version_increment)
CREATE TRIGGER "Course_global_version_increment"
  BEFORE UPDATE ON "Course"
  FOR EACH ROW
  EXECUTE FUNCTION "gafus_course_increment_version"();

-- source: 20261027011000_chat2_media_deletion_ledger (TRIGGER chat2_capture_media_deletion_trigger)
CREATE TRIGGER "chat2_capture_media_deletion_trigger"
AFTER DELETE ON "Chat2Media" FOR EACH ROW
EXECUTE FUNCTION "chat2_capture_media_deletion"();
