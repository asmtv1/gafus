import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api/client";
import { reportClientError } from "@/shared/lib/error-reporting";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { replayProgressJournal, type ProgressReplayTransport } from "@/shared/lib/offline/replayProgressJournal";
import { createJournalReplayScheduler, isTransientJournalResult } from "@/shared/lib/offline/journalReplayScheduler";
import { replayPreventionJournal, type PreventionReplayTransport } from "@/shared/lib/offline/replayPreventionJournal";
import { getSettledAuthSessionGeneration, useAuthStore } from "@/shared/stores/authStore";
import { useIsOffline } from "./useNetworkStatus";
import { useNetworkStatusStore } from "@/shared/stores/networkStatusStore";

let flight: Promise<unknown> | undefined;

/** Mounted behind auth/update gates. Restart/reconnect/foreground retries are
 * bounded and serialized; no ownerless storage is ever read. */
export function useOfflineJournalReplay(): void {
  const offline = useIsOffline();
  const owner = useAuthStore(s => s.isAuthenticated && !s.isLoading ? s.user?.id ?? null : null);
  const epoch = useAuthStore(s => s.verifiedSessionEpoch);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (offline || !owner || !epoch) return;
    const credentialGeneration = getSettledAuthSessionGeneration();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (credentialGeneration === null || binding?.principalId !== owner || binding.authEpoch !== epoch) return;
    let active = true;
    const current = () => {
      const state = useAuthStore.getState();
      return active && AppState.currentState === "active" && !useNetworkStatusStore.getState().isOffline && getSettledAuthSessionGeneration() === credentialGeneration &&
        state.isAuthenticated && !state.isLoading && state.user?.id === owner &&
        state.verifiedSessionEpoch === epoch;
    };
    const scheduler = createJournalReplayScheduler(
      current,
      async () => {
        if (flight) {
          // Previous owner may still have an in-flight request. Never overlap drains.
          await flight;
          if (!current()) return { pending: false, madeProgress: false, transient: false };
        }
        let transient = false;
        const transport: PreventionReplayTransport & ProgressReplayTransport = async (request, guard) => {
          const response = await apiClient(request.path, {
            method: request.method, headers: request.headers, body: request.body,
            requestGuard: guard, expectedSuccessStatus: 200, suppressSubscriptionPaywall: true,
          });
          transient ||= isTransientJournalResult(response);
          return response;
        };
        const operation = Promise.allSettled([
          replayPreventionJournal(newOnlyV2NativeQueues, binding, current, transport,
            petId => {
              if (!current()) return;
              void queryClient.invalidateQueries({ queryKey: ["petPrevention", petId, owner, epoch] });
              void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
            }),
          replayProgressJournal(newOnlyV2NativeQueues, binding, current, transport,
            operation => {
              if (!current()) return;
              if (operation.startsWith("daily.")) {
                void queryClient.invalidateQueries({ queryKey: ["dailyCourse"] });
              } else if (operation !== "video.progress") {
                void queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
                void queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
              }
            }),
        ]);
        flight = operation;
        try {
          const results = await operation;
          if (!current()) return { pending: false, madeProgress: false, transient: false };
          const rejected = results.some(result => result.status === "rejected");
          if (rejected) reportClientError(new Error("OFFLINE_JOURNAL_REPLAY_FAILED"), { issueKey: "OfflineJournalReplay" });
          return {
            pending: rejected || results.some(result => result.status === "fulfilled" && result.value.pending),
            madeProgress: results.some(result => result.status === "fulfilled" && result.value.committed > 0),
            transient,
          };
        } finally {
          if (flight === operation) flight = undefined;
        }
    });
    scheduler.trigger();
    const unsubscribe = newOnlyV2NativeQueues.subscribePendingWrites(() => scheduler.trigger());
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") scheduler.trigger();
    });
    return () => {
      active = false;
      scheduler.dispose();
      unsubscribe();
      subscription.remove();
    };
  }, [offline, owner, epoch, queryClient]);
}
