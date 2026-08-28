import { authOptions } from "@gafus/auth";
import {
  getAppSubscriptionAdminDashboard,
  getAppSubscriptionPaymentHistory,
  getAppSubscriptionPromoCodesAdmin,
  type AppSubscriptionAdminDashboard,
  type AppSubscriptionPaymentHistoryPage,
  type AppSubscriptionPaymentHistoryStatus,
  type AppSubscriptionPromoCodeAdminItem,
  getNpdAdminPage,
  type NpdAdminPage,
} from "@gafus/core/services/appSubscription";
import { createAdminPanelLogger } from "@gafus/logger";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createAdminPanelLogger("get-app-subscription-dashboard");

export type AppSubscriptionDashboard = AppSubscriptionAdminDashboard;
export type AppSubscriptionDashboardRow = AppSubscriptionAdminDashboard["rows"][number];

export type AppSubscriptionAdminPageData = {
  role: "ADMIN" | "MODERATOR";
  dashboard: AppSubscriptionAdminDashboard | null;
  paymentHistory: AppSubscriptionPaymentHistoryPage | null;
  promoCodes: AppSubscriptionPromoCodeAdminItem[] | null;
  npd: NpdAdminPage | null;
};

async function requireAppSubscriptionReader() {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") redirect("/");
  return session.user.role;
}

export async function getAdminAppSubscriptionDashboard(): Promise<AppSubscriptionAdminDashboard> {
  await requireAppSubscriptionReader();

  try {
    return await getAppSubscriptionAdminDashboard();
  } catch (error) {
    logger.error("Ошибка при получении dashboard подписок", error as Error);
    throw error;
  }
}

export async function getAdminAppSubscriptionPageData(params: {
  tab: "payments" | "promo-codes" | "npd";
  paymentPage: number;
  paymentPageSize: number;
  paymentStatus?: AppSubscriptionPaymentHistoryStatus;
  paymentSearch?: string;
  includeArchived: boolean;
  npdPage: number;
  npdPageSize: number;
  npdStatus?: import("@gafus/core/services/appSubscription").NpdAdminReceiptStatus;
  npdSearch?: string;
  npdFrom?: Date;
  npdTo?: Date;
}): Promise<AppSubscriptionAdminPageData> {
  const role = await requireAppSubscriptionReader();

  try {
    if (params.tab === "promo-codes") {
      return {
        role,
        dashboard: null,
        paymentHistory: null,
        promoCodes: await getAppSubscriptionPromoCodesAdmin({
          includeArchived: params.includeArchived,
        }),
        npd: null,
      };
    }

    if (params.tab === "npd") {
      return { role, dashboard: null, paymentHistory: null, promoCodes: null, npd: await getNpdAdminPage({ role, page: params.npdPage, pageSize: params.npdPageSize, status: params.npdStatus, search: params.npdSearch, from: params.npdFrom, to: params.npdTo }) };
    }

    const [dashboard, paymentHistory] = await Promise.all([
      getAppSubscriptionAdminDashboard(),
      getAppSubscriptionPaymentHistory({
        page: params.paymentPage,
        pageSize: params.paymentPageSize,
        status: params.paymentStatus,
        search: params.paymentSearch,
      }),
    ]);
    return { role, dashboard, paymentHistory, promoCodes: null, npd: null };
  } catch (error) {
    logger.error("Ошибка при получении данных раздела Premium", error as Error);
    throw error;
  }
}
