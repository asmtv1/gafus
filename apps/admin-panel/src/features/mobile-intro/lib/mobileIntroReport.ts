import { authOptions } from "@gafus/auth";
import {
  getMobileIntroReport,
  type MobileIntroReport,
} from "@gafus/core/services/mobileIntro";
import { createAdminPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

const logger = createAdminPanelLogger("get-mobile-intro-report");

export type { MobileIntroReport };

export async function getAdminMobileIntroReport(range: {
  start: Date;
  end: Date;
}): Promise<MobileIntroReport> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");

  try {
    return await getMobileIntroReport(range);
  } catch (error) {
    logger.error("Ошибка при получении отчёта вступительной презентации", error as Error);
    throw error;
  }
}
