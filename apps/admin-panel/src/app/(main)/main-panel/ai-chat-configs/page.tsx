import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@gafus/auth";
import TrainerAIConfigsClient from "./TrainerAIConfigsClient";
import { getTrainerAIConfigs } from "@/features/ai-chat/lib/getTrainerAIConfigs";

export default async function TrainerAIConfigsPage() {
  const session = await getServerSession(authOptions);

  // Проверяем права администратора
  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const result = await getTrainerAIConfigs();
  const configs = result.success && result.data ? result.data : [];

  return <TrainerAIConfigsClient configs={configs} />;
}
