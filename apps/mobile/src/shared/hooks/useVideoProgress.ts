import { useCallback, useEffect, useRef, useState } from "react";

import { trainingApi } from "@/shared/lib/api/training";
import { reportClientError } from "@/shared/lib/tracer";

interface UseVideoProgressResult {
  initialTimeSec: number | undefined;
  saveProgress: (positionSec: number) => void;
}

/** Загружает прогресс и сохраняет позиции последовательно, не допуская гонки старых запросов. */
export function useVideoProgress(
  videoId: string | null | undefined,
  enabled = true,
): UseVideoProgressResult {
  const [initialTimeSec, setInitialTimeSec] = useState<number | undefined>(undefined);
  const activeVideoIdRef = useRef<string | null>(videoId ?? null);
  const pendingPositionRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    activeVideoIdRef.current = videoId ?? null;
    pendingPositionRef.current = null;
    setInitialTimeSec(undefined);
    const requestId = ++requestIdRef.current;
    if (!videoId || !enabled) return;

    void trainingApi
      .getVideoProgress(videoId)
      .then((response) => {
        if (requestIdRef.current !== requestId) return;
        if (response.success) {
          const position = response.data?.lastPositionSec;
          setInitialTimeSec(typeof position === "number" && position > 0 ? position : undefined);
          return;
        }
        throw new Error(response.error || "Не удалось загрузить прогресс видео");
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoProgress",
          keys: { operation: "load" },
        });
      });
    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [videoId, enabled]);

  const drainSaveQueue = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      while (pendingPositionRef.current != null) {
        const positionSec = pendingPositionRef.current;
        pendingPositionRef.current = null;
        const currentVideoId = activeVideoIdRef.current;
        if (!currentVideoId) continue;

        const response = await trainingApi.saveVideoProgress(currentVideoId, positionSec);
        if (!response.success) {
          throw new Error(response.error || "Не удалось сохранить прогресс видео");
        }
      }
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "VideoProgress",
        keys: { operation: "save" },
      });
    } finally {
      isSavingRef.current = false;
      if (pendingPositionRef.current != null) {
        void drainSaveQueue();
      }
    }
  }, []);

  const saveProgress = useCallback(
    (positionSec: number) => {
      if (!activeVideoIdRef.current || !Number.isFinite(positionSec)) return;
      pendingPositionRef.current = Math.max(0, Math.floor(positionSec));
      void drainSaveQueue();
    },
    [drainSaveQueue],
  );

  return { initialTimeSec, saveProgress };
}
