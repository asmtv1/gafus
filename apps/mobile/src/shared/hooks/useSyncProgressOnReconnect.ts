import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useIsOffline } from "./useNetworkStatus";
import { reportClientError } from "@/shared/lib/tracer";
import { useProgressSyncStore } from "@/shared/stores/progressSyncStore";
import { useAuthStore } from "@/shared/stores/authStore";
import { canDispatchOwnerlessLegacyOfflineQueue } from "@/shared/stores/legacyOfflineReplayQuarantine";

/**
 * При появлении сети обрабатывает очередь мутаций прогресса (startStep, pause, resume, resetStep, complete).
 * При 3 подряд 401 показывает «Проверьте авторизацию» и останавливает повтор.
 * Инвалидирует кэш trainingDay после каждой успешной синхронизации.
 */
export function useSyncProgressOnReconnect(): void {
  const isOffline = useIsOffline();
  const processNext = useProgressSyncStore((s) => s.processNext);
  const queue = useProgressSyncStore((s) => s.queue);
  const principalId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? null) : null));
  const queryClient = useQueryClient();
  const processingRef = useRef(false);
  const isOfflineRef = useRef(isOffline);
  const pendingOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    // Do not transfer ownership of a pending in-memory queue across users.
    // Only an empty queue can release the locally observed owner.
    if (queue.length === 0) pendingOwnerRef.current = null;
    else if (principalId && pendingOwnerRef.current === null) {
      pendingOwnerRef.current = principalId;
    }
  }, [principalId, queue]);

  useEffect(() => {
    // Current user.id never proves ownership of old persisted v1.
    if (!canDispatchOwnerlessLegacyOfflineQueue()) return;
    if (
      !isOffline &&
      queue.length > 0 &&
      principalId &&
      pendingOwnerRef.current === principalId &&
      !processingRef.current
    ) {
      processingRef.current = true;
      const samePrincipal = () => {
        const current = useAuthStore.getState();
        return current.isAuthenticated && current.user?.id === principalId;
      };
      const run = async () => {
        try {
          for (;;) {
            // Connectivity or principal can change while a previous ACK is pending.
            // Never dispatch the next old-owner mutation under another session.
            if (isOfflineRef.current || !samePrincipal()) break;
            const result = await processNext();
            if (!samePrincipal()) break;
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
  }, [isOffline, principalId, processNext, queryClient, queue]);
}
