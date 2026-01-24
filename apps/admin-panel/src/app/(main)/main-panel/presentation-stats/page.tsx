import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import PageLayout from "@/shared/components/PageLayout";
import PresentationStatsMonitor from "@/features/presentation/components/PresentationStatsMonitor";

export const metadata = {
  title: "Статистика по презентации | Админ панель",
  description: "Аналитика просмотров presentation.html",
};

/**
 * Страница статистики по presentation.html
 * Только для ADMIN и MODERATOR
 */
export default async function PresentationStatsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  return (
    <PageLayout title="Статистика по презентации" subtitle="Аналитика просмотров presentation.html">
      <PresentationStatsMonitor />
    </PageLayout>
  );
}
