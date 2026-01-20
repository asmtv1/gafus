import { useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Text, Surface, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";

import { Loading } from "@/shared/components/ui";
import { AccordionStep } from "@/features/training/components";
import {
  useTrainingDay,
  useStartStep,
  usePauseStep,
  useResumeStep,
  useCompleteTheoryStep,
  useCompletePracticeStep,
} from "@/shared/hooks";
import { useTrainingStore, useStepStore, useTimerStore } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

/**
 * Экран дня тренировки с шагами
 */
export default function TrainingDayScreen() {
  const { courseType, dayId } = useLocalSearchParams<{
    courseType: string;
    dayId: string;
  }>();

  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  // Загрузка данных дня
  const { data, isLoading, error, refetch, isRefetching } = useTrainingDay(
    courseType,
    dayId
  );

  // Stores
  const { getOpenIndex, setOpenIndex } = useTrainingStore();
  const { getStepState, startStep, pauseStep, completeStep } = useStepStore();
  const { stopTimer } = useTimerStore();

  // Mutations
  const startStepMutation = useStartStep();
  const pauseStepMutation = usePauseStep();
  const resumeStepMutation = useResumeStep();
  const completeTheoryMutation = useCompleteTheoryStep();
  const completePracticeMutation = useCompletePracticeStep();

  const dayData = data?.data;
  const courseId = courseType; // Используем courseType как courseId для ключей

  // Текущий открытый шаг
  const openIndex = getOpenIndex(courseId, dayId) ?? -1;

  // Обработчики
  const handleToggleStep = useCallback(
    (index: number) => {
      setOpenIndex(courseId, dayId, openIndex === index ? null : index);
    },
    [courseId, dayId, openIndex, setOpenIndex]
  );

  const handleStartStep = useCallback(
    async (stepIndex: number, durationSec: number) => {
      try {
        // Локальное обновление
        startStep(courseId, dayId, stepIndex, durationSec);

        // Отправка на сервер
        await startStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          status: "IN_PROGRESS",
          durationSec,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка старта шага" });
      }
    },
    [courseId, dayId, startStep, startStepMutation]
  );

  const handlePauseStep = useCallback(
    async (stepIndex: number, remainingSec: number) => {
      try {
        pauseStep(courseId, dayId, stepIndex, remainingSec);

        await pauseStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          timeLeftSec: remainingSec,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка паузы" });
      }
    },
    [courseId, dayId, pauseStep, pauseStepMutation]
  );

  const handleResumeStep = useCallback(
    async (stepIndex: number) => {
      try {
        await resumeStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка возобновления" });
      }
    },
    [courseId, dayId, resumeStepMutation]
  );

  const handleCompleteStep = useCallback(
    async (stepIndex: number, isTheory: boolean, stepTitle?: string) => {
      try {
        // Останавливаем таймер если активен
        stopTimer();

        // Локальное обновление
        completeStep(courseId, dayId, stepIndex);

        // Отправка на сервер
        const params = {
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          stepTitle,
        };

        if (isTheory) {
          await completeTheoryMutation.mutateAsync(params);
        } else {
          await completePracticeMutation.mutateAsync(params);
        }

        setSnackbar({ visible: true, message: "Шаг выполнен!" });

        // Автоматически открываем следующий шаг
        const nextIndex = stepIndex + 1;
        if (dayData?.steps && nextIndex < dayData.steps.length) {
          setOpenIndex(courseId, dayId, nextIndex);
        }
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка сохранения" });
      }
    },
    [
      courseId,
      dayId,
      stopTimer,
      completeStep,
      completeTheoryMutation,
      completePracticeMutation,
      dayData?.steps,
      setOpenIndex,
    ]
  );

  // Подсчёт прогресса
  const progress = useMemo(() => {
    if (!dayData?.steps) return { completed: 0, total: 0, percent: 0 };

    const total = dayData.steps.length;
    const completed = dayData.steps.filter((s) => {
      const localState = getStepState(courseId, dayId, s.stepIndex);
      return (localState?.status || s.status) === "COMPLETED";
    }).length;

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [dayData?.steps, courseId, dayId, getStepState]);

  if (isLoading) {
    return <Loading fullScreen message="Загрузка шагов..." />;
  }

  if (error || !data?.success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>Ошибка загрузки дня</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: dayData?.title || "День тренировки",
        }}
      />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
        >
          {/* Прогресс дня */}
          <Surface style={styles.progressCard} elevation={1}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium">Прогресс</Text>
              <Text variant="titleMedium" style={styles.progressPercent}>
                {progress.percent}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress.percent}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </Surface>

          {/* Список шагов */}
          <View style={styles.stepsContainer}>
            {dayData?.steps.map((step, index) => (
              <AccordionStep
                key={step.id}
                step={step}
                index={index}
                isOpen={openIndex === index}
                localState={getStepState(courseId, dayId, index)}
                courseId={courseId}
                dayOnCourseId={dayId}
                onToggle={() => handleToggleStep(index)}
                onStart={() =>
                  handleStartStep(index, step.step.durationSec || 300)
                }
                onPause={(remainingSec) => handlePauseStep(index, remainingSec)}
                onResume={() => handleResumeStep(index)}
                onComplete={() =>
                  handleCompleteStep(
                    index,
                    step.step.type === "THEORY",
                    step.step.title
                  )
                }
              />
            ))}
          </View>
        </ScrollView>

        {/* Snackbar */}
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
      </SafeAreaView>
    </>
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
  progressCard: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  progressPercent: {
    color: COLORS.primary,
    fontWeight: "bold",
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  stepsContainer: {
    gap: SPACING.sm,
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
  },
});
