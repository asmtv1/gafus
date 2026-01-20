import { useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, List, Chip, Surface } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Loading } from "@/shared/components/ui";
import { useTrainingDays } from "@/shared/hooks";
import { useStepStore } from "@/shared/stores";
import type { TrainingDay } from "@/shared/lib/api";
import { COLORS, SPACING } from "@/constants";

/**
 * Экран списка дней тренировок курса
 */
export default function TrainingDaysScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  const router = useRouter();

  const { data, isLoading, error, refetch, isRefetching } = useTrainingDays(courseType);
  const { stepStates } = useStepStore();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Вычисляем локальный статус дня на основе шагов
  const getDayLocalStatus = useCallback(
    (courseId: string, dayOnCourseId: string): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | null => {
      const prefix = `${courseId}-${dayOnCourseId}-`;
      const daySteps = Object.entries(stepStates).filter(([key]) => key.startsWith(prefix));

      if (daySteps.length === 0) return null;

      const allCompleted = daySteps.every(([, state]) => state.status === "COMPLETED");
      if (allCompleted) return "COMPLETED";

      const anyInProgress = daySteps.some(
        ([, state]) => state.status === "IN_PROGRESS" || state.status === "PAUSED"
      );
      if (anyInProgress) return "IN_PROGRESS";

      return null;
    },
    [stepStates]
  );

  const courseData = data?.data;

  const handleDayPress = (day: TrainingDay) => {
    router.push(`/training/${courseType}/${day.dayOnCourseId}`);
  };

  const renderDayItem = ({ item, index }: { item: TrainingDay; index: number }) => {
    const localStatus = getDayLocalStatus(courseData?.courseId || "", item.dayOnCourseId);
    const status = localStatus || item.userStatus || "NOT_STARTED";

    const isCompleted = status === "COMPLETED";
    const isInProgress = status === "IN_PROGRESS";

    return (
      <Pressable onPress={() => handleDayPress(item)}>
        <Surface style={[styles.dayCard, isCompleted && styles.completedCard]} elevation={1}>
          <View style={styles.dayHeader}>
            <View style={styles.dayNumber}>
              <Text style={styles.dayNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.dayInfo}>
              <Text variant="titleMedium" numberOfLines={2} style={styles.dayTitle}>
                {item.title}
              </Text>
              <View style={styles.dayMeta}>
                {item.estimatedDuration && (
                  <Chip compact icon="clock-outline" style={styles.chip}>
                    {item.estimatedDuration} мин
                  </Chip>
                )}
                <Chip compact style={styles.chip}>
                  {item.type}
                </Chip>
              </View>
            </View>
            <View style={styles.statusIcon}>
              {isCompleted ? (
                <MaterialCommunityIcons name="check-circle" size={28} color={COLORS.success} />
              ) : isInProgress ? (
                <MaterialCommunityIcons name="play-circle" size={28} color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons name="circle-outline" size={28} color={COLORS.disabled} />
              )}
            </View>
          </View>
        </Surface>
      </Pressable>
    );
  };

  if (isLoading) {
    return <Loading fullScreen message="Загрузка тренировок..." />;
  }

  if (error || !data?.success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>Ошибка загрузки курса</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Тренировка",
        }}
      />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {/* Информация о курсе */}
        {courseData?.courseDescription && (
          <Surface style={styles.courseInfo} elevation={1}>
            <Text variant="bodyMedium" style={styles.courseDescription}>
              {courseData.courseDescription}
            </Text>
            {courseData.courseEquipment && (
              <View style={styles.equipmentRow}>
                <MaterialCommunityIcons name="dumbbell" size={16} color={COLORS.textSecondary} />
                <Text style={styles.equipmentText}>{courseData.courseEquipment}</Text>
              </View>
            )}
          </Surface>
        )}

        {/* Список дней */}
        <FlatList
          data={courseData?.trainingDays || []}
          renderItem={renderDayItem}
          keyExtractor={(item) => item.dayOnCourseId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет дней тренировок</Text>
            </View>
          }
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  courseInfo: {
    margin: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
  },
  courseDescription: {
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  equipmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  equipmentText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  dayCard: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  completedCard: {
    backgroundColor: "#E8F5E9",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  dayNumberText: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  dayInfo: {
    flex: 1,
  },
  dayTitle: {
    fontWeight: "600",
    marginBottom: SPACING.xs,
  },
  dayMeta: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  chip: {
    height: 24,
  },
  statusIcon: {
    marginLeft: SPACING.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
  },
});
