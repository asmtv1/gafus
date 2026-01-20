import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Text, Avatar, Surface } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";

import { Card, Loading, Button } from "@/shared/components/ui";
import { useAuthStore, useCourseStore } from "@/shared/stores";
import { coursesApi, type Course } from "@/shared/lib/api";
import { COLORS, SPACING } from "@/constants";

/**
 * Главная страница — Dashboard пользователя
 */
export default function HomeScreen() {
  const { user } = useAuthStore();
  const { favorites } = useCourseStore();
  const [refreshing, setRefreshing] = useState(false);

  // Загрузка курсов для отображения прогресса
  const { data: coursesData, isLoading, refetch } = useQuery({
    queryKey: ["courses-home"],
    queryFn: () => coursesApi.getAll(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Получаем первые 2 избранных курса для быстрого доступа
  const favoriteCourses = coursesData?.data?.courses.filter(
    (c) => favorites.includes(c.id)
  ).slice(0, 2) || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Приветствие */}
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text variant="headlineSmall" style={styles.greetingText}>
              Привет, {user?.name || user?.username || "Пользователь"}!
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Готов к тренировке?
            </Text>
          </View>
          <Avatar.Text
            size={48}
            label={getInitials(user?.name || user?.username || "U")}
            style={styles.avatar}
          />
        </View>

        {/* Быстрые действия */}
        <Surface style={styles.quickActions} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Быстрые действия
          </Text>
          <View style={styles.actionsGrid}>
            <Link href="/courses" asChild>
              <Surface style={styles.actionCard} elevation={0}>
                <Text style={styles.actionIcon}>📚</Text>
                <Text variant="bodySmall">Все курсы</Text>
              </Surface>
            </Link>
            <Link href="/achievements" asChild>
              <Surface style={styles.actionCard} elevation={0}>
                <Text style={styles.actionIcon}>🏆</Text>
                <Text variant="bodySmall">Достижения</Text>
              </Surface>
            </Link>
            <Link href="/profile" asChild>
              <Surface style={styles.actionCard} elevation={0}>
                <Text style={styles.actionIcon}>⚙️</Text>
                <Text variant="bodySmall">Настройки</Text>
              </Surface>
            </Link>
          </View>
        </Surface>

        {/* Избранные курсы */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Избранные курсы
            </Text>
            <Link href="/courses" asChild>
              <Text style={styles.seeAll}>Все →</Text>
            </Link>
          </View>

          {isLoading ? (
            <Loading message="Загрузка..." />
          ) : favoriteCourses.length > 0 ? (
            favoriteCourses.map((course) => (
              <CoursePreviewCard key={course.id} course={course} />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Card.Content>
                <Text style={styles.emptyText}>
                  У вас пока нет избранных курсов
                </Text>
                <Link href="/courses" asChild>
                  <Button label="Выбрать курс" style={styles.emptyButton} />
                </Link>
              </Card.Content>
            </Card>
          )}
        </View>

        {/* Статистика */}
        <Surface style={styles.statsSection} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Ваша статистика
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={styles.statValue}>
                0
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Дней подряд
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={styles.statValue}>
                0
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Тренировок
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={styles.statValue}>
                0
              </Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Часов
              </Text>
            </View>
          </View>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Компонент превью курса для главной страницы
 */
function CoursePreviewCard({ course }: { course: Course }) {
  return (
    <Link href={`/training/${course.type}`} asChild>
      <Card style={styles.courseCard}>
        <Card.Title
          title={course.name}
          subtitle={course.shortDesc}
          left={(props) => (
            <Avatar.Image {...props} source={{ uri: course.logoImg }} />
          )}
        />
      </Card>
    </Link>
  );
}

/**
 * Получение инициалов из имени
 */
function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  greeting: {
    flex: 1,
  },
  greetingText: {
    fontWeight: "bold",
  },
  subtitle: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  avatar: {
    backgroundColor: COLORS.primary,
  },
  quickActions: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: SPACING.md,
  },
  actionCard: {
    alignItems: "center",
    padding: SPACING.md,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: SPACING.xs,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  seeAll: {
    color: COLORS.primary,
    fontWeight: "500",
  },
  courseCard: {
    marginBottom: SPACING.sm,
  },
  emptyCard: {
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  emptyButton: {
    marginTop: SPACING.sm,
  },
  statsSection: {
    padding: SPACING.md,
    borderRadius: 12,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: SPACING.md,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontWeight: "bold",
    color: COLORS.primary,
  },
  statLabel: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
