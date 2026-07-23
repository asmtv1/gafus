import { useCallback, useEffect, useRef, useState } from "react";

import { trainingApi } from "@/shared/lib/api/training";
import { reportClientError } from "@/shared/lib/tracer";
import { getLocalVideoProgress, saveLocalVideoProgress } from "@/shared/lib/videoProgressStorage";
import { useProgressSyncStore } from "@/shared/stores/progressSyncStore";
import { useIsOffline } from "./useNetworkStatus";

interface UseVideoProgressResult {
  initialTimeSec: number | undefined;
  isLoading: boolean;
  saveProgress: (positionSec: number) => void;
}

interface PendingVideoProgress {
  videoId: string;
  positionSec: number;
  updatedAt: number;
}

function hasQueuedVideoProgress(videoId: string): boolean {
  return useProgressSyncStore
    .getState()
    .queue.some(
      (action) => action.type === "saveVideoProgress" && action.params.videoId === videoId,
    );
}

function enqueueVideoProgress(progress: PendingVideoProgress): void {
  useProgressSyncStore.getState().add({
    type: "saveVideoProgress",
    params: progress,
  });
}

/**
 * Загружает серверную или локальную позицию и сохраняет её последовательно.
 * В офлайне последняя позиция остаётся на устройстве и попадает в общую очередь синхронизации.
 */
export function useVideoProgress(
  videoId: string | null | undefined,
  enabled = true,
): UseVideoProgressResult {
  const isOffline = useIsOffline();
  const isOfflineRef = useRef(isOffline);
  const [initialTimeSec, setInitialTimeSec] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const activeVideoIdRef = useRef<string | null>(videoId ?? null);
  const pendingPositionRef = useRef<PendingVideoProgress | null>(null);
  const isSavingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    if (pendingPositionRef.current) enqueueVideoProgress(pendingPositionRef.current);
    activeVideoIdRef.current = videoId ?? null;
    pendingPositionRef.current = null;
    setInitialTimeSec(undefined);
    const requestId = ++requestIdRef.current;
    if (!videoId || !enabled) {
      setIsLoading(false);
      setLoadedVideoId(null);
      return;
    }

    setIsLoading(true);
    void (async () => {
      const localProgress = await getLocalVideoProgress(videoId);
      if (isOfflineRef.current) {
        return localProgress?.positionSec;
      }

      try {
        const response = await trainingApi.getVideoProgress(videoId);
        if (!response.success) {
          throw new Error(response.error || "Не удалось загрузить прогресс видео");
        }
        const serverPosition = response.data?.lastPositionSec;
        if (hasQueuedVideoProgress(videoId)) {
          return localProgress?.positionSec ?? serverPosition;
        }
        if (typeof serverPosition === "number" && Number.isFinite(serverPosition)) {
          await saveLocalVideoProgress(videoId, serverPosition);
          return serverPosition;
        }
        return localProgress?.positionSec;
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoProgress",
          keys: { operation: "load" },
        });
        return localProgress?.positionSec;
      }
    })()
      .then((position) => {
        if (requestIdRef.current !== requestId) return;
        setInitialTimeSec(
          typeof position === "number" && Number.isFinite(position) && position > 0
            ? position
            : undefined,
        );
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoProgress",
          keys: { operation: "load_local" },
        });
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoadedVideoId(videoId);
          setIsLoading(false);
        }
      });

    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [enabled, videoId]);

  const drainSaveQueue = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      while (pendingPositionRef.current) {
        const progress = pendingPositionRef.current;
        pendingPositionRef.current = null;

        if (hasQueuedVideoProgress(progress.videoId)) {
          enqueueVideoProgress(progress);
          continue;
        }

        try {
          const response = await trainingApi.saveVideoProgress(
            progress.videoId,
            progress.positionSec,
          );
          if (!response.success) {
            throw new Error(response.error || "Не удалось сохранить прогресс видео");
          }
        } catch (error) {
          enqueueVideoProgress(progress);
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "VideoProgress",
            keys: { operation: "save" },
          });
        }
      }
    } finally {
      isSavingRef.current = false;
      if (pendingPositionRef.current) void drainSaveQueue();
    }
  }, []);

  const saveProgress = useCallback(
    (positionSec: number) => {
      const currentVideoId = activeVideoIdRef.current;
      if (!currentVideoId || !Number.isFinite(positionSec)) return;
      const progress: PendingVideoProgress = {
        videoId: currentVideoId,
        positionSec: Math.max(0, Math.floor(positionSec)),
        updatedAt: Date.now(),
      };

      void saveLocalVideoProgress(progress.videoId, progress.positionSec, progress.updatedAt).catch(
        (error) => {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "VideoProgress",
            keys: { operation: "save_local" },
          });
        },
      );

      if (isOffline || hasQueuedVideoProgress(progress.videoId)) {
        enqueueVideoProgress(progress);
        return;
      }
      pendingPositionRef.current = progress;
      void drainSaveQueue();
    },
    [drainSaveQueue, isOffline],
  );

  const isInitialProgressLoading =
    isLoading || Boolean(enabled && videoId && loadedVideoId !== videoId);

  return { initialTimeSec, isLoading: isInitialProgressLoading, saveProgress };
}
