import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingApi, type UserStep } from "@/shared/lib/api";
import { useStepStore } from "@/shared/stores";

/**
 * Хук для загрузки дня тренировки с шагами
 */
export function useTrainingDay(courseType: string, dayOnCourseId: string) {
  const { syncFromServer } = useStepStore();

  return useQuery({
    queryKey: ["trainingDay", courseType, dayOnCourseId],
    queryFn: async () => {
      const response = await trainingApi.getDay(courseType, dayOnCourseId);

      if (response.success && response.data) {
        // Синхронизируем состояния шагов с сервера
        const steps = response.data.steps.map((s: UserStep) => ({
          stepIndex: s.stepIndex,
          status: s.status,
          remainingSec: s.remainingSec,
        }));

        // courseId нужно получить из response или передать
        // Пока используем courseType как временное решение
        syncFromServer(courseType, dayOnCourseId, steps);
      }

      return response;
    },
    enabled: !!courseType && !!dayOnCourseId,
  });
}

/**
 * Хук для старта шага
 */
export function useStartStep() {
  const queryClient = useQueryClient();
  const { startStep: startStepLocal } = useStepStore();

  return useMutation({
    mutationFn: trainingApi.startStep,
    onMutate: async (variables) => {
      // Оптимистичное обновление локального состояния
      startStepLocal(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex,
        variables.durationSec
      );
    },
    onSuccess: (_, variables) => {
      // Инвалидируем кэш дня
      queryClient.invalidateQueries({
        queryKey: ["trainingDay"],
      });
    },
  });
}

/**
 * Хук для паузы шага
 */
export function usePauseStep() {
  const queryClient = useQueryClient();
  const { pauseStep: pauseStepLocal } = useStepStore();

  return useMutation({
    mutationFn: trainingApi.pauseStep,
    onMutate: async (variables) => {
      pauseStepLocal(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex,
        variables.timeLeftSec
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
    },
  });
}

/**
 * Хук для возобновления шага
 */
export function useResumeStep() {
  const queryClient = useQueryClient();
  const { resumeStep: resumeStepLocal } = useStepStore();

  return useMutation({
    mutationFn: trainingApi.resumeStep,
    onMutate: async (variables) => {
      resumeStepLocal(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
    },
  });
}

/**
 * Хук для завершения теоретического шага
 */
export function useCompleteTheoryStep() {
  const queryClient = useQueryClient();
  const { completeStep } = useStepStore();

  return useMutation({
    mutationFn: trainingApi.completeTheoryStep,
    onMutate: async (variables) => {
      completeStep(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}

/**
 * Хук для завершения практического шага
 */
export function useCompletePracticeStep() {
  const queryClient = useQueryClient();
  const { completeStep } = useStepStore();

  return useMutation({
    mutationFn: trainingApi.completePracticeStep,
    onMutate: async (variables) => {
      completeStep(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}
