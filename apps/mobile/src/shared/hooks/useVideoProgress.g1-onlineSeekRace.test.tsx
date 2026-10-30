// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: false,
  local: new Map<string, { positionSec: number; updatedAt: number }>(),
  queue: [] as { type: string; params: { videoId: string } }[],
  getRemote: vi.fn(),
  saveRemote: vi.fn(),
  readLocal: vi.fn(),
  saveLocal: vi.fn(),
  enqueue: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => {
  const profile = { id: "USER_A" };
  return {
    useAuthStore: Object.assign(
      (selector: (state: { user: { id: string } }) => unknown) => selector({ user: profile }),
      { getState: () => ({ user: profile }) },
    ),
  };
});
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => mocks.offline }));
vi.mock("@/shared/lib/api/training", () => ({
  trainingApi: { getVideoProgress: mocks.getRemote, saveVideoProgress: mocks.saveRemote },
}));
vi.mock("@/shared/lib/videoProgressStorage", () => ({
  getLocalVideoProgress: mocks.readLocal,
  saveLocalVideoProgress: mocks.saveLocal,
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({
      schemaVersion: 2,
      principalId: "USER_A",
      authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
    }),
    getPending: async () => [],
    enqueue: vi.fn(async () => ({ eventId: "id" })),
  },
}));
vi.mock("@/shared/stores/progressSyncStore", () => ({
  useProgressSyncStore: {
    getState: () => ({ queue: mocks.queue, add: mocks.enqueue }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.report }));

import { useVideoProgress } from "./useVideoProgress";

type Progress = ReturnType<typeof useVideoProgress>;
let current: Progress;

function Harness({ videoId }: { videoId: string }) {
  current = useVideoProgress(videoId);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe("AG3-OFF-022 online seek must win over stale initial progress GET", () => {
  let node: HTMLDivElement;
  let root: Root;
  async function render(videoId: string) {
    await act(async () => {
      root.render(createElement(Harness, { videoId }));
    });
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.local.clear();
    mocks.queue = [];
    mocks.offline = false;
    mocks.readLocal.mockImplementation(async (id: string) => mocks.local.get(id) ?? null);
    mocks.saveLocal.mockImplementation(
      async (id: string, positionSec: number, updatedAt: number) => {
        const item = { positionSec, updatedAt };
        mocks.local.set(id, item);
        return item;
      },
    );
    mocks.getRemote.mockResolvedValue({ success: true, data: { lastPositionSec: 20 } });
    mocks.saveRemote.mockResolvedValue({ success: true });
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

  it("does not overwrite a more recent local seek while the initial online GET is pending", async () => {
    mocks.local.set("videoA", { positionSec: 24, updatedAt: 1 });
    const pending = deferred<{ success: boolean; data: { lastPositionSec: number } }>();
    mocks.getRemote.mockReturnValueOnce(pending.promise);
    await render("videoA");

    await act(async () => {
      current.saveProgress(86);
      await Promise.resolve();
    });
    expect(mocks.local.get("videoA")?.positionSec).toBe(24);
    expect(mocks.saveLocal).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ success: true, data: { lastPositionSec: 8 } });
    });
    expect(current.initialTimeSec).toBe(86);
    expect(mocks.local.get("videoA")?.positionSec).toBe(24);
    expect(mocks.saveLocal).not.toHaveBeenCalled();
    expect(mocks.saveLocal).not.toHaveBeenCalled();
  });

  it("respects a current seek without reading or writing ownerless cache", async () => {
    const pendingRemote = deferred<{ success: boolean; data: { lastPositionSec: number } }>();
    mocks.getRemote.mockReturnValueOnce(pendingRemote.promise);
    await render("videoA");

    await act(async () => {
      current.saveProgress(91);
      await Promise.resolve();
    });
    await act(async () => {
      pendingRemote.resolve({ success: true, data: { lastPositionSec: 12 } });
    });
    expect(current.initialTimeSec).toBe(91);
    expect(mocks.saveLocal).not.toHaveBeenCalled();
  });

  it("keeps normal server initialization for a different video with no local seek", async () => {
    mocks.getRemote.mockResolvedValueOnce({ success: true, data: { lastPositionSec: 53 } });
    await render("videoB");
    expect(current.initialTimeSec).toBe(53);
    expect(mocks.local.get("videoB")?.positionSec).toBeUndefined();
    expect(mocks.saveLocal).not.toHaveBeenCalled();
  });
});
