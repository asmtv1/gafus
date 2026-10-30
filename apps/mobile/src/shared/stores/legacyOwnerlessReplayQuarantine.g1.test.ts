import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  bytes: new Map<string, string>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  training: vi.fn(),
  prevention: vi.fn(),
  reporter: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mock.getItem,
    setItem: mock.setItem,
    removeItem: mock.removeItem,
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mock.reporter }));
vi.mock("@/shared/lib/api", () => ({
  dailyCourseApi: {
    startStep: mock.training,
    pauseStep: mock.training,
    resumeStep: mock.training,
    resetStep: mock.training,
    completeStep: mock.training,
  },
  trainingApi: {
    startStep: mock.training,
    pauseStep: mock.training,
    resumeStep: mock.training,
    resetStep: mock.training,
    completePracticeStep: mock.training,
    completeTheoryStep: mock.training,
    saveVideoProgress: mock.training,
  },
}));
vi.mock("@/shared/lib/api/pets", () => ({
  petsApi: { batchUpsertPreventionEntries: mock.prevention },
}));
import { useProgressSyncStore } from "./progressSyncStore";
import { usePreventionSyncStore } from "./preventionSyncStore";
import { canDispatchOwnerlessLegacyOfflineQueue } from "./legacyOfflineReplayQuarantine";

const oldProgress = JSON.stringify({
  state: {
    queue: [
      {
        type: "startStep",
        queueId: "historical-unauthenticated",
        params: {
          courseId: "old-course",
          dayOnCourseId: "old-day",
          stepIndex: 1,
          durationSec: 4,
          status: "IN_PROGRESS",
        },
      },
    ],
  },
  version: 0,
});
const oldPrevention = JSON.stringify({
  state: {
    queue: [
      {
        id: "historical-prevention",
        petId: "old-pet",
        createdAt: 100,
        data: {
          clientId: "unverified-legacy-client",
          type: "VACCINATION",
          performedAt: "2024-01-01",
        },
      },
    ],
  },
  version: 0,
});

describe("AG3 P1 old-ownerless legacy replay quarantine (real Zustand stores)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mock.bytes.clear();
    mock.bytes.set("progress-sync-storage", oldProgress);
    mock.bytes.set("prevention-sync-storage", oldPrevention);
    mock.getItem.mockImplementation(async (key: string) => mock.bytes.get(key) ?? null);
    mock.setItem.mockImplementation(async (key: string, value: string) => {
      mock.bytes.set(key, value);
    });
    mock.removeItem.mockImplementation(async (key: string) => {
      mock.bytes.delete(key);
    });
    mock.training.mockResolvedValue({ success: true });
    mock.prevention.mockResolvedValue({
      success: true,
      data: { created: 1, updated: 0, errors: [] },
    });
    await Promise.all([
      useProgressSyncStore.persist.rehydrate(),
      usePreventionSyncStore.persist.rehydrate(),
    ]);
  });

  it("rejects direct dispatch of BOTH persisted v1 queues despite success-looking legacy response", async () => {
    expect(canDispatchOwnerlessLegacyOfflineQueue()).toBe(false);
    expect(useProgressSyncStore.getState().queue).toHaveLength(1);
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
    const savedProgress = mock.bytes.get("progress-sync-storage");
    const savedPrevention = mock.bytes.get("prevention-sync-storage");
    expect(await useProgressSyncStore.getState().processNext()).toBe("retry");
    expect(await usePreventionSyncStore.getState().processQueue()).toBe("retry");
    expect(mock.training).not.toHaveBeenCalled();
    expect(mock.prevention).not.toHaveBeenCalled();
    expect(mock.setItem).not.toHaveBeenCalled();
    expect(mock.removeItem).not.toHaveBeenCalled();
    expect(mock.bytes.get("progress-sync-storage")).toBe(savedProgress);
    expect(mock.bytes.get("prevention-sync-storage")).toBe(savedPrevention);
  });

  it("retains original v1 strings across repeated attempts, account-independent, and auth failures", async () => {
    const before = Object.fromEntries(mock.bytes);
    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await usePreventionSyncStore.getState().processQueue()).toBe("retry");
      expect(await useProgressSyncStore.getState().processNext()).toBe("retry");
    }
    expect(Object.fromEntries(mock.bytes)).toEqual(before);
    expect(useProgressSyncStore.getState().queue).toHaveLength(1);
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
    expect(mock.training).not.toHaveBeenCalled();
    expect(mock.prevention).not.toHaveBeenCalled();
    expect(mock.setItem).not.toHaveBeenCalled();
    expect(mock.removeItem).not.toHaveBeenCalled();
  });
});
