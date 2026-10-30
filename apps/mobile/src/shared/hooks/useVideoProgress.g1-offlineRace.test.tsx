// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: false,
  principalId: "USER_A",
  local: new Map<string, { positionSec: number; updatedAt: number }>(),
  queued: [] as {
    type: string;
    params: { videoId: string; positionSec: number; updatedAt?: number };
  }[],
  getVideoProgress: vi.fn(),
  saveVideoProgress: vi.fn(),
  getLocal: vi.fn(),
  saveLocal: vi.fn(),
  add: vi.fn(),
  enqueueV2: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/shared/stores/authStore", () => {
  const profiles = new Map<string, { id: string }>();
  const profile = () => {
    const id = mocks.principalId;
    if (!profiles.has(id)) profiles.set(id, { id });
    return profiles.get(id)!;
  };
  return {
    useAuthStore: Object.assign(
      (selector: (state: { user: { id: string } }) => unknown) => selector({ user: profile() }),
      { getState: () => ({ user: profile() }) },
    ),
  };
});
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => mocks.offline }));
vi.mock("@/shared/lib/api/training", () => ({
  trainingApi: {
    getVideoProgress: mocks.getVideoProgress,
    saveVideoProgress: mocks.saveVideoProgress,
  },
}));
vi.mock("@/shared/lib/videoProgressStorage", () => ({
  getLocalVideoProgress: mocks.getLocal,
  saveLocalVideoProgress: mocks.saveLocal,
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({
      schemaVersion: 2,
      principalId: "USER_A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    }),
    getPending: async () =>
      mocks.queued.map((action, index) => ({
        eventId: String(index),
        kind: action.type,
        payload: action.params,
      })),
    enqueue: (queue: string, kind: string, payload: { videoId: string; positionSec: number }) =>
      mocks.enqueueV2(queue, kind, payload),
  },
}));
vi.mock("@/shared/stores/progressSyncStore", () => ({
  useProgressSyncStore: { getState: () => ({ queue: mocks.queued, add: mocks.add }) },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportError }));

import { useVideoProgress } from "./useVideoProgress";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Progress = ReturnType<typeof useVideoProgress>;
let current: Progress;

function Harness({ videoId }: { videoId: string }) {
  current = useVideoProgress(videoId);
  return null;
}

describe("AG3-OFF-022 late remote video-progress replies", () => {
  let node: HTMLDivElement;
  let root: Root;

  async function render(videoId: string) {
    await act(async () => {
      root.render(createElement(Harness, { videoId }));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offline = false;
    mocks.principalId = "USER_A";
    mocks.queued = [];
    mocks.local.clear();
    mocks.getLocal.mockImplementation(async (id: string) => mocks.local.get(id) ?? null);
    mocks.saveLocal.mockImplementation(async (id: string, positionSec: number, updatedAt = 10) => {
      const result = { positionSec, updatedAt };
      mocks.local.set(id, result);
      return result;
    });
    mocks.add.mockImplementation(
      (action: { type: string; params: { videoId: string; positionSec: number } }) => {
        mocks.queued.push(action);
      },
    );
    mocks.enqueueV2.mockImplementation(
      async (_queue: string, kind: string, payload: { videoId: string; positionSec: number }) => {
        mocks.queued.push({ type: kind, params: payload });
        return { eventId: String(mocks.queued.length) };
      },
    );
    mocks.getVideoProgress.mockResolvedValue({ success: true, data: { lastPositionSec: 5 } });
    mocks.saveVideoProgress.mockResolvedValue({ success: true });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    node.remove();
  });

  it("uses the current local position after a network flap and in-flight remote response", async () => {
    mocks.local.set("videoA", { positionSec: 30, updatedAt: 1 });
    const pending = deferred<{ success: boolean; data: { lastPositionSec: number } }>();
    mocks.getVideoProgress.mockReturnValueOnce(pending.promise);

    await render("videoA");
    expect(mocks.getVideoProgress).toHaveBeenCalledOnce();

    mocks.offline = true;
    await render("videoA");
    await act(async () => {
      current.saveProgress(82);
      await Promise.resolve();
    });
    expect(mocks.local.get("videoA")?.positionSec).toBe(30);
    expect(mocks.getLocal).not.toHaveBeenCalled();
    expect(mocks.saveLocal).not.toHaveBeenCalled();
    expect(mocks.queued).toHaveLength(1);

    await act(async () => {
      pending.resolve({ success: true, data: { lastPositionSec: 7 } });
    });
    expect(current.initialTimeSec).toBe(82);
    expect(mocks.local.get("videoA")?.positionSec).toBe(30);
    expect(mocks.getLocal).not.toHaveBeenCalled();
    expect(mocks.saveLocal).not.toHaveBeenCalled();
    expect(mocks.getVideoProgress).toHaveBeenCalledOnce();
  });

  it("does not overwrite an old video's local position after switching to another video", async () => {
    mocks.local.set("videoA", { positionSec: 35, updatedAt: 1 });
    mocks.local.set("videoB", { positionSec: 48, updatedAt: 2 });
    const old = deferred<{ success: boolean; data: { lastPositionSec: number } }>();
    mocks.getVideoProgress
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ success: true, data: { lastPositionSec: 52 } });

    await render("videoA");
    await render("videoB");
    expect(current.initialTimeSec).toBe(52);

    await act(async () => {
      old.resolve({ success: true, data: { lastPositionSec: 1 } });
    });
    expect(current.initialTimeSec).toBe(52);
    expect(mocks.local.get("videoA")?.positionSec).toBe(35);
    expect(mocks.local.get("videoB")?.positionSec).toBe(48);
  });

  it("keeps ordinary online server position load and local cache update", async () => {
    mocks.local.set("videoA", { positionSec: 8, updatedAt: 1 });
    mocks.getVideoProgress.mockResolvedValueOnce({ success: true, data: { lastPositionSec: 42 } });
    await render("videoA");
    expect(current.initialTimeSec).toBe(42);
    expect(mocks.local.get("videoA")?.positionSec).toBe(8);
    expect(mocks.getLocal).not.toHaveBeenCalled();
  });

  it("clears previous player's pending position and error when owner changes mounted", async () => {
    mocks.offline = true;
    mocks.queued.push({
      type: "saveVideoProgress",
      params: { videoId: "videoA", positionSec: 42, updatedAt: 5 },
    });
    await render("videoA");
    expect(current.initialTimeSec).toBe(42);
    mocks.principalId = "USER_B";
    mocks.queued = [];
    await render("videoA");
    expect(current.initialTimeSec).toBeUndefined();
    expect(current.saveError).toBeNull();
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("exposes a visible error when offline persistence fails", async () => {
    mocks.offline = true;
    await render("videoA");
    mocks.enqueueV2.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      current.saveProgress(81);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current.saveError).toContain("Результат сохранения позиции видео не подтверждён");
    expect(mocks.queued).toHaveLength(0);
  });
  it("does not update local progress if owner/epoch changes during durable v2 save", async () => {
    mocks.offline = true;
    mocks.local.set("videoA", { positionSec: 25, updatedAt: 1 });
    mocks.enqueueV2.mockRejectedValueOnce(new Error("V2_SESSION_CHANGED"));
    await render("videoA");
    await act(async () => {
      current.saveProgress(88);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.queued).toHaveLength(0);
    expect(mocks.local.get("videoA")?.positionSec).toBe(25);
    expect(mocks.saveLocal).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("restores pending position on remount without a new network request", async () => {
    mocks.offline = true;
    await render("videoA");
    await act(async () => {
      current.saveProgress(47);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.queued).toHaveLength(1);
    expect(mocks.local.get("videoA")?.positionSec).toBeUndefined();
    await act(async () => {
      root.unmount();
    });
    root = createRoot(node);
    await render("videoA");
    expect(current.initialTimeSec).toBe(47);
    expect(mocks.getVideoProgress).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("never makes a server request when initial progress loads offline", async () => {
    mocks.offline = true;
    // Old ownerless cache is intentionally ignored; only new verified v2 event can restore.
    mocks.local.set("videoA", { positionSec: 99, updatedAt: 1 });
    mocks.queued.push({
      type: "saveVideoProgress",
      params: { videoId: "videoA", positionSec: 23, updatedAt: 2 },
    });
    await render("videoA");
    expect(mocks.getVideoProgress).not.toHaveBeenCalled();
    expect(current.initialTimeSec).toBe(23);
    expect(mocks.getLocal).not.toHaveBeenCalled();
    expect(mocks.saveLocal).not.toHaveBeenCalled();
  });
});
