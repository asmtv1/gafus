"use client";

import { useCourseStoreActions } from "@shared/stores";
import { useEffect, useCallback } from "react";

import { CourseCard } from "./CourseCard";
import styles from "./favorites.module.css";

export default function FavoritesCourseList() {
  const { favorites, loading, errors, fetchFavorites, forceRefreshFavorites, favoriteCourseIds } =
    useCourseStoreActions();

  // Мемоизируем функцию обновления избранного
  const handleUnfavorite = useCallback(
    (courseId: string) => {
      // Принудительно обновляем кэш для синхронизации с сервером
      forceRefreshFavorites();
    },
    [forceRefreshFavorites],
  );

  // Загружаем избранные курсы при монтировании компонента и при фокусе
  useEffect(() => {
    fetchFavorites();

    // Обновляем данные при фокусе на вкладке
    const handleFocus = () => {
      // Проверяем, что прошло достаточно времени с последнего обновления (например, 30 секунд)
      if (favorites?.timestamp && Date.now() - favorites.timestamp > 30000) {
        forceRefreshFavorites();
      }
    };

    // Обновляем данные при возвращении на вкладку
    const handleVisibilityChange = () => {
      if (!document.hidden && favorites?.timestamp && Date.now() - favorites.timestamp > 30000) {
        forceRefreshFavorites();
      }
    };

    // Слушаем глобальные изменения избранного
    const handleFavoritesChanged = () => {
      // Принудительно обновляем данные при изменении избранного
      forceRefreshFavorites();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("favoritesChanged", handleFavoritesChanged);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("favoritesChanged", handleFavoritesChanged);
    };
  }, []); // Убираем fetchFavorites из зависимостей

  // Показываем загрузку при первой загрузке
  if (loading.favorites && !favorites?.data) {
    return <div style={{ textAlign: "center", padding: "20px" }}>Загрузка избранных курсов...</div>;
  }

  // Показываем ошибку если есть
  if (errors.favorites) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "red" }}>
        Ошибка загрузки избранных курсов: {errors.favorites}
      </div>
    );
  }

  // Фильтруем курсы по ID избранных - используем актуальное состояние из store
  const courses = favorites?.data?.filter((course) => favoriteCourseIds.has(course.id)) || [];

  if (courses.length === 0) {
    return (
      <div>
        <p>У вас пока нет избранных курсов.</p>
      </div>
    );
  }

  return (
    <div>
      {loading.favorites && favorites?.data && (
        <div style={{ textAlign: "center", padding: "10px", color: "#666" }}>
          Обновление списка...
        </div>
      )}
      <ul className={styles.coursesGrid}>
        {courses.map((course, index) => {
          const courseCardProps = {
            id: course.id,
            name: course.name,
            type: course.type || "",
            duration: course.duration || "",
            logoImg: course.logoImg,
            isPrivate: course.isPrivate || false,
            userStatus: course.userStatus || "NOT_STARTED",
            startedAt: course.startedAt,
            completedAt: course.completedAt,
            shortDesc: course.shortDesc || "",
            authorUsername: course.authorUsername || "",
            createdAt: course.createdAt || new Date(),
            avgRating: course.avgRating,
            reviews: course.reviews || [],
            isFavorite: true, // Всегда true для избранных курсов
            index,
          };

          return (
            <CourseCard key={course.id} {...courseCardProps} onUnfavorite={handleUnfavorite} />
          );
        })}
      </ul>
    </div>
  );
}
