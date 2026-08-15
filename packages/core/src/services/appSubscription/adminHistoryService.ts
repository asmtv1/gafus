import { prisma } from "@gafus/prisma";
import type {
  Prisma,
  AppSubscriptionPaymentStatus,
  AppSubscriptionPromoCodeEventType,
} from "@gafus/prisma";

export const APP_SUBSCRIPTION_PAYMENT_HISTORY_STATUSES = [
  "SUCCEEDED",
  "PENDING",
  "CANCELED",
  "FAILED",
  "REFUNDED",
] as const satisfies readonly AppSubscriptionPaymentStatus[];

export type AppSubscriptionPaymentHistoryStatus =
  (typeof APP_SUBSCRIPTION_PAYMENT_HISTORY_STATUSES)[number];

export interface AppSubscriptionPaymentHistoryItem {
  id: string;
  subscriptionId: string | null;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
  };
  provider: string;
  kind: string;
  status: AppSubscriptionPaymentHistoryStatus;
  planCode: string;
  promoCodeSnapshot: string | null;
  promoDiscountPercent: number | null;
  originalAmountRub: number | null;
  amountRub: number | null;
  currency: string | null;
  yookassaPaymentId: string | null;
  failureReason: string | null;
  succeededAt: string | null;
  createdAt: string;
}

export interface AppSubscriptionPaymentHistoryPage {
  items: AppSubscriptionPaymentHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function decimalToNumber(value: Prisma.Decimal | number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getAppSubscriptionPaymentHistory(params?: {
  page?: number;
  pageSize?: number;
  status?: AppSubscriptionPaymentHistoryStatus;
  search?: string;
}): Promise<AppSubscriptionPaymentHistoryPage> {
  const page = Math.max(1, Math.trunc(params?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(params?.pageSize ?? 25)));
  const search = params?.search?.trim().slice(0, 128) ?? "";

  const where: Prisma.AppSubscriptionPaymentWhereInput = {
    status: params?.status ? params.status : { in: [...APP_SUBSCRIPTION_PAYMENT_HISTORY_STATUSES] },
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { yookassaPaymentId: { contains: search, mode: "insensitive" } },
            { promoCodeSnapshot: { contains: search, mode: "insensitive" } },
            {
              user: {
                is: {
                  OR: [
                    { username: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                    {
                      profile: {
                        is: { fullName: { contains: search, mode: "insensitive" } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.appSubscriptionPayment.count({ where }),
    prisma.appSubscriptionPayment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        subscriptionId: true,
        provider: true,
        kind: true,
        status: true,
        planCode: true,
        promoCodeSnapshot: true,
        promoDiscountPercent: true,
        originalAmount: true,
        amount: true,
        currency: true,
        yookassaPaymentId: true,
        failureReason: true,
        succeededAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      user: {
        id: row.user.id,
        username: row.user.username,
        fullName: row.user.profile?.fullName ?? null,
        email: row.user.email,
        phone: row.user.phone,
      },
      provider: row.provider,
      kind: row.kind,
      status: row.status,
      planCode: row.planCode,
      promoCodeSnapshot: row.promoCodeSnapshot,
      promoDiscountPercent: row.promoDiscountPercent,
      originalAmountRub: decimalToNumber(row.originalAmount),
      amountRub: decimalToNumber(row.amount),
      currency: row.currency,
      yookassaPaymentId: row.yookassaPaymentId,
      failureReason: row.failureReason,
      succeededAt: row.succeededAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface AppSubscriptionPromoCodeAdminEvent {
  id: string;
  type: AppSubscriptionPromoCodeEventType;
  discountPercent: number;
  isActive: boolean;
  revision: number;
  createdAt: string;
  actor: { id: string; username: string; fullName: string | null } | null;
}

export interface AppSubscriptionPromoCodeAdminItem {
  id: string;
  code: string;
  discountPercent: number;
  isActive: boolean;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastEnabledAt: string | null;
  lastDisabledAt: string | null;
  events: AppSubscriptionPromoCodeAdminEvent[];
}

export async function getAppSubscriptionPromoCodesAdmin(params?: {
  includeArchived?: boolean;
}): Promise<AppSubscriptionPromoCodeAdminItem[]> {
  const rows = await prisma.appSubscriptionPromoCode.findMany({
    where: params?.includeArchived ? undefined : { archivedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      code: true,
      discountPercent: true,
      isActive: true,
      revision: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          type: true,
          discountPercent: true,
          isActive: true,
          revision: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              username: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const events = row.events.map((event) => ({
      id: event.id,
      type: event.type,
      discountPercent: event.discountPercent,
      isActive: event.isActive,
      revision: event.revision,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor
        ? {
            id: event.actor.id,
            username: event.actor.username,
            fullName: event.actor.profile?.fullName ?? null,
          }
        : null,
    }));
    const enabledEvent = events.find(
      (event) => event.type === "ENABLED" || (event.type === "CREATED" && event.isActive),
    );
    const disabledEvent = events.find((event) => event.type === "DISABLED");

    return {
      id: row.id,
      code: row.code,
      discountPercent: row.discountPercent,
      isActive: row.isActive,
      revision: row.revision,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastEnabledAt: enabledEvent?.createdAt ?? null,
      lastDisabledAt: disabledEvent?.createdAt ?? null,
      events,
    };
  });
}
