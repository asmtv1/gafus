import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import PageLayout from "@shared/components/PageLayout";
import ReengagementMonitor from "@features/reengagement/components/ReengagementMonitor";

export const metadata = {
  title: "Re-engagement мониторинг | Админ панель",
  description: "Мониторинг системы возвращения неактивных пользователей"
};

/**
 * Страница мониторинга re-engagement
 * Только для ADMIN
 */
export default async function ReengagementPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/main-panel");
  }

  return (
    <PageLayout
      title="Re-engagement мониторинг"
      subtitle="Аналитика возвращения неактивных пользователей"
    >
      <ReengagementMonitor />
    </PageLayout>
  );
}

