import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

import { reportClientError } from "@/shared/lib/tracer";
import { ensureOtaInstallationIdentity } from "@/shared/lib/ota/installationIdentity";
import { trackOtaEvent, trackOtaLaunch } from "@/shared/lib/ota/telemetry";

/** Даём сети на Android подняться до первого запроса к Expo Update. */
const INITIAL_DELAY_MS = 1200;
const FOREGROUND_DELAY_MS = 500;
/** Повтор только после ошибки check/fetch (часто сеть ещё не готова). */
const RETRY_AFTER_ERROR_MS = 4500;
/** Не дёргать сервер при каждом сворачивании подряд. */
const FOREGROUND_CHECK_COOLDOWN_MS = 90_000;

async function checkFetchAndReload(): Promise<void> {
  await ensureOtaInstallationIdentity();
  let result: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>;
  try {
    result = await Updates.checkForUpdateAsync();
  } catch (error) {
    void trackOtaEvent("UPDATE_ERROR", undefined, "CHECK_FAILED");
    throw error;
  }
  void trackOtaEvent("CHECKED");
  if (!result.isAvailable) return;
  const updateId = "manifest" in result ? result.manifest?.id : undefined;
  try {
    await Updates.fetchUpdateAsync();
  } catch (error) {
    void trackOtaEvent("UPDATE_ERROR", updateId, "FETCH_FAILED");
    throw error;
  }
  // The event is queued on device before reload; network delivery is best effort.
  await trackOtaEvent("DOWNLOADED", updateId, undefined, true);
  try {
    await Updates.reloadAsync();
  } catch (error) {
    void trackOtaEvent("UPDATE_ERROR", updateId, "RELOAD_FAILED");
    throw error;
  }
}

/**
 * Продакшен: проверка OTA после старта и при возврате в приложение.
 * На Android первая проверка без задержки часто падает или не видит обновление из‑за сети.
 */
export function useOtaAutoApply(enabled = true): void {
  const lastForegroundCheckRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || __DEV__) {
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

    void trackOtaLaunch();
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
  }, [enabled]);
}
