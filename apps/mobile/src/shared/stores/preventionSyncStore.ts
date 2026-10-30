/**
 * Очередь записей профилактики для синхронизации при появлении сети.
 * При offline добавляем в очередь с clientId. При reconnect — batch upsert по petId.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { reportClientError } from "@/shared/lib/tracer";
import { petsApi } from "@/shared/lib/api/pets";
import { zustandStorage } from "./storage";
import { singleFlight } from "./singleFlight";
import { canDispatchOwnerlessLegacyOfflineQueue } from "./legacyOfflineReplayQuarantine";

import type { CreatePreventionEntryData } from "@/shared/lib/api/pets";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface QueuedPreventionAction {
  id: string;
  petId: string;
  data: CreatePreventionEntryData & { clientId: string };
  createdAt: number;
}

interface PreventionSyncState {
  queue: QueuedPreventionAction[];
}

interface PreventionSyncActions {
  addToQueue: (petId: string, data: CreatePreventionEntryData, clientId?: string) => string;
  processQueue: () => Promise<"ok" | "done" | "retry" | "unauthorized">;
}

type PreventionSyncStore = PreventionSyncState & PreventionSyncActions;

export const usePreventionSyncStore = create<PreventionSyncStore>()(
  persist(
    (set, get) => ({
      queue: [],

      addToQueue: (petId, data, clientId?) => {
        const fullClientId = clientId ?? (data as { clientId?: string }).clientId ?? generateUUID();
        const entry: QueuedPreventionAction = {
          id: generateUUID(),
          petId,
          data: { ...data, clientId: fullClientId },
          createdAt: Date.now(),
        };
        set((s) => ({ queue: [...s.queue, entry] }));
        return fullClientId;
      },

      processQueue: singleFlight(async () => {
        // Old prevention batches have no owner and no trustworthy item ACK.
        if (!canDispatchOwnerlessLegacyOfflineQueue()) return "retry";
        const { queue } = get();
        if (queue.length === 0) return "done";

        const byPetId = new Map<string, QueuedPreventionAction[]>();
        for (const item of queue) {
          const list = byPetId.get(item.petId) ?? [];
          list.push(item);
          byPetId.set(item.petId, list);
        }

        let had401 = false;
        let hadUnacknowledged = false;
        const toRemove = new Set<string>();

        for (const [petId, items] of byPetId.entries()) {
          try {
            const entries = items.map((i) => i.data);
            const result = await petsApi.batchUpsertPreventionEntries(petId, entries);

            if (result.code === "UNAUTHORIZED" || result.code === "SESSION_EXPIRED") {
              had401 = true;
              break;
            }

            // A partial batch with errors cannot ACK individual entries reliably.
            if (result.success && !result.data?.errors?.length) {
              for (const item of items) {
                toRemove.add(item.id);
              }
            } else {
              hadUnacknowledged = true;
            }
          } catch (error) {
            hadUnacknowledged = true;
            reportClientError(error, {
              issueKey: "PreventionSync",
              keys: { petId },
            });
          }
        }

        if (had401) {
          // A 401 does not ACK pending native offline data.
          // Only batches already confirmed above may be removed.
          set((s) => ({
            queue: s.queue.filter((item) => !toRemove.has(item.id)),
          }));
          return "unauthorized";
        }

        set((s) => ({
          queue: s.queue.filter((item) => !toRemove.has(item.id)),
        }));
        return hadUnacknowledged ? "retry" : "ok";
      }),
    }),
    {
      name: "prevention-sync-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({ queue: s.queue }),
    },
  ),
);
