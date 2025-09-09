import { AchievementsContent } from "@features/achievements/components/AchievementsContent";

export const metadata = {
  title: "Достижения",
  description: "Ваши достижения и прогресс в обучении.",
};

/**
 * Страница достижений с использованием SWR для кэширования
 * 
 * Особенности:
 * - Автоматическое кэширование данных на 5 минут
 * - Обработка состояний загрузки и ошибок
 * - Автоматическое обновление при изменении курсов
 * - Оптимизированная производительность
 */
export default function AchievementsPage() {
  return <AchievementsContent />;
}
