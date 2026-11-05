import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  user: { id: "owner", username: "asmtv1", role: "USER" },
  epoch: "epoch-a",
  authenticated: true,
  isLoading: false,
  load: vi.fn(),
  save: vi.fn(),
  api: vi.fn(),
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: mocked.api }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: mocked.user,
      isAuthenticated: mocked.authenticated,
      isLoading: mocked.isLoading,
      verifiedSessionEpoch: mocked.epoch,
    }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("./walkStorage", () => ({ loadWalkJournal: mocked.load, saveWalkJournal: mocked.save }));

import { finishWalk, startWalk } from "./walkModel";
import { canUseDogWalkHistory } from "./walkAccess";
import { fromRemoteWalk, mergeWalkHistory, syncDogWalkHistory, toRemoteWalk } from "./walkSync";

const id1 = "028fcf5d-a5e5-445c-9142-766eabde7349";
const id2 = "e0ecbff3-595c-4cec-a9cf-031a91a8d541";
const local = {
  ...finishWalk({ ...startWalk("stopwatch", 0), clientId: id1, steps: 2500 }, 3_600_000),
};
const remoteOnly = {
  clientId: id2,
  startedAt: new Date(5000).toISOString(),
  finishedAt: new Date(65000).toISOString(),
  durationSeconds: 60,
  steps: 75,
  estimatedMeters: 60,
  timerMode: "stopwatch" as const,
  incompleteSteps: false,
};
const conflicting = { ...toRemoteWalk(local)!, steps: 1, estimatedMeters: 1 };

beforeEach(() => {
  mocked.user = { id: "owner", username: "asmtv1", role: "USER" };
  mocked.epoch = "epoch-a";
  mocked.authenticated = true;
  mocked.isLoading = false;
  mocked.load.mockReset().mockResolvedValue({
    active: null,
    completed: [local],
    preference: { mode: "stopwatch", countdownMinutes: 30 },
  });
  mocked.save.mockReset().mockResolvedValue(undefined);
  mocked.api.mockReset().mockResolvedValue({ success: true, data: [conflicting, remoteOnly] });
});

describe("phone-first dog walk synchronization", () => {
  it("allows any signed-in user, independent of username or role", () => {
    expect(canUseDogWalkHistory({ id: "regular" })).toBe(true);
    expect(canUseDogWalkHistory({ id: "admin-id" })).toBe(true);
    expect(canUseDogWalkHistory({ id: "partner-id" })).toBe(true);
    expect(canUseDogWalkHistory(null)).toBe(false);
    expect(canUseDogWalkHistory({})).toBe(false);
  });

  it("locally overrides stale server copies while adopting server-only walks", () => {
    const merged = mergeWalkHistory([local], [conflicting, remoteOnly]);
    expect(merged.find((w) => w.clientId === id1)?.steps).toBe(2500);
    expect(merged.find((w) => w.clientId === id2)?.steps).toBe(75);
    expect(merged).toHaveLength(2);
    expect(fromRemoteWalk(remoteOnly).finishedAtMs).toBe(65000);
  });

  it("uploads the local completed walk and saves the merge", async () => {
    const merged = await syncDogWalkHistory("owner");
    expect(mocked.api).toHaveBeenCalledWith(
      "/api/v1/walks/sync",
      expect.objectContaining({
        method: "PUT",
        body: { walks: [toRemoteWalk(local)] },
        skipAuthRefreshReplay: true,
      }),
    );
    expect(merged.completed.find((w) => w.clientId === id1)?.steps).toBe(2500);
    expect(merged.completed.find((w) => w.clientId === id2)?.steps).toBe(75);
    expect(mocked.save).toHaveBeenCalledWith("owner", merged);
  });

  it("allows ordinary accounts to sync their own history", async () => {
    mocked.user = { id: "owner", username: "other", role: "USER" };
    await expect(syncDogWalkHistory("owner")).resolves.toBeDefined();
    expect(mocked.api).toHaveBeenCalledWith(
      "/api/v1/walks/sync",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("does not send history for a signed-out account", async () => {
    mocked.authenticated = false;
    await expect(syncDogWalkHistory("owner")).rejects.toThrow("WALK_SYNC_NOT_AUTHORIZED");
    expect(mocked.api).not.toHaveBeenCalled();
    expect(mocked.save).not.toHaveBeenCalled();
  });

  it("rejects account changes mid-sync before saving", async () => {
    mocked.api.mockImplementationOnce(async () => {
      mocked.user = { id: "other-owner", username: "admin", role: "ADMIN" };
      return { success: true, data: [remoteOnly] };
    });
    await expect(syncDogWalkHistory("owner")).rejects.toThrow("WALK_SYNC_ACTOR_CHANGED");
    expect(mocked.save).not.toHaveBeenCalled();
  });
});
