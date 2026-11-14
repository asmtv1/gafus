import { requireSubscriptionPromoPort } from "./promoCodePort";
import type {
  PromoCodeRecord as AppSubscriptionPromoCode,
  PromoCodeEventType as AppSubscriptionPromoCodeEventType,
  PromoCodeRecordsTransaction,
} from "./promoCodePort";

import {
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
  getMobileFeatureFlagEnabled,
  type ClientAppContext,
} from "../appFeatureFlags";
import {
  getAppSubscriptionPlanConfig,
  isPromoEligibleAppSubscriptionPlanCode,
  type AppSubscriptionPlanCode,
} from "./plans";

import {
  calculateAppSubscriptionPromoPrice,
  isValidAppSubscriptionPromoDiscountPercent,
  parseAppSubscriptionPromoCode,
} from "./promoCode";

export type AppSubscriptionPromoCodeDomainErrorCode =
  | "PROMO_CODE_INVALID_FORMAT"
  | "PROMO_CODE_INVALID_DISCOUNT"
  | "PROMO_CODE_DUPLICATE"
  | "PROMO_CODE_NOT_FOUND"
  | "PROMO_CODE_ARCHIVED"
  | "PROMO_CODE_INACTIVE"
  | "PROMO_CODE_NOT_ELIGIBLE"
  | "PROMO_CODE_FEATURE_DISABLED"
  | "PROMO_CODE_CHANGED"
  | "PROMO_CHECKOUT_IN_PROGRESS"
  | "SUBSCRIPTION_ALREADY_ACTIVE"
  | "SUBSCRIPTION_CHECKOUT_IN_PROGRESS"
  | "PROMO_PLAN_NOT_ELIGIBLE";

export class AppSubscriptionPromoCodeDomainError extends Error {
  constructor(
    public readonly code: AppSubscriptionPromoCodeDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppSubscriptionPromoCodeDomainError";
  }
}

export type AppSubscriptionPromoCodePreview = {
  code: string;
  revision: number;
  planCode: Extract<AppSubscriptionPlanCode, "MONTHLY" | "THREE_MONTHS">;
  discountPercent: number;
  originalPriceRub: number;
  discountedPriceRub: number;
  renewalPriceRub: number;
  intervalDays: number;
  currency: "RUB";
};

export type AppSubscriptionPromoCodeOfferState = {
  entryEnabled: boolean;
  eligible: boolean;
};

type PromoCodeEventSnapshot = Pick<
  AppSubscriptionPromoCode,
  "id" | "discountPercent" | "isActive" | "revision"
>;

function requirePromoCodeIdentity(value: unknown) {
  const identity = parseAppSubscriptionPromoCode(value);
  if (!identity) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_INVALID_FORMAT",
      "Промокод должен содержать от 1 до 64 латинских букв, цифр, _ или -",
    );
  }
  return identity;
}

function requireDiscountPercent(value: unknown): number {
  if (!isValidAppSubscriptionPromoDiscountPercent(value)) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_INVALID_DISCOUNT",
      "Скидка должна быть целым числом от 1 до 50",
    );
  }
  return value;
}

export async function isAppSubscriptionPromoCodeEligible(userId: string): Promise<boolean> {
  return !(await requireSubscriptionPromoPort().userHasSuccessfulPromoBlockingPayment(userId));
}

export async function isAppSubscriptionPromoCodeEntryEnabled(
  clientContext: ClientAppContext = { platform: "unknown", version: null },
): Promise<boolean> {
  if (clientContext.platform !== "ios") return true;
  return getMobileFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
    clientContext,
    false,
    false,
  );
}

export async function getAppSubscriptionPromoCodeOfferState(params: {
  userId: string;
  clientContext?: ClientAppContext;
}): Promise<AppSubscriptionPromoCodeOfferState> {
  const [entryEnabled, eligible] = await Promise.all([
    isAppSubscriptionPromoCodeEntryEnabled(params.clientContext),
    isAppSubscriptionPromoCodeEligible(params.userId),
  ]);
  return { entryEnabled, eligible };
}

export async function previewAppSubscriptionPromoCode(params: {
  userId: string;
  planCode: unknown;
  promoCode: unknown;
  clientContext?: ClientAppContext;
}): Promise<AppSubscriptionPromoCodePreview> {
  if (!isPromoEligibleAppSubscriptionPlanCode(params.planCode)) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_PLAN_NOT_ELIGIBLE",
      "Промокод доступен только для тарифов от 1 месяца",
    );
  }
  const identity = requirePromoCodeIdentity(params.promoCode);
  const [entryEnabled, eligible, settings, promoCode] = await Promise.all([
    isAppSubscriptionPromoCodeEntryEnabled(params.clientContext),
    isAppSubscriptionPromoCodeEligible(params.userId),
    requireSubscriptionPromoPort().readPromoSettingsRow(),
    requireSubscriptionPromoPort().readPromoCodeByNormalizedCode(identity.normalizedCode),
  ]);

  if (!entryEnabled) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_FEATURE_DISABLED",
      "Промокоды недоступны в этой версии приложения",
    );
  }
  if (!eligible) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_NOT_ELIGIBLE",
      "Промокод доступен только до первой успешной оплаты Premium через ЮKassa",
    );
  }
  if (!promoCode || promoCode.archivedAt) {
    throw new AppSubscriptionPromoCodeDomainError("PROMO_CODE_NOT_FOUND", "Промокод не найден");
  }
  if (!promoCode.isActive) {
    throw new AppSubscriptionPromoCodeDomainError("PROMO_CODE_INACTIVE", "Промокод выключен");
  }

  const plan = getAppSubscriptionPlanConfig(settings, params.planCode);
  const price = calculateAppSubscriptionPromoPrice(
    plan.yookassaPriceRub,
    promoCode.discountPercent,
  );
  return {
    code: promoCode.code,
    revision: promoCode.revision,
    planCode: params.planCode,
    discountPercent: promoCode.discountPercent,
    originalPriceRub: price.originalPrice.toNumber(),
    discountedPriceRub: price.discountedPrice.toNumber(),
    renewalPriceRub: price.originalPrice.toNumber(),
    intervalDays: plan.intervalDays,
    currency: "RUB",
  };
}

function eventSnapshot(params: {
  promoCode: PromoCodeEventSnapshot;
  actorId: string;
  type: AppSubscriptionPromoCodeEventType;
  createdAt?: Date;
}) {
  return {
    promoCodeId: params.promoCode.id,
    actorId: params.actorId,
    type: params.type,
    discountPercent: params.promoCode.discountPercent,
    isActive: params.promoCode.isActive,
    revision: params.promoCode.revision,
    ...(params.createdAt ? { createdAt: params.createdAt } : {}),
  };
}

async function findMutablePromoCode(
  tx: PromoCodeRecordsTransaction,
  id: string,
): Promise<AppSubscriptionPromoCode> {
  const promoCode = await tx.find(id);
  if (!promoCode) {
    throw new AppSubscriptionPromoCodeDomainError("PROMO_CODE_NOT_FOUND", "Промокод не найден");
  }
  if (promoCode.archivedAt) {
    throw new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_ARCHIVED",
      "Архивированный промокод нельзя изменить",
    );
  }
  return promoCode;
}

export async function createAppSubscriptionPromoCode(params: {
  code: unknown;
  discountPercent: unknown;
  isActive: boolean;
  actorId: string;
}): Promise<AppSubscriptionPromoCode> {
  const identity = requirePromoCodeIdentity(params.code);
  const discountPercent = requireDiscountPercent(params.discountPercent);

  try {
    return await requireSubscriptionPromoPort().withPromoCodeRecordsTransaction(async (tx) => {
      const promoCode = await tx.create({
        ...identity,
        discountPercent,
        isActive: params.isActive,
        actorId: params.actorId,
      });

      await tx.appendEvent(eventSnapshot({ promoCode, actorId: params.actorId, type: "CREATED" }));

      return promoCode;
    });
  } catch (error) {
    if (requireSubscriptionPromoPort().isUniquePromoCodeError(error)) {
      throw new AppSubscriptionPromoCodeDomainError(
        "PROMO_CODE_DUPLICATE",
        "Промокод с таким кодом уже существует, включая архивные",
      );
    }
    throw error;
  }
}

export async function updateAppSubscriptionPromoCode(params: {
  id: string;
  discountPercent?: unknown;
  isActive?: boolean;
  actorId: string;
}): Promise<AppSubscriptionPromoCode> {
  const requestedDiscount =
    params.discountPercent === undefined
      ? undefined
      : requireDiscountPercent(params.discountPercent);

  return requireSubscriptionPromoPort().withPromoCodeRecordsTransaction(async (tx) => {
    const current = await findMutablePromoCode(tx, params.id);
    const discountChanged =
      requestedDiscount !== undefined && requestedDiscount !== current.discountPercent;
    const activeChanged = params.isActive !== undefined && params.isActive !== current.isActive;

    if (!discountChanged && !activeChanged) return current;

    const promoCode = await tx.update(current.id, {
      discountPercent: discountChanged ? requestedDiscount : undefined,
      isActive: activeChanged ? params.isActive : undefined,
      actorId: params.actorId,
    });

    const events = [];
    if (discountChanged) {
      events.push(
        eventSnapshot({
          promoCode,
          actorId: params.actorId,
          type: "UPDATED",
        }),
      );
    }
    if (activeChanged) {
      events.push(
        eventSnapshot({
          promoCode,
          actorId: params.actorId,
          type: promoCode.isActive ? "ENABLED" : "DISABLED",
        }),
      );
    }

    await tx.appendEvents(events);
    return promoCode;
  });
}

export async function archiveAppSubscriptionPromoCode(params: {
  id: string;
  actorId: string;
  archivedAt?: Date;
}): Promise<AppSubscriptionPromoCode> {
  const archivedAt = params.archivedAt ?? new Date();

  return requireSubscriptionPromoPort().withPromoCodeRecordsTransaction(async (tx) => {
    const current = await findMutablePromoCode(tx, params.id);
    const promoCode = await tx.update(current.id, {
      isActive: false,
      archivedAt,
      actorId: params.actorId,
    });

    const events = [];
    if (current.isActive) {
      events.push(
        eventSnapshot({
          promoCode,
          actorId: params.actorId,
          type: "DISABLED",
          createdAt: archivedAt,
        }),
      );
    }
    events.push(
      eventSnapshot({
        promoCode,
        actorId: params.actorId,
        type: "ARCHIVED",
        createdAt: archivedAt,
      }),
    );

    await tx.appendEvents(events);
    return promoCode;
  });
}
