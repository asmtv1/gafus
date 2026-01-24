import { useQuery } from "@tanstack/react-query";
import { trainingApi, type TrainingDaysResponse } from "@/shared/lib/api";
import { useTrainingStore } from "@/shared/stores";
import type { ApiResponse } from "@/shared/lib/api/client";

/**
 * Хук для загрузки списка дней тренировок
 */
export function useTrainingDays(courseType: string) {
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  return useQuery<ApiResponse<TrainingDaysResponse>>({
    queryKey: ["trainingDays", courseType],
    queryFn: async () => {
      const response = await trainingApi.getDays(courseType);

      if (response.success && response.data) {
        // Сохраняем в локальный кэш
        setCachedTrainingDays(courseType, response.data);
      }

      return response;
    },
    // Используем кэш из store как initialData
    initialData: () => {
      const cached = getCachedTrainingDays(courseType);
      if (cached.data && !cached.isExpired) {
        return { success: true, data: cached.data } as ApiResponse<TrainingDaysResponse>;
      }
      return undefined;
    },
    staleTime: 2 * 60 * 1000, // 2 минуты
  });
}
