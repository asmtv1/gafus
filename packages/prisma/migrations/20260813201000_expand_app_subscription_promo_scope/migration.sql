-- Do not edit the original promo-code migration: replace only its scope
-- constraint so promotions remain initial YooKassa-only and are unavailable
-- for the 14-day tariff and every renewal.
ALTER TABLE "AppSubscriptionPayment"
  DROP CONSTRAINT "AppSubscriptionPayment_promo_scope_check";

ALTER TABLE "AppSubscriptionPayment"
  ADD CONSTRAINT "AppSubscriptionPayment_promo_scope_check" CHECK (
    "promoCodeId" IS NULL
    OR (
      "provider" = 'YOOKASSA'
      AND "kind" = 'INITIAL'
      AND "planCode" IN ('MONTHLY', 'THREE_MONTHS')
      AND "currency" = 'RUB'
    )
  );
