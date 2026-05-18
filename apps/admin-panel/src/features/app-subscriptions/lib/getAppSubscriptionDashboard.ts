import { authOptions } from "@gafus/auth";
import {
  getAppSubscriptionAdminDashboard,
  type AppSubscriptionAdminDashboard,
} from "@gafus/core/services/appSubscription";
import { createAdminPanelLogger } from "@gafus/logger";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createAdminPanelLogger("get-app-subscription-dashboard");

export type AppSubscriptionDashboard = AppSubscriptionAdminDashboard;
export type AppSubscriptionDashboardRow = AppSubscriptionAdminDashboard["rows"][number];

export async function getAdminAppSubscriptionDashboard(): Promise<AppSubscriptionAdminDashboard> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/");
  }

  try {
    return await getAppSubscriptionAdminDashboard();
  } catch (error) {
    logger.error("Ошибка при получении dashboard подписок", error as Error);
    throw error;
  }
}
