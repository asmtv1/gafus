import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Loading } from "@/shared/components/ui";
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

  const { data, isLoading, error, refetch } = useDailyCourseDay(normalizedScheduleId);
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

  const progressText = useMemo(() => {
    const steps = dayData?.steps ?? [];
    const completed = steps.filter((step, index) => {
      const local = getStepState(courseId, normalizedScheduleId, index);
      return (local?.status ?? step.status) === "COMPLETED";
    }).length;
    return `${completed}/${steps.length}`;
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
      <View style={styles.center}>
        <Text style={styles.errorText}>Курс дня не найден</Text>
        <Pressable onPress={() => refetch()}>
          <Text style={styles.linkText}>Попробовать снова</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Курс дня</Text>
        <Text style={styles.progress}>Прогресс: {progressText}</Text>
      </View>

      <Surface style={styles.descriptionContainer} elevation={0}>
        <Pressable
          style={[
            styles.descriptionHeader,
            isDescriptionOpen && styles.descriptionHeaderExpanded,
          ]}
          onPress={() => setIsDescriptionOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={isDescriptionOpen ? "Скрыть описание дня" : "Показать описание дня"}
        >
          <Text style={styles.descriptionTitle}>Описание дня</Text>
          <View style={styles.descriptionExpand}>
            <Text style={styles.descriptionExpandText}>
              {isDescriptionOpen ? "Скрыть" : "Подробнее"}
            </Text>
            <MaterialCommunityIcons
              name={isDescriptionOpen ? "chevron-up" : "chevron-down"}
              size={22}
              color="#636128"
            />
          </View>
        </Pressable>
        {isDescriptionOpen && (
          <View style={styles.descriptionContent}>
            <Text style={styles.bundleTitle}>{dayData.title}</Text>
            {dayData.description ? (
              <Text style={styles.description}>{dayData.description}</Text>
            ) : null}
          </View>
        )}
      </Surface>

      <View style={styles.steps}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#636128",
    fontFamily: FONTS.impact,
    fontSize: 64,
    lineHeight: 68,
    textAlign: "center",
    fontWeight: "400",
    marginBottom: SPACING.sm,
  },
  descriptionContainer: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
    backgroundColor: "transparent",
    marginBottom: 24,
  },
  descriptionHeader: {
    minHeight: 58,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  descriptionHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  descriptionTitle: {
    color: "#352E2E",
    fontFamily: FONTS.impact,
    fontSize: 16,
    fontWeight: "600",
  },
  descriptionExpand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  descriptionExpandText: {
    color: "#636128",
    fontSize: 14,
    fontWeight: "600",
  },
  descriptionContent: {
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#636128",
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
  description: {
    color: "#352E2E",
    lineHeight: 22,
  },
  progress: {
    color: "#636128",
    fontWeight: "700",
  },
  steps: {
    gap: SPACING.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
  },
  linkText: {
    color: COLORS.secondary,
    fontWeight: "700",
  },
});
