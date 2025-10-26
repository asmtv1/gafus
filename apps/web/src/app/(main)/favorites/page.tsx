import { getFavoritesCoursesCached } from "@shared/lib/actions/cachedCourses";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";
import styles from "./favorites.module.css";
import FavoritesCourseList from "@/app/(main)/favorites/FavoritesCourseList";

export const revalidate = 60;

export const metadata = generateStaticPageMetadata(
  "Избранные курсы",
  "Ваши избранные курсы для послушания, фокуса и социализации собаки.",
  "/favorites"
);

export default async function FavoritesPage() {
  // Загружаем данные избранных курсов серверно для кэширования
  const session = await getServerSession(authOptions as NextAuthOptions);
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
