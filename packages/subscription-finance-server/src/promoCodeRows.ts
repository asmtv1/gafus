/**
 * Persistence-only subscription promotion port.
 * The Core module owns validation, eligibility, revision policy, event meaning
 * and public DTOs. This adapter owns all Prisma reads and SERIALIZABLE writes.
 */
import {
  Prisma,
  prisma,
  type AppSubscriptionPromoCode,
  type AppSubscriptionPromoCodeEventType,
} from "@gafus/prisma";

export type PromoCodeRecord = AppSubscriptionPromoCode;
export type PromoCodeEventType = AppSubscriptionPromoCodeEventType;

export type PromoCodeEventRecord = {
  promoCodeId: string;
  actorId: string;
  type: PromoCodeEventType;
  discountPercent: number;
  isActive: boolean;
  revision: number;
  createdAt?: Date;
};
export type PromoCodeNewRecord = {
  code: string;
  normalizedCode: string;
  discountPercent: number;
  isActive: boolean;
  actorId: string;
};
export type PromoCodeRecordPatch = {
  actorId: string;
  discountPercent?: number;
  isActive?: boolean;
  archivedAt?: Date;
};
export type PromoCodeRecordsTransaction = {
  find(id: string): Promise<PromoCodeRecord | null>;
  create(record: PromoCodeNewRecord): Promise<PromoCodeRecord>;
  update(id: string, patch: PromoCodeRecordPatch): Promise<PromoCodeRecord>;
  appendEvent(record: PromoCodeEventRecord): Promise<void>;
  appendEvents(records: PromoCodeEventRecord[]): Promise<void>;
};

export async function userHasSuccessfulPromoBlockingPayment(userId: string): Promise<boolean> {
  const payment = await prisma.appSubscriptionPayment.findFirst({
    where: {
      userId,
      provider: "YOOKASSA",
      OR: [{ status: { in: ["SUCCEEDED", "REFUNDED"] } }, { succeededAt: { not: null } }],
    },
    select: { id: true },
  });
  return payment !== null;
}

export async function readPromoSettingsRow() {
  return prisma.appSubscriptionSettings.findUnique({ where: { key: "default" } });
}

export async function readPromoCodeByNormalizedCode(normalizedCode: string) {
  return prisma.appSubscriptionPromoCode.findUnique({ where: { normalizedCode } });
}

export function isUniquePromoCodeError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function withPromoCodeRecordsTransaction<T>(
  operation: (rows: PromoCodeRecordsTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) =>
      operation({
        find: (id) => tx.appSubscriptionPromoCode.findUnique({ where: { id } }),
        create: ({ actorId, ...record }) =>
          tx.appSubscriptionPromoCode.create({
            data: { ...record, revision: 1, createdById: actorId, updatedById: actorId },
          }),
        update: (id, patch) =>
          tx.appSubscriptionPromoCode.update({
            where: { id },
            data: {
              discountPercent: patch.discountPercent,
              isActive: patch.isActive,
              ...(patch.archivedAt === undefined ? {} : { archivedAt: patch.archivedAt }),
              revision: { increment: 1 },
              updatedById: patch.actorId,
            },
          }),
        appendEvent: async (record) => {
          await tx.appSubscriptionPromoCodeEvent.create({ data: record });
        },
        appendEvents: async (records) => {
          await tx.appSubscriptionPromoCodeEvent.createMany({ data: records });
        },
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
