"use client";

import Link from "next/link";

import { useAchievementsFromStores, useAchievementsByCategoryFromStores } from "@shared/hooks/useAchievementsFromStores";
import { AchievementsSkeleton } from "@shared/components/ui/AchievementsSkeleton";
import { AchievementsError } from "@shared/components/ui/AchievementsError";
import UserCoursesStatistics from "./UserCoursesStatistics";


import styles from "./AchievementsContent.module.css";

/*
 * Основной компонент для отображения достижений
 */
export function AchievementsContent() {
  const { data, error, isLoading } = useAchievementsFromStores();
  const { achievementsByCategory, unlockedCount, totalCount, completionPercentage } = useAchievementsByCategoryFromStores();
  
  // Состояние загрузки
  if (isLoading) {
    return <AchievementsSkeleton />;
  }
  
  // Состояние ошибки
  if (error) {
    return <AchievementsError error={error} />;
  }
  
  // Нет данных
  if (!data) {
    return (
      <div className={styles.noData}>
        <div className={styles.noDataIcon}>📚</div>
        <h3>Данные не найдены</h3>
        <p>Не удалось загрузить информацию о достижениях.</p>
      </div>
    );
  }
  
  return (
    <section className={styles.container}>
      {/* Заголовок */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>
              🏆 Достижения
            </h1>
            <p className={styles.subtitle}>
              Ваш прогресс в обучении и достигнутые результаты
            </p>
          </div>
        </div>
      </header>
      
      {/* Общая статистика */}
      <div className={styles.statsSection}>
        <h2 className={styles.sectionTitle}>📊 Общая статистика</h2>
        
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>📚</div>
            <div className={styles.statValue}>{data?.totalCourses || 0}</div>
            <div className={styles.statLabel}>Всего курсов</div>
          </div>
          
          <div className={styles.statCard}>
            <div className={styles.statIcon}>✅</div>
            <div className={styles.statValue}>{data?.completedCourses || 0}</div>
            <div className={styles.statLabel}>Завершено</div>
          </div>
          
          <div className={styles.statCard}>
            <div className={styles.statIcon}>🔄</div>
            <div className={styles.statValue}>{data?.inProgressCourses || 0}</div>
            <div className={styles.statLabel}>В процессе</div>
          </div>
          
          <div className={styles.statCard}>
            <div className={styles.statIcon}>📅</div>
            <div className={styles.statValue}>{data?.totalCompletedDays || 0}</div>
            <div className={styles.statLabel}>Дней пройдено</div>
          </div>
        </div>
        
      </div>
      
      {/* Достижения */}
      <div className={styles.achievementsSection}>
        <div className={styles.achievementsHeader}>
          <h2 className={styles.sectionTitle}>🎯 Достижения</h2>
          <div className={styles.achievementsStats}>
            <span className={styles.achievementsCount}>
              {unlockedCount} из {totalCount}
            </span>
            <span className={styles.achievementsPercentage}>
              ({completionPercentage}%)
            </span>
          </div>
        </div>
        
        {Object.keys(achievementsByCategory).length === 0 ? (
          <div className={styles.noAchievements}>
            <div className={styles.noAchievementsIcon}>🎯</div>
            <h3>Пока нет достижений</h3>
            <p>Начните проходить курсы, чтобы получить первые достижения!</p>
            <Link href="/courses" className={styles.coursesLink}>
              Перейти к курсам →
            </Link>
          </div>
        ) : (
          <div className={styles.categoriesContainer}>
            {Object.entries(achievementsByCategory).map(([category, achievements]) => (
              <div key={category} className={styles.category}>
                <h3 className={styles.categoryTitle}>
                  {getCategoryTitle(category)} ({achievements.length})
                </h3>
                <div className={styles.achievementsGrid}>
                  {achievements.map((achievement) => (
                    <div 
                      key={achievement.id} 
                      className={`${styles.achievementCard} ${
                        achievement.unlocked ? styles.achievementUnlocked : styles.achievementLocked
                      }`}
                    >
                      <div className={styles.achievementIcon}>
                        {achievement.icon}
                      </div>
                      <div className={styles.achievementContent}>
                        <h4 className={styles.achievementTitle}>
                          {achievement.title}
                        </h4>
                        <p className={styles.achievementDescription}>
                          {achievement.description}
                        </p>
                        <div className={styles.achievementProgress}>
                          <div className={styles.progressBar}>
                            <div 
                              className={styles.progressFill}
                              style={{ width: `${achievement.progress}%` }}
                            />
                          </div>
                          <span className={styles.progressText}>
                            {achievement.progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Детальная статистика по курсам */}
      <div className={styles.coursesSection}>
        <h2 className={styles.sectionTitle}>📚 Детальная статистика по курсам</h2>
        <UserCoursesStatistics />
      </div>
    </section>
  );
}

/**
 * Получает заголовок категории достижений
 */
function getCategoryTitle(category: string): string {
  const titles: Record<string, string> = {
    courses: "Курсы",
    progress: "Прогресс", 
    streak: "Серии",
    social: "Социальные",
    special: "Специальные",
  };
  
  return titles[category] || category;
}
