import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkStatus } from "./useNetworkStatus";
import { useProgressSyncStore } from "@/shared/stores/progressSyncStore";

/**
 * При появлении сети обрабатывает очередь мутаций прогресса (startStep, pause, resume, resetStep, complete).
 * При 3 подряд 401 показывает «Проверьте авторизацию» и останавливает повтор.
 * Инвалидирует кэш trainingDay после каждой успешной синхронизации.
 */
export function useSyncProgressOnReconnect(): void {
  const { isOffline } = useNetworkStatus();
  const processNext = useProgressSyncStore((s) => s.processNext);
  const queryClient = useQueryClient();
  const prevOffline = useRef(isOffline);

  useEffect(() => {
    if (prevOffline.current && !isOffline) {
      prevOffline.current = false;
      const run = async () => {
        for (;;) {
          const result = await processNext();
          if (result === "ok") {
            queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
          }
          if (result === "done" || result === "unauthorized") {
            if (result === "unauthorized") {
              Alert.alert(
                "Синхронизация",
                "Не удалось синхронизировать прогресс. Проверьте авторизацию.",
              );
            }
            break;
          }
        }
      };
      void run().catch(() => {
        // processNext уже логирует; избегаем unhandled rejection
      });
    } else {
      prevOffline.current = isOffline;
    }
  }, [isOffline, processNext, queryClient]);
}
