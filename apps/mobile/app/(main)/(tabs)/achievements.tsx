import { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Text, Surface } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/shared/components/ui";
import { TrainingCalendar } from "@/features/achievements/components";
import { achievementsApi } from "@/shared/lib/api";
import { COLORS, SPACING } from "@/constants";

/**
 * Страница достижений с календарём и статистикой
 */
export default function AchievementsScreen() {
  const [selectedMonth] = useState(new Date());

  // Загрузка дат тренировок
  const { data: datesData, isLoading: datesLoading, refetch: refetchDates } = useQuery({
    queryKey: ["trainingDates"],
    queryFn: achievementsApi.getTrainingDates,
  });

  // Загрузка статистики
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["userStats"],
    queryFn: achievementsApi.getStats,
  });

  const trainingDates = datesData?.data?.dates || [];
  const stats = statsData?.data;

  const onRefresh = () => {
    refetchDates();
    refetchStats();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={datesLoading} onRefresh={onRefresh} />
        }
      >
        {/* Заголовок */}
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            Ваши достижения
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Отслеживайте свой прогресс
          </Text>
        </View>

        {/* Календарь тренировок */}
        <View style={styles.calendarSection}>
          <TrainingCalendar
            trainingDates={trainingDates}
            month={selectedMonth}
          />
        </View>

        {/* Статистика */}
        <Surface style={styles.statsSection} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Общая статистика
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              value={String(stats?.totalTrainings || 0)}
              label="Всего тренировок"
              icon="🏋️"
            />
            <StatCard
              value={String(stats?.currentStreak || 0)}
              label="Дней подряд"
              icon="🔥"
            />
            <StatCard
              value={`${Math.round((stats?.totalMinutes || 0) / 60)} ч`}
              label="Общее время"
              icon="⏱️"
            />
            <StatCard
              value={String(stats?.completedCourses || 0)}
              label="Пройдено курсов"
              icon="🎓"
            />
          </View>
        </Surface>

        {/* Достижения */}
        <View style={styles.achievementsSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Награды
          </Text>
          <View style={styles.achievementsList}>
            <AchievementCard
              title="Первая тренировка"
              description="Завершите вашу первую тренировку"
              icon="🌟"
              locked={(stats?.totalTrainings || 0) < 1}
            />
            <AchievementCard
              title="Неделя без пропусков"
              description="Тренируйтесь 7 дней подряд"
              icon="🔥"
              locked={(stats?.longestStreak || 0) < 7}
            />
            <AchievementCard
              title="Первый курс"
              description="Полностью завершите один курс"
              icon="🏆"
              locked={(stats?.completedCourses || 0) < 1}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Карточка статистики
 */
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

/**
 * Карточка достижения
 */
function AchievementCard({ 
  title, 
  description, 
  icon, 
  locked 
}: { 
  title: string;
  description: string;
  icon: string;
  locked?: boolean;
}) {
  return (
    <Card style={[styles.achievementCard, locked && styles.lockedCard]}>
      <Card.Content style={styles.achievementContent}>
        <Text style={[styles.achievementIcon, locked && styles.lockedIcon]}>
          {icon}
        </Text>
        <View style={styles.achievementText}>
          <Text 
            variant="titleSmall" 
            style={[styles.achievementTitle, locked && styles.lockedText]}
          >
            {title}
          </Text>
          <Text 
            variant="bodySmall" 
            style={[styles.achievementDesc, locked && styles.lockedText]}
          >
            {description}
          </Text>
        </View>
        {locked && (
          <Text style={styles.lockIcon}>🔒</Text>
        )}
      </Card.Content>
    </Card>
  );
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
    marginBottom: SPACING.lg,
  },
  title: {
    fontWeight: "bold",
  },
  subtitle: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  calendarSection: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: SPACING.md,
  },
  calendarPlaceholder: {
    alignItems: "center",
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  placeholderText: {
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  statsSection: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontWeight: "bold",
    color: COLORS.primary,
  },
  statLabel: {
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  achievementsSection: {
    marginBottom: SPACING.lg,
  },
  achievementsList: {
    gap: SPACING.sm,
  },
  achievementCard: {
    marginBottom: 0,
  },
  lockedCard: {
    opacity: 0.6,
  },
  achievementContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  achievementIcon: {
    fontSize: 32,
    marginRight: SPACING.md,
  },
  lockedIcon: {
    opacity: 0.5,
  },
  achievementText: {
    flex: 1,
  },
  achievementTitle: {
    fontWeight: "600",
  },
  achievementDesc: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  lockedText: {
    color: COLORS.disabled,
  },
  lockIcon: {
    fontSize: 16,
    marginLeft: SPACING.sm,
  },
});
