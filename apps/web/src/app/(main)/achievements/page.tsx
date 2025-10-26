import { AchievementsContent } from "@features/achievements/components/AchievementsContent";
import { generateStaticPageMetadata } from "@gafus/metadata";

export const metadata = generateStaticPageMetadata(
  "Достижения",
  "Ваши достижения и прогресс в обучении.",
  "/achievements"
);

/* Страница достижений с использованием  */
export default function AchievementsPage() {
  return <AchievementsContent />;
}
