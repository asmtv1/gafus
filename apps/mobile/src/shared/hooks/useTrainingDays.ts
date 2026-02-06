import { useQuery } from "@tanstack/react-query";
import { trainingApi, type TrainingDaysResponse } from "@/shared/lib/api";
import { useStepStore, useTrainingStore } from "@/shared/stores";
import type { ApiResponse } from "@/shared/lib/api/client";
import { getCourseMeta } from "@/shared/lib/offline/offlineStorage";
import { mapMetaToTrainingDaysResponse } from "@/shared/lib/offline/mapOfflineMetaToTraining";

/**
 * Хук для загрузки списка дней тренировок.
 * При ошибке сети отдаёт офлайн-данные из getCourseMeta, если курс скачан.
 */
export function useTrainingDays(courseType: string) {
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();
  const getStepState = useStepStore((s) => s.getStepState);

  return useQuery<ApiResponse<TrainingDaysResponse>>({
    queryKey: ["trainingDays", courseType],
    queryFn: async () => {
      try {
        const response = await trainingApi.getDays(courseType);
        if (response.success && response.data) {
          setCachedTrainingDays(courseType, response.data);
        }
        return response;
      } catch {
        const meta = await getCourseMeta(courseType);
        if (meta) {
          const data = mapMetaToTrainingDaysResponse(meta, getStepState);
          return { success: true, data };
        }
        throw new Error("Нет подключения к интернету");
      }
    },
    initialData: () => {
      const cached = getCachedTrainingDays(courseType);
      if (cached.data && !cached.isExpired) {
        return { success: true, data: cached.data } as ApiResponse<TrainingDaysResponse>;
      }
      return undefined;
    },
    staleTime: 2 * 60 * 1000,
  });
}
