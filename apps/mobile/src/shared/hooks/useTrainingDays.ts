import { useOfflineCourseScopeVersion } from "./useOfflineCourseScopeVersion";
import { getOfflineCourseScopeVersion, captureOfflineCourseScope } from "@/shared/lib/offline/offlineCourseSession";
import { useQuery } from "@tanstack/react-query";
import { reportClientError } from "@/shared/lib/error-reporting";
import { trainingApi, type TrainingDaysResponse } from "@/shared/lib/api";
import { useStepStore } from "@/shared/stores";
import type { ApiResponse } from "@/shared/lib/api/client";
import { getCourseMeta } from "@/shared/lib/offline/offlineStorage";
import { mapMetaToTrainingDaysResponse } from "@/shared/lib/offline/mapOfflineMetaToTraining";

/**
 * Хук для загрузки списка дней тренировок.
 * При ошибке сети отдаёт офлайн-данные из getCourseMeta, если курс скачан.
 */
export function useTrainingDays(courseType: string) {
  const scopeVersion = useOfflineCourseScopeVersion();
  const getStepState = useStepStore((s) => s.getStepState);
  const isNetworkErrorResponse = (response: ApiResponse<TrainingDaysResponse>): boolean => {
    return response.code === "NETWORK_ERROR" || response.error === "Нет подключения к интернету";
  };

  return useQuery<ApiResponse<TrainingDaysResponse>>({
    queryKey: ["trainingDays", courseType, scopeVersion],
    queryFn: async () => {
      const assertScope = () => {
        if (getOfflineCourseScopeVersion() !== scopeVersion) throw new Error("TRAINING_SESSION_CHANGED");
      };
      assertScope();
      const scope = captureOfflineCourseScope();
      try {
        const response = await trainingApi.getDays(courseType);
        assertScope();
        if (response.success && response.data) {
          return response;
        }

        if (isNetworkErrorResponse(response)) {
          const meta = await getCourseMeta(courseType, scope);
          assertScope();
          if (meta) {
            const data = mapMetaToTrainingDaysResponse(meta, getStepState);
            return { success: true, data };
          }
        }

        return response;
      } catch (err) {
        assertScope();
        reportClientError(err, {
          issueKey: "useTrainingDays",
          severity: "warning",
          keys: { operation: "api_then_offline", courseType },
        });
        const meta = await getCourseMeta(courseType, scope);
        assertScope();
        if (meta) {
          const data = mapMetaToTrainingDaysResponse(meta, getStepState);
          return { success: true, data };
        }
        throw new Error("Нет подключения к интернету");
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}
