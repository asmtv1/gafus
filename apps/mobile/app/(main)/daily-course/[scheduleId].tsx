import { useCallback, useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, Surface } from "react-native-paper";

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
      <Surface style={styles.header} elevation={0}>
        <Text style={styles.eyebrow}>{dayData.mskDate}</Text>
        <Text style={styles.title}>{dayData.title}</Text>
        {dayData.description ? <Text style={styles.description}>{dayData.description}</Text> : null}
        <Text style={styles.progress}>Прогресс: {progressText}</Text>
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
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  eyebrow: {
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  title: {
    color: COLORS.text,
    fontFamily: FONTS.impact,
    fontSize: 28,
    marginBottom: SPACING.sm,
  },
  description: {
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  progress: {
    color: COLORS.secondary,
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
