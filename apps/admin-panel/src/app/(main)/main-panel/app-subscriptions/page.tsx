import { z } from "zod";

import PageLayout from "@/shared/components/PageLayout";
import { getAdminAppSubscriptionPageData } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";

import PremiumSubscriptionsClient from "./PremiumSubscriptionsClient";

const searchParamsSchema = z.object({
  tab: z.enum(["payments", "promo-codes", "npd"]).catch("payments"),
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
  npdPage: z.coerce.number().int().min(1).catch(1),
  npdPageSize: z.preprocess((value) => Number(value), z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])).catch(25),
  npdStatus: z.enum(["PENDING", "ISSUED", "CANCEL_PENDING", "CANCELED", "RECONCILIATION_REQUIRED", "FAILED"]).optional().catch(undefined),
  npdSearch: z.string().trim().max(128).optional().catch(undefined),
  npdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  npdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
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
    npdPage: first(raw.npdPage), npdPageSize: first(raw.npdPageSize), npdStatus: first(raw.npdStatus), npdSearch: first(raw.npdSearch), npdFrom: first(raw.npdFrom), npdTo: first(raw.npdTo),
  });
  const data = await getAdminAppSubscriptionPageData({
    tab: query.tab,
    paymentPage: query.paymentPage,
    paymentPageSize: query.paymentPageSize,
    paymentStatus: query.paymentStatus,
    paymentSearch: query.paymentSearch,
    includeArchived: Boolean(query.includeArchived),
    npdPage: query.npdPage, npdPageSize: query.npdPageSize, npdStatus: query.npdStatus, npdSearch: query.npdSearch,
    npdFrom: query.npdFrom ? new Date(`${query.npdFrom}T00:00:00.000Z`) : undefined,
    npdTo: query.npdTo ? new Date(`${query.npdTo}T00:00:00.000Z`) : undefined,
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
        npd={data.npd}
        npdStatus={query.npdStatus ?? ""}
        npdSearch={query.npdSearch ?? ""}
        npdFrom={query.npdFrom ?? ""}
        npdTo={query.npdTo ?? ""}
      />
    </PageLayout>
  );
}
