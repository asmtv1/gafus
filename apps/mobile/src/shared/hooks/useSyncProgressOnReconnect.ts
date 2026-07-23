import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useIsOffline } from "./useNetworkStatus";
import { reportClientError } from "@/shared/lib/tracer";
import { useProgressSyncStore } from "@/shared/stores/progressSyncStore";

/**
 * При появлении сети обрабатывает очередь мутаций прогресса (startStep, pause, resume, resetStep, complete).
 * При 3 подряд 401 показывает «Проверьте авторизацию» и останавливает повтор.
 * Инвалидирует кэш trainingDay после каждой успешной синхронизации.
 */
export function useSyncProgressOnReconnect(): void {
  const isOffline = useIsOffline();
  const processNext = useProgressSyncStore((s) => s.processNext);
  const queue = useProgressSyncStore((s) => s.queue);
  const queryClient = useQueryClient();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!isOffline && queue.length > 0 && !processingRef.current) {
      processingRef.current = true;
      const run = async () => {
        try {
          for (;;) {
            const result = await processNext();
            if (result === "ok") {
              queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
            }
            if (result === "done" || result === "retry" || result === "unauthorized") {
              if (result === "unauthorized") {
                Alert.alert(
                  "Синхронизация",
                  "Не удалось синхронизировать прогресс. Проверьте авторизацию.",
                );
              }
              break;
            }
          }
        } finally {
          processingRef.current = false;
        }
      };
      void run().catch((error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "SyncProgressOnReconnect",
          keys: { operation: "process_queue" },
        });
        // processNext уже логирует; избегаем unhandled rejection
      });
    }
  }, [isOffline, processNext, queryClient, queue]);
}
