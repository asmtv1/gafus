import { useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Button } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Loading } from "@/shared/components/ui";
import { achievementsApi, coursesApi, type Course } from "@/shared/lib/api";
import type { AchievementData } from "@gafus/types";
import { COLORS, SPACING, FONTS } from "@/constants";

const CARD_BG = "#ECE5D2";
const CARD_BORDER = "#B6C582";
const STAT_VALUE = "#007bff";
const LOCKED_BG = "#FFF8E5";

function getCategoryTitle(category: string): string {
  const map: Record<string, string> = {
    courses: "Курсы",
    progress: "Прогресс",
    streak: "Серии",
    social: "Социальные",
    special: "Специальные",
  };
  return map[category] ?? category;
}

/**
 * Страница достижений — логика и дизайн как на web (мобильная версия).
 */
export default function AchievementsScreen() {
  const router = useRouter();

  const {
    data: achievementsRes,
    isLoading: achievementsLoading,
    error: achievementsError,
    refetch: refetchAchievements,
  } = useQuery({
    queryKey: ["achievements"],
    queryFn: achievementsApi.getAchievements,
  });

  const { data: coursesRes } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const res = await coursesApi.getAll();
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки курсов");
      return res;
    },
  });

  const data = achievementsRes?.success ? achievementsRes.data : undefined;
  const courses =
    coursesRes?.success && Array.isArray(coursesRes.data) ? (coursesRes.data as Course[]) : [];
  const activeCourses = useMemo(
    () => courses.filter((c) => c.userStatus !== "NOT_STARTED"),
    [courses],
  );

  const byCategory = useMemo(() => {
    if (!data?.achievements) return {};
    return data.achievements.reduce<Record<string, typeof data.achievements>>((acc, a) => {
      if (!a?.category) return acc;
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    }, {});
  }, [data?.achievements]);

  const unlockedCount = data?.achievements?.filter((a) => a.unlocked).length ?? 0;
  const totalCount = data?.achievements?.length ?? 0;
  const completionPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  const onRefresh = () => {
    refetchAchievements();
  };

  if (achievementsLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Loading message="Загрузка достижений..." />
      </SafeAreaView>
    );
  }

  if (achievementsError || !achievementsRes?.success) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text variant="titleMedium" style={styles.errorTitle}>
            Ошибка загрузки достижений
          </Text>
          <Text variant="bodyMedium" style={styles.errorText}>
            {achievementsRes?.error ?? "Не удалось загрузить данные."}
          </Text>
          <Button mode="contained" onPress={onRefresh} style={styles.retryBtn}>
            Попробовать снова
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.noDataIcon}>📚</Text>
          <Text variant="titleMedium" style={styles.noDataTitle}>
            Данные не найдены
          </Text>
          <Text variant="bodyMedium" style={styles.noDataText}>
            Не удалось загрузить информацию о достижениях.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={achievementsLoading} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            🏆 Достижения
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Ваш прогресс в обучении и достигнутые результаты
          </Text>
        </View>

        <View style={styles.statsSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            📊 Общая статистика
          </Text>
          <View style={styles.statsGrid}>
            <StatCard value={String(data.totalCourses ?? 0)} label="Всего курсов" icon="📚" />
            <StatCard value={String(data.completedCourses ?? 0)} label="Завершено" icon="✅" />
            <StatCard value={String(data.inProgressCourses ?? 0)} label="В процессе" icon="🔄" />
            <StatCard
              value={String(data.totalCompletedDays ?? 0)}
              label="Дней пройдено"
              icon="📅"
            />
          </View>
        </View>

        <View style={styles.achievementsSection}>
          <View style={styles.achievementsHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              🎯 Достижения
            </Text>
            <View style={styles.achievementsStats}>
              <Text variant="labelLarge" style={styles.achievementsCount}>
                {unlockedCount} из {totalCount}
              </Text>
              <Text variant="bodySmall" style={styles.achievementsPct}>
                ({completionPct}%)
              </Text>
            </View>
          </View>

          {Object.keys(byCategory).length === 0 ? (
            <View style={styles.noAchievements}>
              <Text style={styles.noAchievementsIcon}>🎯</Text>
              <Text variant="titleMedium" style={styles.noAchievementsTitle}>
                Пока нет достижений
              </Text>
              <Text variant="bodyMedium" style={styles.noAchievementsText}>
                Начните проходить курсы, чтобы получить первые достижения!
              </Text>
              <Button
                mode="contained"
                onPress={() => router.push("/(main)/(tabs)")}
                style={styles.coursesLink}
              >
                Перейти к курсам →
              </Button>
            </View>
          ) : (
            <View style={styles.categoriesContainer}>
              {Object.entries(byCategory).map(([category, items]) => (
                <View key={category} style={styles.category}>
                  <Text variant="titleSmall" style={styles.categoryTitle}>
                    {getCategoryTitle(category)} ({items.length})
                  </Text>
                  <View style={styles.achievementsList}>
                    {items.map((a) => (
                      <AchievementCard key={a.id} achievement={a} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.coursesSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            📚 Детальная статистика по курсам
          </Text>
          <CoursesList
            courses={activeCourses}
            onCoursePress={(type) => router.push(`/(main)/training/${type}`)}
            onBrowsePress={() => router.push("/(main)/(tabs)")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text variant="titleLarge" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="bodySmall" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function AchievementCard({
  achievement,
}: {
  achievement: AchievementData["achievements"][number];
}) {
  const unlocked = achievement.unlocked;
  return (
    <View style={[styles.achievementCard, !unlocked && styles.achievementLocked]}>
      <Text style={[styles.achievementIcon, !unlocked && styles.lockedIcon]}>
        {achievement.icon}
      </Text>
      <View style={styles.achievementContent}>
        <Text
          variant="titleSmall"
          style={[styles.achievementTitle, !unlocked && styles.lockedText]}
        >
          {achievement.title}
        </Text>
        <Text variant="bodySmall" style={[styles.achievementDesc, !unlocked && styles.lockedText]}>
          {achievement.description}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${achievement.progress}%` }]} />
          </View>
          <Text variant="labelSmall" style={styles.progressText}>
            {achievement.progress}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function CoursesList({
  courses,
  onCoursePress,
  onBrowsePress,
}: {
  courses: Course[];
  onCoursePress: (type: string) => void;
  onBrowsePress: () => void;
}) {
  if (courses.length === 0) {
    return (
      <View style={styles.noCourses}>
        <Text style={styles.noCoursesIcon}>📚</Text>
        <Text variant="titleMedium" style={styles.noCoursesTitle}>
          Пока нет начатых курсов
        </Text>
        <Text variant="bodyMedium" style={styles.noCoursesText}>
          Начните изучение любого курса, чтобы увидеть статистику прогресса.
        </Text>
        <Button mode="contained" onPress={onBrowsePress} style={styles.coursesLink}>
          Выбрать курс
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.coursesList}>
      {courses.map((c) => (
        <Pressable key={c.id} style={styles.courseCard} onPress={() => onCoursePress(c.type)}>
          <Text variant="titleSmall" style={styles.courseName}>
            {c.name}
          </Text>
          <Text variant="bodySmall" style={styles.courseStatus}>
            {c.userStatus === "COMPLETED" && "✅ Завершён"}
            {(c.userStatus === "IN_PROGRESS" || c.userStatus === "PAUSED") && "🔄 В процессе"}
          </Text>
          <Text variant="labelMedium" style={styles.continueLink}>
            {c.userStatus === "COMPLETED" ? "Посмотреть курс" : "Продолжить обучение"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
  },
  subtitle: {
    color: "#666",
    marginTop: SPACING.xs,
  },
  errorIcon: { fontSize: 48, marginBottom: SPACING.md },
  errorTitle: { marginBottom: SPACING.xs, color: COLORS.text },
  errorText: { color: COLORS.textSecondary, marginBottom: SPACING.md, textAlign: "center" },
  retryBtn: { marginTop: SPACING.sm },
  noDataIcon: { fontSize: 48, marginBottom: SPACING.md },
  noDataTitle: { marginBottom: SPACING.xs, color: COLORS.text },
  noDataText: { color: COLORS.textSecondary, textAlign: "center" },

  statsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    color: "#333",
    marginBottom: SPACING.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  statIcon: { fontSize: 20, marginBottom: SPACING.xs },
  statValue: { fontWeight: "700", color: STAT_VALUE, marginBottom: 2 },
  statLabel: { color: "#666", fontWeight: "500", fontSize: 12 },

  achievementsSection: { marginBottom: SPACING.lg },
  achievementsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  achievementsStats: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  achievementsCount: { fontWeight: "600", color: "#333", fontSize: 14 },
  achievementsPct: { color: "#666", fontSize: 12 },

  noAchievements: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  noAchievementsIcon: { fontSize: 48, marginBottom: SPACING.md },
  noAchievementsTitle: { marginBottom: SPACING.xs, color: "#333" },
  noAchievementsText: {
    color: "#666",
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  coursesLink: { marginTop: SPACING.xs },

  categoriesContainer: { gap: SPACING.lg },
  category: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  categoryTitle: {
    fontWeight: "600",
    color: "#333",
    marginBottom: SPACING.md,
    fontSize: 16,
  },
  achievementsList: { gap: SPACING.sm },
  achievementCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "transparent",
  },
  achievementLocked: {
    backgroundColor: LOCKED_BG,
    opacity: 0.7,
  },
  achievementIcon: { fontSize: 20, marginTop: 2 },
  lockedIcon: { opacity: 0.5 },
  achievementContent: { flex: 1 },
  achievementTitle: { fontWeight: "600", color: "#333", marginBottom: 2 },
  achievementDesc: { color: "#666", fontSize: 12, marginBottom: SPACING.sm, lineHeight: 18 },
  lockedText: { color: COLORS.disabled },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#e9ecef",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: CARD_BORDER,
    borderRadius: 3,
  },
  progressText: { fontSize: 11, color: "#666", minWidth: 32, fontWeight: "500" },

  coursesSection: { marginBottom: SPACING.lg },
  coursesList: { gap: SPACING.sm },
  courseCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  courseName: { fontWeight: "600", color: "#333", marginBottom: 4 },
  courseStatus: { color: "#666", marginBottom: SPACING.xs },
  continueLink: { color: STAT_VALUE, fontWeight: "500" },

  noCourses: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  noCoursesIcon: { fontSize: 48, marginBottom: SPACING.md },
  noCoursesTitle: { marginBottom: SPACING.xs, color: "#333" },
  noCoursesText: {
    color: "#666",
    marginBottom: SPACING.md,
    textAlign: "center",
  },
});
