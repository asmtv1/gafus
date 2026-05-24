import { AchievementsContent } from "@/features/achievements";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { requireWebAppSubscription } from "@shared/lib/app-subscription/server";

export const metadata = generateStaticPageMetadata(
  "Достижения",
  "Ваши достижения и прогресс в обучении.",
  "/achievements",
);

/* Страница достижений с использованием  */
export default async function AchievementsPage() {
  const userId = await getCurrentUserId().catch(() => null);
  if (userId) {
    await requireWebAppSubscription(userId);
  }
  return <AchievementsContent />;
}
