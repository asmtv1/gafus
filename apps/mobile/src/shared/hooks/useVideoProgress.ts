import { useCallback, useEffect, useRef, useState } from "react";

import { trainingApi } from "@/shared/lib/api/training";
import { reportClientError } from "@/shared/lib/error-reporting";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  persistNewOnlyVideoProgress,
  readOwnPendingVideoProgress,
} from "@/shared/lib/offline/newOnlyV2VideoWriter";
import { useAuthStore } from "@/shared/stores/authStore";
import { validProgressVersion } from "@/shared/lib/offline/journalVersionFields";
import { useIsOffline } from "./useNetworkStatus";

interface UseVideoProgressResult {
  initialTimeSec: number | undefined;
  isLoading: boolean;
  saveProgress: (positionSec: number) => void;
  saveError: string | null;
}

interface PendingVideoProgress {
  videoId: string;
  positionSec: number;
  updatedAt: number;
  ownerId: string;
  authEpoch: string;
}

async function hasQueuedVideoProgress(videoId: string): Promise<boolean> {
  // A failed attested read is not authority to bypass unsent owner-scoped events.
  try {
    const events = await newOnlyV2NativeQueues.getPending("progress");
    return events.some(
      (event) => event.kind === "saveVideoProgress" && event.payload.videoId === videoId,
    );
  } catch {
    return true;
  }
}

function currentVideoActor(progress: PendingVideoProgress): boolean {
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  return useAuthStore.getState().user?.id === progress.ownerId &&
    binding?.principalId === progress.ownerId && binding.authEpoch === progress.authEpoch;
}

async function enqueueVideoProgress(progress: PendingVideoProgress): Promise<void> {
  if (!currentVideoActor(progress)) return;
  await persistNewOnlyVideoProgress(
    newOnlyV2NativeQueues,
    progress.videoId,
    progress.positionSec,
    progress.updatedAt,
  );
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
  const verifiedProfile = useAuthStore((state) => state.user);
  const ownerId = verifiedProfile?.id ?? null;
  const verifiedEpoch = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  const isOfflineRef = useRef(isOffline);
  const [initialTimeSec, setInitialTimeSec] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const activeVideoIdRef = useRef<string | null>(videoId ?? null);
  const pendingPositionRef = useRef<PendingVideoProgress | null>(null);
  const isSavingRef = useRef(false);
  const requestIdRef = useRef(0);
  const localEditVersionRef = useRef(0);
  const latestLocalEditRef = useRef<PendingVideoProgress | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    if (pendingPositionRef.current) {
      void enqueueVideoProgress(pendingPositionRef.current).catch((error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoProgress",
          keys: { operation: "enqueue_on_video_change" },
        });
      });
    }
    latestLocalEditRef.current = null;
    activeVideoIdRef.current = videoId ?? null;
    pendingPositionRef.current = null;
    setInitialTimeSec(undefined);
    setSaveError(null);
    const requestId = ++requestIdRef.current;
    const attestedForLoad = () => {
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      return (
        ownerRef.current === ownerId &&
        useAuthStore.getState().user?.id === ownerId &&
        !!ownerId &&
        binding?.principalId === ownerId &&
        binding.authEpoch === verifiedEpoch
      );
    };
    const editVersionAtRequest = localEditVersionRef.current;
    const savedDuringLoad = (): number | null => {
      const saved = latestLocalEditRef.current;
      if (!saved || saved.videoId !== videoId) return null;
      return localEditVersionRef.current !== editVersionAtRequest ? saved.positionSec : null;
    };
    const bindingAtLoad = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      !videoId ||
      !enabled ||
      !ownerId ||
      bindingAtLoad?.principalId !== ownerId ||
      bindingAtLoad.authEpoch !== verifiedEpoch
    ) {
      setIsLoading(false);
      setLoadedVideoId(null);
      return;
    }

    setIsLoading(true);
    void (async () => {
      const localProgress = await readOwnPendingVideoProgress(newOnlyV2NativeQueues, videoId);
      const snapshot = await newOnlyV2NativeQueues.videoSnapshot?.(videoId, bindingAtLoad);
      if (!attestedForLoad()) return undefined;
      if (requestIdRef.current !== requestId) return undefined;
      const recentSeek = savedDuringLoad();
      if (recentSeek !== null) return recentSeek;
      if (isOfflineRef.current) {
        return localProgress?.positionSec ?? snapshot?.lastPositionSec;
      }

      try {
        const response = await trainingApi.getVideoProgress(videoId, attestedForLoad);
        // A different video (or unmount) invalidates this in-flight load.
        // A network flap must not overwrite a newer offline playback position.
        if (requestIdRef.current !== requestId || !attestedForLoad()) return undefined;
        const recentSeek = savedDuringLoad();
        if (recentSeek !== null) return recentSeek;
        if (isOfflineRef.current) {
          const latestLocal = await readOwnPendingVideoProgress(newOnlyV2NativeQueues, videoId);
          return latestLocal?.positionSec ?? snapshot?.lastPositionSec;
        }
        if (!response.success) {
          throw new Error(response.error || "Не удалось загрузить прогресс видео");
        }
        const serverPosition = response.data?.lastPositionSec;
        const progressVersion = response.data?.progressVersion;
        if (validProgressVersion(progressVersion) && Number.isSafeInteger(serverPosition)) {
          await newOnlyV2NativeQueues.videoSnapshot?.(videoId, bindingAtLoad,
            { lastPositionSec: serverPosition as number, progressVersion },
            () => attestedForLoad() && requestIdRef.current === requestId && savedDuringLoad() === null);
        }
        if (await hasQueuedVideoProgress(videoId)) {
          return localProgress?.positionSec ?? serverPosition;
        }
        if (typeof serverPosition === "number" && Number.isFinite(serverPosition)) {
          return serverPosition;
        }
        return localProgress?.positionSec ?? snapshot?.lastPositionSec;
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoProgress",
          keys: { operation: "load" },
        });
        return localProgress?.positionSec ?? snapshot?.lastPositionSec;
      }
    })()
      .then((position) => {
        if (requestIdRef.current !== requestId || !attestedForLoad()) return;
        setInitialTimeSec(
          typeof position === "number" && Number.isFinite(position) && position > 0
            ? position
            : undefined,
        );
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId || !attestedForLoad()) return;
        // An unreadable owner-scoped journal is NOT proof that no progress exists.
        setSaveError("Не удалось проверить сохранённую позицию видео · результат неизвестен");
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
  }, [enabled, videoId, ownerId, verifiedEpoch, verifiedProfile]);

  const drainSaveQueue = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      while (pendingPositionRef.current) {
        const progress = pendingPositionRef.current;
        pendingPositionRef.current = null;
        if (!currentVideoActor(progress)) continue;

        if (await hasQueuedVideoProgress(progress.videoId)) {
          await enqueueVideoProgress(progress);
          continue;
        }

        if (!currentVideoActor(progress)) continue;
        try {
          const response = await trainingApi.saveVideoProgress(
            progress.videoId,
            progress.positionSec,
            () => currentVideoActor(progress),
          );
          if (!currentVideoActor(progress)) continue;
          if (!response.success) {
            throw new Error(response.error || "Не удалось сохранить прогресс видео");
          }
          const binding = newOnlyV2NativeQueues.getVerifiedBinding();
          const progressVersion = response.data?.progressVersion;
          if (binding && validProgressVersion(progressVersion)) {
            try {
              await newOnlyV2NativeQueues.videoSnapshot?.(progress.videoId, binding,
                { lastPositionSec: progress.positionSec, progressVersion }, () => currentVideoActor(progress));
            } catch {
              reportClientError(new Error("VIDEO_SNAPSHOT_WRITE_FAILED"), { issueKey: "VideoProgress" });
            }
          }
        } catch (error) {
          try {
            await enqueueVideoProgress(progress);
          } catch (queueError) {
            reportClientError(
              queueError instanceof Error ? queueError : new Error(String(queueError)),
              {
                issueKey: "VideoProgress",
                keys: { operation: "enqueue_failed_response" },
              },
            );
          }
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
      const liveBinding = newOnlyV2NativeQueues.getVerifiedBinding();
      if (
        !mountedRef.current ||
        !enabled ||
        !verifiedProfile ||
        !ownerId ||
        useAuthStore.getState().user !== verifiedProfile ||
        liveBinding?.principalId !== ownerId ||
        liveBinding.authEpoch !== verifiedEpoch
      )
        return;
      const currentVideoId = activeVideoIdRef.current;
      if (!currentVideoId || !Number.isFinite(positionSec)) return;
      const progress: PendingVideoProgress = {
        videoId: currentVideoId,
        positionSec: Math.max(0, Math.floor(positionSec)),
        updatedAt: Date.now(),
        ownerId, authEpoch: liveBinding.authEpoch,
      };

      if (isOffline) {
        // No local success or ownerless queue write before verified-owner v2 persistence.
        void (async () => {
          const binding = newOnlyV2NativeQueues.getVerifiedBinding();
          const attested = () => {
            const now = newOnlyV2NativeQueues.getVerifiedBinding();
            return (
              !!ownerId &&
              binding?.principalId === ownerId &&
              now?.principalId === ownerId &&
              now.authEpoch === binding.authEpoch &&
              now.authEpoch === verifiedEpoch &&
              useAuthStore.getState().user === verifiedProfile &&
              mountedRef.current &&
              ownerRef.current === ownerId
            );
          };
          try {
            if (!attested()) throw new Error("V2_SESSION_UNVERIFIED");
            setSaveError(null);
            const receipt = await persistNewOnlyVideoProgress(
              newOnlyV2NativeQueues,
              progress.videoId,
              progress.positionSec,
              progress.updatedAt,
            );
            if (!attested()) return;
            const pending = await newOnlyV2NativeQueues.getPending("progress");
            if (!attested()) return;
            if (
              !pending.some(
                (event) =>
                  event.eventId === receipt.eventId &&
                  event.kind === "saveVideoProgress" &&
                  event.payload.videoId === progress.videoId &&
                  event.payload.positionSec === progress.positionSec &&
                  event.payload.updatedAt === progress.updatedAt,
              ) && !newOnlyV2NativeQueues.wasPracticeAcknowledged?.(receipt.eventId, binding)
            )
              throw new Error("V2_LOCAL_RECEIPT_UNCONFIRMED");
            if (activeVideoIdRef.current === progress.videoId) {
              localEditVersionRef.current += 1;
              latestLocalEditRef.current = progress;
            }
          } catch (error) {
            if (attested() && activeVideoIdRef.current === progress.videoId)
              setSaveError(
                "Результат сохранения позиции видео не подтверждён · проверьте перед повтором",
              );
            reportClientError(error instanceof Error ? error : new Error(String(error)), {
              issueKey: "VideoProgress",
              keys: { operation: "offline_durable_save" },
            });
          }
        })();
        return;
      }

      // Existing online seek wins against a late GET without waiting for POST.
      localEditVersionRef.current += 1;
      latestLocalEditRef.current = progress;
      pendingPositionRef.current = progress;
      void drainSaveQueue();
    },
    [drainSaveQueue, isOffline, ownerId, verifiedEpoch, verifiedProfile, enabled],
  );

  const isInitialProgressLoading =
    isLoading || Boolean(enabled && videoId && loadedVideoId !== videoId);

  return { initialTimeSec, isLoading: isInitialProgressLoading, saveProgress, saveError };
}
