"use client";

import styles from "./AchievementsSkeleton.module.css";

/**
 * Скелетон для загрузки достижений
 * Показывает анимированные заглушки во время загрузки данных
 */
export function AchievementsSkeleton() {
  return (
    <div className={styles.container}>
      {/* Заголовок */}
      <div className={styles.header}>
        <div className={styles.titleSkeleton} />
        <div className={styles.subtitleSkeleton} />
      </div>
      
      {/* Статистика */}
      <div className={styles.statsContainer}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.statCard}>
            <div className={styles.statIcon} />
            <div className={styles.statValue} />
            <div className={styles.statLabel} />
          </div>
        ))}
      </div>
      
      {/* Достижения по категориям */}
      <div className={styles.categoriesContainer}>
        {Array.from({ length: 3 }).map((_, categoryIndex) => (
          <div key={categoryIndex} className={styles.category}>
            <div className={styles.categoryTitle} />
            <div className={styles.achievementsGrid}>
              {Array.from({ length: 4 }).map((_, achievementIndex) => (
                <div key={achievementIndex} className={styles.achievementCard}>
                  <div className={styles.achievementIcon} />
                  <div className={styles.achievementTitle} />
                  <div className={styles.achievementDescription} />
                  <div className={styles.achievementProgress} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Компактный скелетон для небольших компонентов
 */
export function AchievementsSkeletonCompact() {
  return (
    <div className={styles.compactContainer}>
      <div className={styles.compactHeader}>
        <div className={styles.compactTitle} />
        <div className={styles.compactCount} />
      </div>
      <div className={styles.compactGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={styles.compactAchievement}>
            <div className={styles.compactIcon} />
            <div className={styles.compactTitle} />
          </div>
        ))}
      </div>
    </div>
  );
}
