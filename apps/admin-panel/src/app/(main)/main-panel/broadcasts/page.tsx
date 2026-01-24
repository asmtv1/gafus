import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import BroadcastForm from "@/features/broadcasts/components/BroadcastForm";
import PageLayout from "@/shared/components/PageLayout";

export default async function BroadcastsPage() {
  const session = await getServerSession(authOptions);

  // Проверяем права администратора (только ADMIN, не MODERATOR)
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    redirect("/main-panel");
  }

  return (
    <PageLayout
      title="Push-рассылка"
      subtitle="Массовая отправка push-уведомлений всем пользователям"
    >
      <BroadcastForm />
    </PageLayout>
  );
}
