import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

import { reportClientError } from "@/shared/lib/tracer";

/** Даём сети на Android подняться до первого запроса к Expo Update. */
const INITIAL_DELAY_MS = 1200;
const FOREGROUND_DELAY_MS = 500;
/** Повтор только после ошибки check/fetch (часто сеть ещё не готова). */
const RETRY_AFTER_ERROR_MS = 4500;
/** Не дёргать сервер при каждом сворачивании подряд. */
const FOREGROUND_CHECK_COOLDOWN_MS = 90_000;

async function checkFetchAndReload(): Promise<void> {
  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) {
    return;
  }
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}

/**
 * Продакшен: проверка OTA после старта и при возврате в приложение.
 * На Android первая проверка без задержки часто падает или не видит обновление из‑за сети.
 */
export function useOtaAutoApply(): void {
  const lastForegroundCheckRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (__DEV__) {
      return;
    }
    if (!Updates.isEnabled) {
      return;
    }

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          resolve();
        }, ms);
        timeouts.push(t);
      });

    async function tryOta(source: string, waitBeforeMs: number) {
      if (runningRef.current || cancelled) {
        return;
      }
      runningRef.current = true;
      try {
        await delay(waitBeforeMs);
        if (cancelled) {
          return;
        }
        try {
          await checkFetchAndReload();
        } catch {
          if (cancelled) {
            return;
          }
          await delay(RETRY_AFTER_ERROR_MS);
          if (cancelled) {
            return;
          }
          try {
            await checkFetchAndReload();
          } catch (err2) {
            reportClientError(err2 instanceof Error ? err2 : new Error(String(err2)), {
              issueKey: "OTAUpdate",
              keys: { operation: "check_fetch_reload", source, phase: "retry" },
            });
          }
        }
      } finally {
        runningRef.current = false;
      }
    }

    void tryOta("cold_start", INITIAL_DELAY_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active" || cancelled) {
        return;
      }
      const now = Date.now();
      if (now - lastForegroundCheckRef.current < FOREGROUND_CHECK_COOLDOWN_MS) {
        return;
      }
      lastForegroundCheckRef.current = now;
      void tryOta("foreground", FOREGROUND_DELAY_MS);
    };

    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      for (const t of timeouts) {
        clearTimeout(t);
      }
      sub.remove();
    };
  }, []);
}
