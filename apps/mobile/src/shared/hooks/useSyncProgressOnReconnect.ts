import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useNetworkStatus } from "./useNetworkStatus";
import { useProgressSyncStore } from "@/shared/stores/progressSyncStore";

/**
 * При появлении сети обрабатывает очередь мутаций прогресса (startStep, pause, resume, complete).
 * При 3 подряд 401 показывает «Проверьте авторизацию» и останавливает повтор.
 */
export function useSyncProgressOnReconnect(): void {
  const { isOffline } = useNetworkStatus();
  const processNext = useProgressSyncStore((s) => s.processNext);
  const prevOffline = useRef(isOffline);

  useEffect(() => {
    if (prevOffline.current && !isOffline) {
      prevOffline.current = false;
      let stop = false;
      const run = async () => {
        while (!stop) {
          const result = await processNext();
          if (result === "done") break;
          if (result === "unauthorized") {
            Alert.alert(
              "Синхронизация",
              "Не удалось синхронизировать прогресс. Проверьте авторизацию.",
            );
            break;
          }
        }
      };
      run();
    } else {
      prevOffline.current = isOffline;
    }
  }, [isOffline, processNext]);
}
