// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
    user: { id: "USER_A", role: "USER", username: "owner" },
  } as {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: { id: string; role: string; username: string } | null;
  },
  prefetchQuery: vi.fn(),
  getQueryState: vi.fn(),
  getQueryData: vi.fn(),
  cancelQueries: vi.fn(),
  runs: [] as { principal: string; query: string }[],
  afterInteractions: vi.fn(),
}));

vi.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: (callback: () => void) => {
      mocks.afterInteractions(callback);
      callback();
      return { cancel: vi.fn() };
    },
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    prefetchQuery: mocks.prefetchQuery,
    getQueryState: mocks.getQueryState,
    getQueryData: mocks.getQueryData,
    cancelQueries: mocks.cancelQueries,
  }),
}));
vi.mock("./useNetworkStatus", () => ({ useIsOffline: () => false }));
vi.mock("@/shared/stores", () => ({
  useAuthStore: (selector: (s: typeof mocks.auth) => unknown) => selector(mocks.auth),
}));
vi.mock("@/shared/lib/api/achievementsQuery", () => ({
  achievementsForActor: (actor: { ownerId: string; authEpoch: string } | null) => ({
    queryKey: ["achievements", "owner", actor?.ownerId ?? null, actor?.authEpoch ?? null],
    enabled: Boolean(actor),
  }),
}));
vi.mock("@/shared/lib/api/articlesQuery", () => ({
  articlesQueryOptions: { queryKey: ["articles"] },
}));
vi.mock("@/shared/lib/api/favoritesQuery", () => ({
  favoritesQueryOptions: { queryKey: ["favorites"] },
}));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getVerifiedPushActor: () =>
    mocks.auth.isAuthenticated && mocks.auth.user
      ? { ownerId: mocks.auth.user.id, authEpoch: `mock-epoch-${mocks.auth.user.id}` }
      : null,
}));
vi.mock("@/shared/lib/api/profileTabQueries", () => ({
  petsQueryOptions: { queryKey: ["pets"] },
  petListForActor: (result: unknown, actor: unknown) => (result && actor ? result : null),
  verifiedPetsActor: () =>
    mocks.auth.isAuthenticated && mocks.auth.user
      ? { ownerId: mocks.auth.user.id, authEpoch: `mock-epoch-${mocks.auth.user.id}` }
      : null,
  pushDeviceStatusForActor: (actor: { ownerId: string; authEpoch: string } | null) => ({
    queryKey: ["push-subscription-device-status", actor?.ownerId, actor?.authEpoch],
    enabled: Boolean(actor),
  }),
  studentNotesQueryOptions: { queryKey: ["student-notes"] },
  userProfileQueryOptions: { queryKey: ["user-profile"] },
  trainerPublicProfileQueryOptions: (name: string) => ({
    queryKey: ["trainer-public-profile", name],
  }),
}));

import { usePrefetchOtherTabsAfterCourses } from "./usePrefetchOtherTabsAfterCourses";

function Harness() {
  usePrefetchOtherTabsAfterCourses({ catalogReady: true });
  return null;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AG3-CACHE-012 principal-owned prefetch after course tab", () => {
  let root: Root;
  let node: HTMLDivElement;

  async function render() {
    await act(async () => {
      root.render(createElement(Harness));
    });
  }
  async function completeStagger() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.auth = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: "USER_A", role: "USER", username: "owner" },
    };
    mocks.runs = [];
    mocks.getQueryState.mockReturnValue(undefined);
    mocks.getQueryData.mockReturnValue(undefined);
    mocks.cancelQueries.mockResolvedValue(undefined);
    mocks.prefetchQuery.mockImplementation(async (options: { queryKey: readonly string[] }) => {
      mocks.runs.push({
        principal: mocks.auth.user?.id ?? "anonymous",
        query: options.queryKey[0] ?? "unknown",
      });
    });
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    node.remove();
    vi.useRealTimers();
  });

  it("prefetches private USER-B tabs after direct A→B switch without an intermediate logout", async () => {
    await render();
    await completeStagger();
    expect(
      mocks.runs.filter((x) => x.principal === "USER_A" && x.query === "favorites"),
    ).toHaveLength(1);

    // AuthProvider clears private in-memory QueryClient on principal change.
    mocks.auth = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: "USER_B", role: "USER", username: "second" },
    };
    await render();
    await completeStagger();

    for (const query of [
      "favorites",
      "achievements",
      "user-profile",
      "pets",
      "push-subscription-device-status",
      "student-notes",
    ]) {
      expect(mocks.runs).toContainEqual({ principal: "USER_B", query });
    }
  });

  it("cancels follow-on USER-A private queries when B logs in while A favorites fetch is pending", async () => {
    const old = deferred();
    mocks.prefetchQuery.mockImplementationOnce(async () => undefined); // articles
    mocks.prefetchQuery.mockImplementationOnce(async () => {
      mocks.runs.push({ principal: "USER_A", query: "favorites" });
      await old.promise;
    });

    await render();
    expect(mocks.runs).toContainEqual({ principal: "USER_A", query: "favorites" });

    mocks.auth = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: "USER_B", role: "USER", username: "second" },
    };
    await render();

    await act(async () => {
      old.resolve();
      await Promise.resolve();
    });
    await completeStagger();

    expect(mocks.runs.filter((x) => x.principal === "USER_A" && x.query !== "favorites")).toEqual(
      [],
    );
    expect(mocks.runs).toContainEqual({ principal: "USER_B", query: "favorites" });
    expect(mocks.runs).toContainEqual({ principal: "USER_B", query: "pets" });
  });

  it("does not repeat private prefetch when only the same principal rerenders", async () => {
    await render();
    await completeStagger();
    const first = mocks.runs.filter((x) => x.query === "favorites").length;

    mocks.auth = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: "USER_A", role: "USER", username: "owner" },
    };
    await render();
    await completeStagger();
    expect(mocks.runs.filter((x) => x.query === "favorites")).toHaveLength(first);
  });
});
