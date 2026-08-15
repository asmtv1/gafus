CREATE TYPE "AppSubscriptionPromoCodeEventType" AS ENUM (
  'CREATED',
  'UPDATED',
  'ENABLED',
  'DISABLED',
  'ARCHIVED'
);

CREATE TABLE "AppSubscriptionPromoCode" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "normalizedCode" VARCHAR(64) NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppSubscriptionPromoCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppSubscriptionPromoCode_code_check" CHECK (
    "code" = BTRIM("code")
    AND LENGTH("code") BETWEEN 1 AND 64
    AND "code" ~ '^[A-Za-z0-9_-]+$'
    AND "normalizedCode" = UPPER("code")
  ),
  CONSTRAINT "AppSubscriptionPromoCode_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  ),
  CONSTRAINT "AppSubscriptionPromoCode_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "AppSubscriptionPromoCode_archived_inactive_check" CHECK (
    "archivedAt" IS NULL OR "isActive" = false
  )
);

CREATE UNIQUE INDEX "AppSubscriptionPromoCode_normalizedCode_key"
  ON "AppSubscriptionPromoCode"("normalizedCode");
CREATE INDEX "AppSubscriptionPromoCode_isActive_archivedAt_idx"
  ON "AppSubscriptionPromoCode"("isActive", "archivedAt");
CREATE INDEX "AppSubscriptionPromoCode_createdAt_idx"
  ON "AppSubscriptionPromoCode"("createdAt");

CREATE TABLE "AppSubscriptionPromoCodeEvent" (
  "id" TEXT NOT NULL,
  "promoCodeId" TEXT NOT NULL,
  "type" "AppSubscriptionPromoCodeEventType" NOT NULL,
  "actorId" TEXT,
  "discountPercent" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "revision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AppSubscriptionPromoCodeEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppSubscriptionPromoCodeEvent_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  ),
  CONSTRAINT "AppSubscriptionPromoCodeEvent_revision_check" CHECK ("revision" >= 1)
);

CREATE INDEX "AppSubscriptionPromoCodeEvent_promoCodeId_createdAt_idx"
  ON "AppSubscriptionPromoCodeEvent"("promoCodeId", "createdAt");
CREATE INDEX "AppSubscriptionPromoCodeEvent_actorId_idx"
  ON "AppSubscriptionPromoCodeEvent"("actorId");

ALTER TABLE "AppSubscriptionPayment"
  ADD COLUMN "promoCodeId" TEXT,
  ADD COLUMN "promoCodeSnapshot" VARCHAR(64),
  ADD COLUMN "promoDiscountPercent" INTEGER,
  ADD COLUMN "originalAmount" DECIMAL(12,3);

ALTER TABLE "AppSubscriptionPayment"
  ADD CONSTRAINT "AppSubscriptionPayment_promo_snapshot_check" CHECK (
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
  ),
  ADD CONSTRAINT "AppSubscriptionPayment_promo_discount_check" CHECK (
    "promoDiscountPercent" IS NULL
    OR (
      "promoDiscountPercent" BETWEEN 1 AND 50
      AND "promoDiscountPercent" = TRUNC("promoDiscountPercent")
    )
  ),
  ADD CONSTRAINT "AppSubscriptionPayment_original_amount_check" CHECK (
    "originalAmount" IS NULL OR ("amount" IS NOT NULL AND "originalAmount" >= 0)
  ),
  ADD CONSTRAINT "AppSubscriptionPayment_promo_scope_check" CHECK (
    "promoCodeId" IS NULL
    OR (
      "provider" = 'YOOKASSA'
      AND "kind" = 'INITIAL'
      AND "planCode" = 'MONTHLY'
      AND "currency" = 'RUB'
    )
  ),
  ADD CONSTRAINT "AppSubscriptionPayment_promo_amount_check" CHECK (
    "promoCodeId" IS NULL
    OR "amount" = ROUND(
      "originalAmount" * (100 - "promoDiscountPercent") / 100,
      2
    )
  );

CREATE INDEX "AppSubscriptionPayment_promoCodeId_idx"
  ON "AppSubscriptionPayment"("promoCodeId");

ALTER TABLE "AppSubscriptionPromoCode"
  ADD CONSTRAINT "AppSubscriptionPromoCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AppSubscriptionPromoCode_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppSubscriptionPromoCodeEvent"
  ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppSubscriptionPayment"
  ADD CONSTRAINT "AppSubscriptionPayment_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

CREATE TRIGGER "AppSubscriptionPromoCode_identity_guard"
BEFORE UPDATE ON "AppSubscriptionPromoCode"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_promo_code_identity"();

CREATE FUNCTION "prevent_app_subscription_promo_code_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'promo code events are immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "AppSubscriptionPromoCodeEvent_immutable"
BEFORE UPDATE OR DELETE ON "AppSubscriptionPromoCodeEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_app_subscription_promo_code_event_mutation"();

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

CREATE TRIGGER "AppSubscriptionPayment_price_snapshot_guard"
BEFORE UPDATE ON "AppSubscriptionPayment"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_payment_price_snapshot"();
