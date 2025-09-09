import { getFavoritesCoursesCached } from "@shared/lib/actions/cachedCourses";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import styles from "./favorites.module.css";
import FavoritesCourseList from "@/app/(main)/favorites/FavoritesCourseList";

export const revalidate = 60;

export const metadata = {
  title: "Избранные курсы",
  description: "Ваши избранные курсы для послушания, фокуса и социализации собаки.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Избранные курсы",
    description: "Ваши избранные курсы для послушания, фокуса и социализации собаки.",
    type: "website",
  },
};

export default async function FavoritesPage() {
  // Загружаем данные избранных курсов серверно для кэширования
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  let favoritesData = null;
  let error = null;

  if (userId) {
    try {
      const result = await getFavoritesCoursesCached(userId);
      if (result.success) {
        favoritesData = result.data;
      } else {
        error = result.error;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Ошибка загрузки избранных курсов";
    }
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Избранные курсы</h1>
      <FavoritesCourseList 
        initialFavorites={favoritesData} 
        initialError={error}
        userId={userId}
      />
    </main>
  );
}
