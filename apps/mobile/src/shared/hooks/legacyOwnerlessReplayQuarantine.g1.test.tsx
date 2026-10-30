// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: true,
  principal: "USER_A",
  progress: [{ queueId: "legacy-v1-unknown-owner" }],
  processNext: vi.fn(),
  processQueue: vi.fn(),
  invalidate: vi.fn(),
  alert: vi.fn(),
  report: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => mocks.offline }));
vi.mock("@/shared/stores/progressSyncStore", () => ({
  useProgressSyncStore: (
    selector: (x: {
      queue: typeof mocks.progress;
      processNext: typeof mocks.processNext;
    }) => unknown,
  ) => selector({ queue: mocks.progress, processNext: mocks.processNext }),
}));
vi.mock("@/shared/stores/preventionSyncStore", () => ({
  usePreventionSyncStore: (selector: (x: { processQueue: typeof mocks.processQueue }) => unknown) =>
    selector({ processQueue: mocks.processQueue }),
}));
vi.mock("@/shared/stores/authStore", () => {
  const current = () => ({
    isAuthenticated: !!mocks.principal,
    user: mocks.principal ? { id: mocks.principal } : null,
  });
  return {
    useAuthStore: Object.assign(
      (selector: (x: ReturnType<typeof current>) => unknown) => selector(current()),
      { getState: () => current() },
    ),
  };
});
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.report }));

import { useSyncProgressOnReconnect } from "./useSyncProgressOnReconnect";
import { usePreventionSyncOnReconnect } from "./usePreventionSyncOnReconnect";

function Harness() {
  useSyncProgressOnReconnect();
  usePreventionSyncOnReconnect();
  return null;
}
describe("AG3 P1 concurrent old v1 reconnect hooks deny all unowned dispatch", () => {
  let node: HTMLDivElement;
  let root: Root;
  async function render() {
    await act(async () => root.render(createElement(Harness)));
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offline = true;
    mocks.principal = "USER_A";
    mocks.processNext.mockResolvedValue("done");
    mocks.processQueue.mockResolvedValue("done");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
  });
  it("denies reconnect dispatch, cache invalidation, and dialogs for A, B and logout", async () => {
    await render();
    for (const principal of ["USER_A", "USER_B", "", "USER_A"]) {
      mocks.principal = principal;
      mocks.offline = false;
      await render();
      mocks.offline = true;
      await render();
    }
    expect(mocks.processNext).not.toHaveBeenCalled();
    expect(mocks.processQueue).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.progress).toEqual([{ queueId: "legacy-v1-unknown-owner" }]);
  });
});
