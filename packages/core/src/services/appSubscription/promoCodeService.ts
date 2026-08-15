import {
  Prisma,
  prisma,
  type AppSubscriptionPromoCode,
  type AppSubscriptionPromoCodeEventType,
} from "@gafus/prisma";

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

type PromoCodeTransactionClient = Pick<
  Prisma.TransactionClient,
  "appSubscriptionPromoCode" | "appSubscriptionPromoCodeEvent"
>;

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
  const priorSuccessfulPayment = await prisma.appSubscriptionPayment.findFirst({
    where: {
      userId,
      provider: "YOOKASSA",
      OR: [{ status: { in: ["SUCCEEDED", "REFUNDED"] } }, { succeededAt: { not: null } }],
    },
    select: { id: true },
  });
  return priorSuccessfulPayment === null;
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
    prisma.appSubscriptionSettings.findUnique({ where: { key: "default" } }),
    prisma.appSubscriptionPromoCode.findUnique({
      where: { normalizedCode: identity.normalizedCode },
    }),
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

async function inPromoCodeTransaction<T>(
  operation: (tx: PromoCodeTransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

async function findMutablePromoCode(
  tx: PromoCodeTransactionClient,
  id: string,
): Promise<AppSubscriptionPromoCode> {
  const promoCode = await tx.appSubscriptionPromoCode.findUnique({ where: { id } });
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
    return await inPromoCodeTransaction(async (tx) => {
      const promoCode = await tx.appSubscriptionPromoCode.create({
        data: {
          ...identity,
          discountPercent,
          isActive: params.isActive,
          revision: 1,
          createdById: params.actorId,
          updatedById: params.actorId,
        },
      });

      await tx.appSubscriptionPromoCodeEvent.create({
        data: eventSnapshot({
          promoCode,
          actorId: params.actorId,
          type: "CREATED",
        }),
      });

      return promoCode;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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

  return inPromoCodeTransaction(async (tx) => {
    const current = await findMutablePromoCode(tx, params.id);
    const discountChanged =
      requestedDiscount !== undefined && requestedDiscount !== current.discountPercent;
    const activeChanged = params.isActive !== undefined && params.isActive !== current.isActive;

    if (!discountChanged && !activeChanged) return current;

    const promoCode = await tx.appSubscriptionPromoCode.update({
      where: { id: current.id },
      data: {
        discountPercent: discountChanged ? requestedDiscount : undefined,
        isActive: activeChanged ? params.isActive : undefined,
        revision: { increment: 1 },
        updatedById: params.actorId,
      },
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

    await tx.appSubscriptionPromoCodeEvent.createMany({ data: events });
    return promoCode;
  });
}

export async function archiveAppSubscriptionPromoCode(params: {
  id: string;
  actorId: string;
  archivedAt?: Date;
}): Promise<AppSubscriptionPromoCode> {
  const archivedAt = params.archivedAt ?? new Date();

  return inPromoCodeTransaction(async (tx) => {
    const current = await findMutablePromoCode(tx, params.id);
    const promoCode = await tx.appSubscriptionPromoCode.update({
      where: { id: current.id },
      data: {
        isActive: false,
        archivedAt,
        revision: { increment: 1 },
        updatedById: params.actorId,
      },
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

    await tx.appSubscriptionPromoCodeEvent.createMany({ data: events });
    return promoCode;
  });
}
