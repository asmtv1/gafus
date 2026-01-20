import { useQuery } from "@tanstack/react-query";
import { trainingApi } from "@/shared/lib/api";
import { useTrainingStore } from "@/shared/stores";

/**
 * Хук для загрузки списка дней тренировок
 */
export function useTrainingDays(courseType: string) {
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  return useQuery({
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
        return { success: true, data: cached.data };
      }
      return undefined;
    },
    staleTime: 2 * 60 * 1000, // 2 минуты
  });
}
