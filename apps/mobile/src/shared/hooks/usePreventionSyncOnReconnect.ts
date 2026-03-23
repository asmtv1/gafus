import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkStatus } from "./useNetworkStatus";
import { usePreventionSyncStore } from "@/shared/stores/preventionSyncStore";

/**
 * При появлении сети обрабатывает очередь записей профилактики (batch upsert по petId).
 * При 401 показывает «Проверьте авторизацию» и очищает очередь.
 */
export function usePreventionSyncOnReconnect(): void {
  const { isOffline } = useNetworkStatus();
  const processQueue = usePreventionSyncStore((s) => s.processQueue);
  const queryClient = useQueryClient();
  const prevOffline = useRef(isOffline);

  useEffect(() => {
    if (prevOffline.current && !isOffline) {
      prevOffline.current = false;
      const run = async () => {
        for (;;) {
          const result = await processQueue();
          if (result === "ok") {
            queryClient.invalidateQueries({ queryKey: ["petPrevention"] });
          }
          if (result === "done" || result === "unauthorized") {
            if (result === "unauthorized") {
              Alert.alert(
                "Синхронизация",
                "Не удалось синхронизировать записи о процедурах. Проверьте авторизацию.",
              );
            }
            break;
          }
        }
      };
      void run().catch(() => {});
    } else {
      prevOffline.current = isOffline;
    }
  }, [isOffline, processQueue, queryClient]);
}
