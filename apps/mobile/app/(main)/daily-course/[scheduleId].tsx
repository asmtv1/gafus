import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text, Surface } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Loading } from "@/shared/components/ui";
import { MarkdownText } from "@/shared/components";
import { AccordionStep } from "@/features/training/components";
import {
  useDailyCourseCompleteStep,
  useDailyCourseDay,
  useDailyCoursePauseStep,
  useDailyCourseResetStep,
  useDailyCourseResumeStep,
  useDailyCourseStartStep,
} from "@/shared/hooks/useDailyCourse";
import { getDailyCourseStoreCourseId } from "@/shared/lib/api";
import { useStepStore, useTimerStore, useTrainingStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/constants";

export default function DailyCourseDayScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const router = useRouter();
  const normalizedScheduleId = typeof scheduleId === "string" ? scheduleId : "";
  const courseId = getDailyCourseStoreCourseId(normalizedScheduleId);

  const { data, isLoading, error, refetch, isRefetching } = useDailyCourseDay(normalizedScheduleId);
  const dayData = data?.data;

  const initializeStep = useStepStore((s) => s.initializeStep);
  const getStepState = useStepStore((s) => s.getStepState);
  const startStepLocal = useStepStore((s) => s.startStep);
  const pauseStepLocal = useStepStore((s) => s.pauseStep);
  const resumeStepLocal = useStepStore((s) => s.resumeStep);
  const resetStepLocal = useStepStore((s) => s.resetStep);
  const completeStepLocal = useStepStore((s) => s.completeStep);
  const openIndex = useTrainingStore((s) => s.getOpenIndex(courseId, normalizedScheduleId));
  const setOpenIndex = useTrainingStore((s) => s.setOpenIndex);
  const stopTimer = useTimerStore((s) => s.stopTimer);

  const startMutation = useDailyCourseStartStep();
  const pauseMutation = useDailyCoursePauseStep();
  const resumeMutation = useDailyCourseResumeStep();
  const resetMutation = useDailyCourseResetStep();
  const completeMutation = useDailyCourseCompleteStep();
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  useEffect(() => {
    if (!dayData?.steps) return;
    dayData.steps.forEach((step, index) => {
      initializeStep(
        courseId,
        normalizedScheduleId,
        index,
        step.step.durationSec ?? 0,
        step.status ?? "NOT_STARTED",
        {
          serverPaused: step.isPausedOnServer,
          serverRemainingSec: step.remainingSec ?? undefined,
        },
      );
    });
  }, [courseId, dayData?.steps, initializeStep, normalizedScheduleId]);

  const progress = useMemo(() => {
    const steps = dayData?.steps ?? [];
    const completed = steps.filter((step, index) => {
      const local = getStepState(courseId, normalizedScheduleId, index);
      return (local?.status ?? step.status) === "COMPLETED";
    }).length;
    const total = steps.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [courseId, dayData?.steps, getStepState, normalizedScheduleId]);

  const handleToggle = useCallback(
    (index: number) => {
      setOpenIndex(courseId, normalizedScheduleId, openIndex === index ? null : index);
    },
    [courseId, normalizedScheduleId, openIndex, setOpenIndex],
  );

  const handleStart = useCallback(
    (stepIndex: number, durationSec: number) => {
      startStepLocal(courseId, normalizedScheduleId, stepIndex, durationSec);
      startMutation.mutate({
        scheduleId: normalizedScheduleId,
        stepIndex,
        status: "IN_PROGRESS",
        durationSec,
      });
    },
    [courseId, normalizedScheduleId, startMutation, startStepLocal],
  );

  const handlePause = useCallback(
    (stepIndex: number, remainingSec: number) => {
      pauseStepLocal(courseId, normalizedScheduleId, stepIndex, remainingSec);
      pauseMutation.mutate({ scheduleId: normalizedScheduleId, stepIndex, timeLeftSec: remainingSec });
    },
    [courseId, normalizedScheduleId, pauseMutation, pauseStepLocal],
  );

  const handleResume = useCallback(
    (stepIndex: number) => {
      resumeStepLocal(courseId, normalizedScheduleId, stepIndex);
      resumeMutation.mutate({ scheduleId: normalizedScheduleId, stepIndex });
    },
    [courseId, normalizedScheduleId, resumeMutation, resumeStepLocal],
  );

  const handleReset = useCallback(
    (stepIndex: number, durationSec: number) => {
      stopTimer(courseId, normalizedScheduleId, stepIndex);
      resetStepLocal(courseId, normalizedScheduleId, stepIndex, durationSec);
      resetMutation.mutate({ scheduleId: normalizedScheduleId, stepIndex });
    },
    [courseId, normalizedScheduleId, resetMutation, resetStepLocal, stopTimer],
  );

  const handleComplete = useCallback(
    (stepIndex: number) => {
      stopTimer(courseId, normalizedScheduleId, stepIndex);
      completeStepLocal(courseId, normalizedScheduleId, stepIndex);
      completeMutation.mutate({ scheduleId: normalizedScheduleId, stepIndex });
    },
    [completeMutation, completeStepLocal, courseId, normalizedScheduleId, stopTimer],
  );

  if (isLoading) {
    return <Loading fullScreen message="Загрузка курса дня..." />;
  }

  if (error || !data?.success || !dayData) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
            <Text style={styles.backText}>Назад</Text>
          </Pressable>
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>Курс дня не найден</Text>
            <Pressable onPress={() => refetch()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Попробовать снова</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
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
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        >
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>Курс дня</Text>
            <View style={styles.dayHeaderDivider} />
          </View>

          <Surface style={styles.progressCard} elevation={1}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium">Прогресс</Text>
              <Text variant="titleMedium" style={styles.progressPercent}>
                {progress.percent}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </Surface>

          <View style={styles.descriptionDayContainer}>
            <Pressable
              style={[
                styles.descriptionDayHeader,
                isDescriptionOpen && styles.descriptionDayHeaderExpanded,
              ]}
              onPress={() => setIsDescriptionOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={isDescriptionOpen ? "Скрыть описание дня" : "Показать описание дня"}
            >
              <Text style={styles.descriptionDayTitle}>Описание дня</Text>
              <View style={styles.descriptionDayExpand}>
                <Text style={styles.descriptionDayExpandText}>
                  {isDescriptionOpen ? "Скрыть" : "Подробнее"}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={24}
                  color={COLORS.primary}
                  style={[
                    styles.descriptionDayIcon,
                    isDescriptionOpen && styles.descriptionDayIconExpanded,
                  ]}
                />
              </View>
            </Pressable>
            {isDescriptionOpen && (
              <View style={styles.descriptionDayContent}>
                <Text style={styles.bundleTitle}>{dayData.title}</Text>
                {dayData.description ? <MarkdownText text={dayData.description} /> : null}
              </View>
            )}
          </View>

          <View style={styles.stepsContainer}>
            {dayData.steps.map((step, index) => (
              <AccordionStep
                key={`${normalizedScheduleId}-${step.stepId}-${index}`}
                step={step}
                index={index}
                stepNumber={index + 1}
                isOpen={openIndex === index}
                localState={getStepState(courseId, normalizedScheduleId, index)}
                courseId={courseId}
                dayOnCourseId={normalizedScheduleId}
                onToggle={() => handleToggle(index)}
                onStart={() => handleStart(index, step.step.durationSec ?? 0)}
                onPause={(remainingSec) => handlePause(index, remainingSec)}
                onResume={() => handleResume(index)}
                onComplete={() => handleComplete(index)}
                onReset={(durationSec) => handleReset(index, durationSec)}
              />
            ))}
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
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
  dayHeader: {
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  dayTitle: {
    color: COLORS.border,
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 52,
    lineHeight: 60,
    textAlign: "center",
  },
  dayHeaderDivider: {
    alignSelf: "stretch",
    height: 2,
    backgroundColor: COLORS.border,
    borderRadius: 1,
    marginTop: SPACING.sm,
  },
  progressCard: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.cardBackground,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  progressPercent: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.borderLight,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  progressText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  descriptionDayContainer: {
    marginBottom: SPACING.lg,
    width: "100%",
    maxWidth: 500,
  },
  descriptionDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    paddingHorizontal: 20,
    backgroundColor: "#ece5d2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
  },
  descriptionDayHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  descriptionDayTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#352e2e",
  },
  descriptionDayExpand: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  descriptionDayExpandText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.primary,
  },
  descriptionDayIcon: {
    transform: [{ rotate: "0deg" }],
  },
  descriptionDayIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  descriptionDayContent: {
    backgroundColor: "#ece5d2",
    borderWidth: 1,
    borderColor: "#636128",
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    padding: 20,
  },
  bundleTitle: {
    color: "#352E2E",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: SPACING.sm,
  },
  stepsContainer: {
    gap: SPACING.sm,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.md,
    textAlign: "center",
  },
  retryButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
