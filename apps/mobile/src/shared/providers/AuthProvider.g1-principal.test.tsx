// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  auth: { isAuthenticated: true, isLoading: false, user: { id: "USER_A" }, verifiedSessionEpoch: "mock-epoch-USER_A" },
  favoritesFetch: vi.fn(),
  setCourseState: vi.fn(),
  resetUserStores: vi.fn(),
  reportClientError: vi.fn(),
  bindingMissing: false,
}));
vi.mock("expo-router", () => ({ useRootNavigationState: () => ({ key: "root" }) }));
vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => mocks.client,
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth),
    { getState: () => mocks.auth },
  ),
  useCourseStore: { setState: mocks.setCourseState },
  useStepStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}));
vi.mock("@/shared/stores/networkStatusStore", () => ({
  useNetworkStatusStore: (selector: (state: { isOffline: boolean }) => unknown) =>
    selector({ isOffline: true }),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => mocks.bindingMissing ? null : {
      principalId: mocks.auth.user?.id,
      authEpoch: `mock-epoch-${mocks.auth.user?.id}`,
    },
  },
}));
vi.mock("@/shared/components/VerifiedSessionRecovery", async () => {
  const React = await import("react");
  return { VerifiedSessionRecovery: () => React.createElement("div", null, "repair") };
});
vi.mock("@/shared/stores/resetAll", () => ({ resetUserStores: mocks.resetUserStores }));
vi.mock("@/shared/lib/api/favoritesQuery", () => ({
  favoritesQueryOptions: {
    queryKey: ["favorites"],
    queryFn: () => mocks.favoritesFetch(),
  },
}));
vi.mock("@/shared/lib/api/mobile-intro", () => ({ flushMobileIntroEvents: vi.fn() }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportClientError }));
vi.mock("@/shared/components/ui/Loading", () => ({ Loading: () => null }));

import { AuthProvider } from "./AuthProvider";

describe("AG3-CACHE-012 authenticated identity switch isolation", () => {
  let root: Root;
  let node: HTMLDivElement;
  async function render() {
    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement("div", null, "ready")));
    });
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bindingMissing = false;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    mocks.auth = { isAuthenticated: true, isLoading: false, user: { id: "USER_A" }, verifiedSessionEpoch: "mock-epoch-USER_A" };
    mocks.favoritesFetch.mockImplementation(async () => ({
      data: { favoriteIds: ["favorite-" + mocks.auth.user.id] },
    }));
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
    (mocks.client as QueryClient).clear();
  });
  it("clears USER-A private query memory and prefetches USER-B favorites on direct switch", async () => {
    await render();
    const client = mocks.client as QueryClient;
    client.setQueryData(["pets"], [{ id: "PRIVATE_USER_A_PET" }]);
    client.setQueryData(["chat"], [{ id: "PRIVATE_USER_A_CHAT" }]);
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(1);

    mocks.auth = { isAuthenticated: true, isLoading: false, user: { id: "USER_B" }, verifiedSessionEpoch: "mock-epoch-USER_B" };
    await render();

    expect(client.getQueryData(["pets"])).toBeUndefined();
    expect(client.getQueryData(["chat"])).toBeUndefined();
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(2);
    expect(mocks.setCourseState).toHaveBeenLastCalledWith({
      favorites: ["favorite-USER_B"],
    });
    expect(mocks.resetUserStores).not.toHaveBeenCalled();
  });
  it("ignores a pending USER-A favorites response after USER-B became active", async () => {
    let releaseA: ((value: { data: { favoriteIds: string[] } }) => void) | undefined;
    mocks.favoritesFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseA = resolve;
        }),
    );
    mocks.favoritesFetch.mockResolvedValue({
      data: { favoriteIds: ["favorite-USER_B"] },
    });
    await render();
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(1);
    mocks.auth = { isAuthenticated: true, isLoading: false, user: { id: "USER_B" }, verifiedSessionEpoch: "mock-epoch-USER_B" };
    await render();
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      releaseA?.({ data: { favoriteIds: ["PRIVATE_USER_A_FAVORITES"] } });
      await Promise.resolve();
    });
    const writes = mocks.setCourseState.mock.calls.map(([arg]) => arg?.favorites);
    expect(writes).not.toContainEqual(["PRIVATE_USER_A_FAVORITES"]);
    expect(mocks.setCourseState).toHaveBeenLastCalledWith({
      favorites: ["favorite-USER_B"],
    });
  });
  it("keeps USER-A cache when an authenticated re-render has the same principal", async () => {
    await render();
    const client = mocks.client as QueryClient;
    client.setQueryData(["pets"], [{ id: "PRIVATE_USER_A_PET" }]);

    mocks.auth = { isAuthenticated: true, isLoading: false, user: { id: "USER_A" }, verifiedSessionEpoch: "mock-epoch-USER_A" };
    await render();

    expect(client.getQueryData(["pets"])).toEqual([{ id: "PRIVATE_USER_A_PET" }]);
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resetUserStores).not.toHaveBeenCalled();
  });

  it("blocks an optimistic cached session until V2 is restored, then prefetches safely", async () => {
    mocks.bindingMissing = true;
    await render();
    expect(node.textContent).toContain("repair");
    expect(mocks.favoritesFetch).not.toHaveBeenCalled();

    // Auth check verified the profile and upgraded the native V2 binding.
    mocks.bindingMissing = false;
    await render();
    expect(node.textContent).toContain("ready");
    expect(mocks.favoritesFetch).toHaveBeenCalledOnce();
  });

  it("unblocks automatically when the same cached user receives a reactive verified epoch", async () => {
    mocks.auth = { ...mocks.auth, verifiedSessionEpoch: null as unknown as string };
    await render();
    expect(node.textContent).toContain("repair");
    expect(mocks.favoritesFetch).not.toHaveBeenCalled();

    // Only the verified epoch changes; user ID and isAuthenticated remain identical.
    mocks.auth = { ...mocks.auth, verifiedSessionEpoch: "mock-epoch-USER_A" };
    await render();
    expect(node.textContent).toContain("ready");
    expect(mocks.favoritesFetch).toHaveBeenCalledOnce();
  });

  it("retains normal logout cleanup instead of treating logout as a direct switch", async () => {
    await render();

    mocks.auth = {
      isAuthenticated: false,
      isLoading: false,
      user: null as unknown as { id: string },
      verifiedSessionEpoch: null as unknown as string,
    };
    await render();

    expect(mocks.resetUserStores).toHaveBeenCalledOnce();
    expect(mocks.favoritesFetch).toHaveBeenCalledTimes(1);
  });
});
