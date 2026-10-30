// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: true,
  auth: { isAuthenticated: true, user: { id: "USER_A" } } as {
    isAuthenticated: boolean;
    user: { id: string } | null;
  },
  queue: [{ queueId: "A-1" }, { queueId: "A-2" }],
  processNext: vi.fn(),
  invalidate: vi.fn(),
  alert: vi.fn(),
  reportError: vi.fn(),
}));

// Test historical transport behavior only; runtime legacy safety gate is always false.
vi.mock("@/shared/stores/legacyOfflineReplayQuarantine", () => ({
  canDispatchOwnerlessLegacyOfflineQueue: () => true,
}));

vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => mocks.offline }));
vi.mock("@/shared/stores/progressSyncStore", () => ({
  useProgressSyncStore: (
    selector: (state: {
      queue: typeof mocks.queue;
      processNext: typeof mocks.processNext;
    }) => unknown,
  ) => selector({ queue: mocks.queue, processNext: mocks.processNext }),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth),
    { getState: () => mocks.auth },
  ),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportError }));

import { useSyncProgressOnReconnect } from "./useSyncProgressOnReconnect";

function Harness() {
  useSyncProgressOnReconnect();
  return null;
}

describe("AG3-OFF-021 principal-boundary during in-flight offline progress ACK", () => {
  let node: HTMLDivElement;
  let root: Root;

  async function render() {
    await act(async () => {
      root.render(createElement(Harness));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processNext.mockReset();
    mocks.processNext.mockResolvedValue("done");
    mocks.offline = true;
    mocks.auth = { isAuthenticated: true, user: { id: "USER_A" } };
    mocks.queue = [{ queueId: "A-1" }, { queueId: "A-2" }];
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

  it("never dispatches USER-A pending B after a direct principal switch while A ACK is in flight", async () => {
    let acknowledgeA!: (value: "ok") => void;
    mocks.processNext.mockImplementationOnce(
      () =>
        new Promise<"ok">((resolve) => {
          acknowledgeA = resolve;
        }),
    );
    await render();
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();

    mocks.auth = { isAuthenticated: true, user: { id: "USER_B" } };
    await render();
    await act(async () => {
      acknowledgeA("ok");
      await Promise.resolve();
    });

    expect(mocks.processNext).toHaveBeenCalledOnce();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveLength(2);

    mocks.offline = true;
    await render();
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();
  });

  it("does not replay the remaining previous-account queue after logout and new login", async () => {
    mocks.processNext.mockResolvedValueOnce("retry");
    await render();
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();

    mocks.auth = { isAuthenticated: false, user: null };
    await render();
    mocks.auth = { isAuthenticated: true, user: { id: "USER_B" } };
    mocks.offline = true;
    await render();
    mocks.offline = false;
    await render();

    expect(mocks.processNext).toHaveBeenCalledOnce();
    expect(mocks.queue).toHaveLength(2);
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("continues ACK processing normally for the same authenticated account", async () => {
    mocks.processNext.mockResolvedValueOnce("ok").mockResolvedValueOnce("done");
    await render();
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: ["trainingDay"],
    });
  });

  it("permits a new principal after the previous pending queue is explicitly emptied", async () => {
    mocks.processNext.mockResolvedValueOnce("retry");
    await render();
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();

    mocks.auth = { isAuthenticated: true, user: { id: "USER_B" } };
    await render();
    mocks.queue = [];
    await render();
    mocks.queue = [{ queueId: "B-1" }];
    mocks.processNext.mockResolvedValueOnce("ok").mockResolvedValueOnce("done");
    await render();

    expect(mocks.processNext).toHaveBeenCalledTimes(3);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
