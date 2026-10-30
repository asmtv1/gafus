// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: true,
  queue: [{ queueId: "pending-step-A" }, { queueId: "pending-step-B" }],
  processNext: vi.fn(),
  invalidateQueries: vi.fn(),
  alert: vi.fn(),
  reportClientError: vi.fn(),
}));

// Test historical transport behavior only; runtime legacy safety gate is always false.
vi.mock("@/shared/stores/legacyOfflineReplayQuarantine", () => ({
  canDispatchOwnerlessLegacyOfflineQueue: () => true,
}));

vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("./useNetworkStatus", () => ({
  useIsOffline: () => mocks.offline,
}));
vi.mock("@/shared/stores/progressSyncStore", () => ({
  useProgressSyncStore: (
    selector: (state: {
      queue: typeof mocks.queue;
      processNext: typeof mocks.processNext;
    }) => unknown,
  ) => selector({ queue: mocks.queue, processNext: mocks.processNext }),
}));
vi.mock("@/shared/stores/authStore", () => {
  const auth = { isAuthenticated: true, user: { id: "USER_A" } };
  return {
    useAuthStore: Object.assign((selector: (state: typeof auth) => unknown) => selector(auth), {
      getState: () => auth,
    }),
  };
});
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: mocks.reportClientError,
}));

import { useSyncProgressOnReconnect } from "./useSyncProgressOnReconnect";

function Harness() {
  useSyncProgressOnReconnect();
  return null;
}

describe("AG3-OFF-021 reconnect progress ACK / offline network flap", () => {
  let node: HTMLDivElement;
  let root: Root;

  async function render(): Promise<void> {
    await act(async () => {
      root.render(createElement(Harness));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.offline = true;
    mocks.queue = [{ queueId: "pending-step-A" }, { queueId: "pending-step-B" }];
    mocks.invalidateQueries.mockResolvedValue(undefined);
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

  it("does not dispatch B after A ACK if the network goes offline while A is in flight, then resumes on next reconnect", async () => {
    let acknowledgeA!: (value: "ok") => void;
    mocks.processNext
      .mockImplementationOnce(
        () =>
          new Promise<"ok">((resolve) => {
            acknowledgeA = resolve;
          }),
      )
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("done");

    await render();
    expect(mocks.processNext).not.toHaveBeenCalled();

    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledTimes(1);

    mocks.offline = true;
    await render();
    await act(async () => {
      acknowledgeA("ok");
      await Promise.resolve();
    });

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(mocks.processNext).toHaveBeenCalledTimes(1);
    expect(mocks.alert).not.toHaveBeenCalled();

    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledTimes(3);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("drains successful ACKs and invalidates training cache for each acknowledged item while online", async () => {
    mocks.processNext
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("done");
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledTimes(3);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["trainingDay"] });
  });

  it.each(["retry", "done"] as const)(
    "stops after %s and never spins the queue without a fresh ACK",
    async (result) => {
      mocks.processNext.mockResolvedValueOnce(result);
      mocks.offline = false;
      await render();
      expect(mocks.processNext).toHaveBeenCalledOnce();
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
      expect(mocks.alert).not.toHaveBeenCalled();
    },
  );

  it("halts and raises the existing authorization alert on unauthorized result", async () => {
    mocks.processNext.mockResolvedValueOnce("unauthorized");
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();
    expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(
      "Синхронизация",
      "Не удалось синхронизировать прогресс. Проверьте авторизацию.",
    );
  });

  it("reports a thrown transport failure rather than starting an infinite retry loop", async () => {
    const error = new Error("network unavailable");
    mocks.processNext.mockRejectedValueOnce(error);
    mocks.offline = false;
    await render();
    expect(mocks.processNext).toHaveBeenCalledOnce();
    expect(mocks.reportClientError).toHaveBeenCalledExactlyOnceWith(error, {
      issueKey: "SyncProgressOnReconnect",
      keys: { operation: "process_queue" },
    });
  });
});
