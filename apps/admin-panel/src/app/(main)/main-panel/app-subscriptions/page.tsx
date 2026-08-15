import { z } from "zod";

import PageLayout from "@/shared/components/PageLayout";
import { getAdminAppSubscriptionPageData } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";

import PremiumSubscriptionsClient from "./PremiumSubscriptionsClient";

const searchParamsSchema = z.object({
  tab: z.enum(["payments", "promo-codes"]).catch("payments"),
  paymentPage: z.coerce.number().int().min(1).catch(1),
  paymentPageSize: z
    .preprocess(
      (value) => Number(value),
      z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
    )
    .catch(25),
  paymentStatus: z
    .enum(["SUCCEEDED", "PENDING", "CANCELED", "FAILED", "REFUNDED"])
    .optional()
    .catch(undefined),
  paymentSearch: z.string().trim().max(128).optional().catch(undefined),
  includeArchived: z.enum(["1", "true"]).optional().catch(undefined),
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AppSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = searchParamsSchema.parse({
    tab: first(raw.tab),
    paymentPage: first(raw.paymentPage),
    paymentPageSize: first(raw.paymentPageSize),
    paymentStatus: first(raw.paymentStatus),
    paymentSearch: first(raw.paymentSearch),
    includeArchived: first(raw.includeArchived),
  });
  const data = await getAdminAppSubscriptionPageData({
    tab: query.tab,
    paymentPage: query.paymentPage,
    paymentPageSize: query.paymentPageSize,
    paymentStatus: query.paymentStatus,
    paymentSearch: query.paymentSearch,
    includeArchived: Boolean(query.includeArchived),
  });

  return (
    <PageLayout
      title="Подписки Gafus Premium"
      subtitle="Оплаты, доступ пользователей и управление промокодами"
    >
      <PremiumSubscriptionsClient
        activeTab={query.tab}
        role={data.role}
        dashboard={data.dashboard}
        paymentHistory={data.paymentHistory}
        promoCodes={data.promoCodes}
        paymentStatus={query.paymentStatus ?? "all"}
        paymentSearch={query.paymentSearch ?? ""}
        includeArchived={Boolean(query.includeArchived)}
      />
    </PageLayout>
  );
}
