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
      if (__DEV__) {
        console.log("[useTrainingDay] Запрос данных дня:", {
          courseType,
          dayOnCourseId,
        });
      }

      try {
        const response = await trainingApi.getDay(courseType, dayOnCourseId);

        if (__DEV__) {
          const errorInfo = response.error
            ? {
                errorType: typeof response.error,
                errorName:
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "name" in response.error
                    ? (response.error as any).name
                    : null,
                errorIssues:
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "issues" in response.error
                    ? (response.error as any).issues
                    : null,
                errorMessage:
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? (response.error as any).message
                    : typeof response.error === "string"
                      ? response.error
                      : null,
              }
            : null;

          console.log("[useTrainingDay] Ответ API:", {
            success: response.success,
            hasData: !!response.data,
            dataKeys: response.data ? Object.keys(response.data) : [],
            stepsCount: response.data?.steps?.length ?? 0,
            error: errorInfo,
            code: (response as any).code,
          });
        }

        if (response.success && response.data) {
          if (__DEV__) {
            console.log("[useTrainingDay] Структура данных:", {
              title: response.data.title,
              dayOnCourseId: response.data.dayOnCourseId,
              stepsLength: response.data.steps?.length ?? 0,
              firstStep: response.data.steps?.[0]
                ? {
                    keys: Object.keys(response.data.steps[0]),
                    hasStepIndex: "stepIndex" in (response.data.steps[0] || {}),
                    hasOrder: "order" in (response.data.steps[0] || {}),
                    hasNestedStep: "step" in (response.data.steps[0] || {}),
                    stepData: response.data.steps[0],
                  }
                : null,
            });
          }

          // Синхронизируем состояния шагов с сервера
          // API может возвращать разные структуры данных
          const steps = response.data.steps.map((s: any, index: number) => {
            // Используем stepIndex, если есть, иначе order или index
            const stepIndex = s.stepIndex ?? s.order ?? index;
            return {
              stepIndex,
              status: s.status || "NOT_STARTED",
              remainingSec: s.remainingSec ?? s.remainingSecOnServer ?? null,
            };
          });

          if (__DEV__) {
            console.log("[useTrainingDay] Синхронизация шагов:", {
              stepsCount: steps.length,
              steps: steps.slice(0, 3), // Первые 3 для примера
            });
          }

          // courseId нужно получить из response или передать
          // Пока используем courseType как временное решение
          syncFromServer(courseType, dayOnCourseId, steps);
        } else {
          if (__DEV__) {
            const errorDetails = response.error
              ? {
                  type: typeof response.error,
                  name:
                    typeof response.error === "object" &&
                    response.error !== null &&
                    "name" in response.error
                      ? (response.error as any).name
                      : null,
                  issues:
                    typeof response.error === "object" &&
                    response.error !== null &&
                    "issues" in response.error
                      ? (response.error as any).issues
                      : null,
                  message:
                    typeof response.error === "object" &&
                    response.error !== null &&
                    "message" in response.error
                      ? (response.error as any).message
                      : typeof response.error === "string"
                        ? response.error
                        : null,
                }
              : null;

            console.error("[useTrainingDay] Ошибка загрузки:", {
              success: response.success,
              error: errorDetails,
              code: (response as any).code,
            });
          }
        }

        return response;
      } catch (error) {
        if (__DEV__) {
          console.error("[useTrainingDay] Исключение при загрузке:", error);
        }
        throw error;
      }
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
        variables.durationSec,
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
        variables.timeLeftSec,
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
      resumeStepLocal(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
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
      completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
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
      completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}
