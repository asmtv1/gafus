import { useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Surface } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { calculateDayStatus, getDayDisplayStatus } from "@gafus/core/utils/training";

import { Loading } from "@/shared/components/ui";
import { useTrainingDays } from "@/shared/hooks";
import { useOfflineStore, useStepStatesForCourse } from "@/shared/stores";
import type { TrainingDay } from "@/shared/lib/api";
import { COLORS, SPACING, FONTS } from "@/constants";
import { DAY_TYPE_LABELS } from "@/shared/lib/training/dayTypes";
import { showPrivateCourseAccessDeniedAlert } from "@/shared/lib/utils/alerts";
import { CourseDescription } from "@/features/training/components";

/**
 * Экран списка дней тренировок курса
 */
export default function TrainingDaysScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  const router = useRouter();

  const { data, isLoading, error, refetch, isRefetching } = useTrainingDays(courseType);
  const courseData = data?.success && data.data ? data.data : undefined;
  const stepStates = useStepStatesForCourse(courseData?.courseId ?? "");
  const downloadStatus = useOfflineStore((s) => s.status);
  const downloadQueue = useOfflineStore((s) => s.downloadQueue);
  const downloaded = useOfflineStore((s) => s.downloaded);
  const startDownload = useOfflineStore((s) => s.startDownload);
  const cancelDownload = useOfflineStore((s) => s.cancelDownload);
  const removeFromQueue = useOfflineStore((s) => s.removeFromQueue);
  const removeDownload = useOfflineStore((s) => s.removeDownload);
  const isDownloaded = !!downloaded[courseType];
  const isDownloadingThis = downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Обработка ошибки доступа к приватному курсу
  useEffect(() => {
    const isAccessDenied =
      (data && "code" in data && data.code === "FORBIDDEN") ||
      error?.message?.includes("COURSE_ACCESS_DENIED") ||
      (data &&
        "error" in data &&
        typeof data.error === "string" &&
        data.error.includes("доступа")) ||
      (!data?.success && data && "code" in data && data.code === "FORBIDDEN");

    if (isAccessDenied) {
      showPrivateCourseAccessDeniedAlert(() => {
        router.replace("/(main)/(tabs)/courses" as const);
      });
    }
  }, [data, error, router]);

  const handleDayPress = useCallback(
    (day: TrainingDay) => {
      router.push(`/training/${courseType}/${day.dayOnCourseId}`);
    },
    [router, courseType],
  );

  const renderDayItem = useCallback(
    ({ item, index }: { item: TrainingDay; index: number }) => {
      // Если нет courseId, все равно показываем дни (courseId может быть в courseData)
      if (!courseData) {
        if (__DEV__) {
          console.warn(
            "[TrainingDaysScreen] renderDayItem: courseData is undefined for index",
            index,
          );
        }
        return null;
      }

      const courseId = courseData.courseId;

      if (!courseId && __DEV__) {
        console.warn("[TrainingDaysScreen] courseId is missing in courseData", courseData);
      }

      // Вычисляем локальный статус дня из stepStore (как на web); RESET приоритетнее серверного COMPLETED
      const effectiveCourseId = courseId || courseType;
      const localStatus = calculateDayStatus(effectiveCourseId, item.dayOnCourseId, stepStates);
      const finalStatus = getDayDisplayStatus(localStatus, item.userStatus ?? undefined);

      const isCompleted = finalStatus === "COMPLETED";
      const isInProgress = finalStatus === "IN_PROGRESS";
      const isReset = finalStatus === "RESET";

      // Определяем цвет границы в зависимости от статуса (как на web)
      const borderColor = isCompleted
        ? "#B6C582" // Зеленый для завершенных (как на web)
        : isInProgress
          ? "#F6D86E" // Желтый для в процессе (как на web)
          : isReset
            ? "#b0aeae" // Серый для сброшенного (как на web)
            : "transparent";

      return (
        <Pressable onPress={() => handleDayPress(item)}>
          <View style={[styles.dayCardWrapper, { borderColor }]}>
            {/* Бейджи времени (как на web) */}
            {((item.estimatedDuration || 0) > 0 || (item.theoryMinutes || 0) > 0) && (
              <View style={styles.timeBadgeWrapper}>
                {(item.estimatedDuration || 0) > 0 && (
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.estimatedDuration}</Text>
                    <Text style={styles.timeBadgeLabel}>мин</Text>
                  </View>
                )}
                {(item.theoryMinutes || 0) > 0 && (
                  <View style={styles.timeBadgeTheory}>
                    <Text style={styles.timeBadgeTheoryText}>{item.theoryMinutes}</Text>
                    <Text style={styles.timeBadgeTheoryLabel}>мин</Text>
                  </View>
                )}
              </View>
            )}
            <Surface style={styles.dayCard} elevation={1}>
              <Text style={styles.dayTitle}>{item.title}</Text>
              <Text style={styles.subtitle}>({DAY_TYPE_LABELS[item.type] ?? item.type})</Text>
              <Text style={styles.equipmentLabel}>Что понадобится:</Text>
              <Text style={styles.equipment}>{item.equipment || "вкусняшки и терпение"}</Text>
            </Surface>
          </View>
        </Pressable>
      );
    },
    [courseData, courseType, stepStates, handleDayPress],
  );

  if (isLoading) {
    return <Loading fullScreen message="Загрузка тренировок..." />;
  }

  // Специальная обработка для ошибки доступа - показываем alert и возвращаем null
  const isAccessDenied =
    (data && "code" in data && data.code === "FORBIDDEN") ||
    error?.message?.includes("COURSE_ACCESS_DENIED") ||
    (data && "error" in data && typeof data.error === "string" && data.error.includes("доступа")) ||
    (!data?.success && data && "code" in data && data.code === "FORBIDDEN");

  if (isAccessDenied) {
    // Alert показывается в useEffect, здесь просто возвращаем пустой экран
    return (
      <SafeAreaView style={styles.container}>
        <Loading fullScreen message="Проверка доступа..." />
      </SafeAreaView>
    );
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
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={true}
        >
          {/* Офлайн: скачать / прогресс / очередь */}
          <Surface style={styles.offlineSection} elevation={0}>
            {isDownloaded ? (
              <View style={styles.offlineRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
                <Text style={styles.offlineLabel}>Скачано для офлайна</Text>
                <Pressable
                  onPress={() => removeDownload(courseType)}
                  style={styles.offlineButton}
                >
                  <Text style={styles.offlineButtonText}>Удалить</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.offlineRow}>
                  <MaterialCommunityIcons name="download" size={22} color={COLORS.primary} />
                  <Text style={styles.offlineLabel}>Скачать для офлайна</Text>
                  {!isDownloadingThis && !isInQueue && (
                    <Pressable
                      onPress={() => startDownload(courseType)}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Скачать</Text>
                    </Pressable>
                  )}
                  {isDownloadingThis && (
                    <Pressable onPress={() => cancelDownload()} style={styles.offlineButton}>
                      <Text style={styles.offlineButtonText}>Отменить</Text>
                    </Pressable>
                  )}
                  {isInQueue && (
                    <Pressable
                      onPress={() => removeFromQueue(courseType)}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Убрать из очереди</Text>
                    </Pressable>
                  )}
                </View>
                {isDownloadingThis && downloadStatus.status === "downloading" && (
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>
                      {downloadStatus.progress.label ?? `${downloadStatus.progress.current}/${downloadStatus.progress.total}`}
                    </Text>
                  </View>
                )}
                {downloadQueue.length > 0 && !isDownloadingThis && (
                  <Text style={styles.queueHint}>В очереди: {downloadQueue.length}</Text>
                )}
              </>
            )}
          </Surface>

          {/* Заголовок "Содержание" (как на web) */}
          <Text style={styles.contentTitle}>Содержание</Text>

          {/* Описание курса (сворачиваемое, как на web) */}
          {courseData?.courseDescription && (
            <CourseDescription
              description={courseData.courseDescription}
              equipment={courseData.courseEquipment}
              trainingLevel={courseData.courseTrainingLevel}
            />
          )}

          {/* Заголовок "План занятий:" (как на web) */}
          <Text style={styles.planTitle}>План занятий:</Text>

          {/* Список дней (как на web - все в одном ScrollView) */}
          {courseData?.trainingDays && courseData.trainingDays.length > 0 ? (
            <View style={styles.daysList}>
              {courseData.trainingDays.map((item, index) => (
                <View key={item.dayOnCourseId || item.id || `day-${index}`}>
                  {renderDayItem({ item, index })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isLoading
                  ? "Загрузка дней тренировок..."
                  : courseData
                    ? "Нет дней тренировок"
                    : "Не удалось загрузить данные"}
              </Text>
              {__DEV__ && courseData && (
                <Text style={styles.debugText}>
                  Debug: courseId={courseData.courseId}, days={courseData.trainingDays?.length || 0}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
    paddingHorizontal: 0,
    paddingTop: SPACING.md,
  },
  offlineSection: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  offlineButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  offlineButtonText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "600",
  },
  progressRow: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  queueHint: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  contentTitle: {
    color: "#352e2e",
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 60,
    lineHeight: 60,
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  planTitle: {
    color: "#352E2E",
    fontFamily: FONTS.impact,
    fontWeight: "600",
    fontSize: 20,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  daysList: {
    paddingBottom: SPACING.md,
  },
  dayCardWrapper: {
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 4, // Немного толще, чем на web (там 2px, но визуально кажется толще из-за структуры)
    position: "relative",
    backgroundColor: "#FFF8E5",
    minHeight: 120,
  },
  dayCard: {
    paddingVertical: Math.round(14 * 0.75),
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#FFF8E5",
    minHeight: 120,
  },
  timeBadgeWrapper: {
    position: "absolute",
    top: -10,
    right: -10,
    zIndex: 2,
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
  },
  timeBadge: {
    backgroundColor: "#636128",
    borderRadius: 50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 50,
  },
  timeBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  timeBadgeLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  timeBadgeTheory: {
    backgroundColor: "#af6d34",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timeBadgeTheoryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  timeBadgeTheoryLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  dayTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#352E2E",
    paddingRight: 60, // Место для бейджей времени
    fontFamily: FONTS.impact, // Impact как на web
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
    fontFamily: FONTS.montserrat,
  },
  equipmentLabel: {
    fontSize: 14,
    color: "#352E2E",
    marginTop: 4,
    marginBottom: 2,
    fontFamily: FONTS.montserrat,
  },
  equipment: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    fontFamily: FONTS.montserrat,
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
  debugText: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: "monospace",
  },
});
