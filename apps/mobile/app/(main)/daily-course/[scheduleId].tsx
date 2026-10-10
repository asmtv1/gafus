import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button, Loading } from "@/shared/components/ui";
import { AppBackButton, MarkdownText, TexturedSafeAreaView } from "@/shared/components";
import { AccordionStep } from "@/features/training";
import {
  useDailyCourseCompleteStep,
  useDailyCourseDay,
  useDailyCoursePauseStep,
  useDailyCourseResetStep,
  useDailyCourseResumeStep,
  useDailyCourseStartStep,
} from "@/shared/hooks/useDailyCourse";
import { getDailyCourseStoreCourseId } from "@/shared/lib/api";
import { useDayStepStatuses, useStepStore, useTimerStore, useTrainingStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/shared/config";

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
  const localStepStatuses = useDayStepStatuses(
    courseId,
    normalizedScheduleId,
    dayData?.steps.length ?? 0,
  );

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
      return (localStepStatuses[index] ?? step.status) === "COMPLETED";
    }).length;
    const total = steps.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [dayData?.steps, localStepStatuses]);

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
      pauseMutation.mutate({
        scheduleId: normalizedScheduleId,
        stepIndex,
        timeLeftSec: remainingSec,
      });
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
    return <Loading fullScreen message="Загрузка задания дня..." />;
  }

  if (error || !data?.success || !dayData) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <TexturedSafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <AppBackButton style={styles.backRow} onPress={() => router.back()} />
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>Задание дня не найдено</Text>
            <Button
              label="Попробовать снова"
              fullWidth={false}
              height={34}
              fontFamily={null}
              fontWeight="600"
              fontSize={14}
              lineHeight={18}
              horizontalPadding={SPACING.md}
              verticalPadding={SPACING.sm}
              borderRadius={8}
              style={styles.retryButtonLayout}
              onPress={() => refetch()}
            />
          </View>
        </TexturedSafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TexturedSafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        >
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>Задание дня</Text>
            <View style={styles.dayHeaderDivider} />
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Прогресс</Text>
              <Text style={styles.progressPercent}>{progress.percent}%</Text>
            </View>
            <View
              style={styles.progressBar}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Прогресс дня"
              accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
            >
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </View>

          <View style={styles.descriptionDayContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.descriptionDayHeader,
                isDescriptionOpen && styles.descriptionDayHeaderExpanded,
                pressed && styles.descriptionDayHeaderPressed,
              ]}
              onPress={() => setIsDescriptionOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={
                isDescriptionOpen ? "Скрыть описание дня" : "Показать описание дня"
              }
              accessibilityState={{ expanded: isDescriptionOpen }}
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
      </TexturedSafeAreaView>
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
    padding: 20,
    borderRadius: 16,
    borderCurve: "continuous",
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
    boxShadow: "0 2px 8px rgba(53, 46, 46, 0.14)",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  progressTitle: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
  },
  progressPercent: {
    color: COLORS.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
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
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionDayContainer: {
    marginBottom: SPACING.lg,
    width: "100%",
    maxWidth: 500,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.12)",
    borderTopColor: "rgba(255, 255, 255, 0.96)",
    backgroundColor: "#FFFDF5",
    boxShadow: "0 7px 14px rgba(53, 52, 16, 0.22)",
    elevation: 7,
  },
  descriptionDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 66,
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
    borderRadius: 20,
    borderCurve: "continuous",
  },
  descriptionDayHeaderExpanded: {
    backgroundColor: "#FAF6EA",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  descriptionDayHeaderPressed: {
    backgroundColor: "#F4EEDC",
  },
  descriptionDayTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: FONTS.montserratBold,
    color: "#352e2e",
  },
  descriptionDayExpand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 36,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 18,
    backgroundColor: "rgba(99, 97, 40, 0.09)",
  },
  descriptionDayExpandText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
  },
  descriptionDayIcon: {
    transform: [{ rotate: "0deg" }],
  },
  descriptionDayIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  descriptionDayContent: {
    backgroundColor: "#FFFDF5",
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.14)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: "continuous",
    overflow: "hidden",
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
  retryButtonLayout: {
    marginTop: SPACING.md,
  },
});
