import FavoritesCourseList from "@features/courses/components/FavoritesCourseList";

import styles from "./page.module.css";

export default async function FavoritesPage() {
  // Теперь данные будут загружаться через courseStore в клиентском компоненте
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Избранные курсы</h1>
      <FavoritesCourseList />
    </main>
  );
}
