// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  auth: true,
  focus: true,
  loading: false,
  username: "alice",
  request: vi.fn(),
  courses: vi.fn(),
  paywall: vi.fn(),
  trace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        isAuthenticated: m.auth,
        isLoading: m.loading,
        user: m.auth ? { id: m.owner, username: m.username } : null,
      }),
    {
      getState: () => ({
        isAuthenticated: m.auth,
        isLoading: m.loading,
        user: m.auth ? { id: m.owner, username: m.username } : null,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/achievements", () => ({
  achievementsApi: { getAchievements: (...args: unknown[]) => m.request(...args) },
}));
vi.mock("@/shared/lib/api/courses", () => ({
  coursesApi: { getAll: (...args: unknown[]) => m.courses(...args) },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/features/app-subscription", () => ({
  openAppSubscriptionPaywall: (...args: unknown[]) => m.paywall(...args),
}));
vi.mock("expo-router", async () => {
  const R = await import("react");
  return {
    useRouter: () => ({ push: (...args: unknown[]) => m.push(...args) }),
    useFocusEffect: (effect: () => void | (() => void)) =>
      R.useEffect(() => {
        if (!m.focus) return;
        return effect();
      }, [effect, m.focus]),
  };
});
vi.mock("@/shared/config", () => ({
  COLORS: { cardBackground: "gray", background: "white", primary: "olive" },
  SPACING: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24 },
  FONTS: { montserrat: "sans", montserratBold: "bold" },
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: ({ message }: { message: string }) =>
      R.createElement("div", { "data-loading": true }, message),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    ScrollView: ({
      children,
      refreshControl,
    }: {
      children?: React.ReactNode;
      refreshControl?: React.ReactNode;
    }) => R.createElement("div", null, refreshControl, children),
    StyleSheet: { create: (x: unknown) => x },
    Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress }, children),
    RefreshControl: ({ onRefresh }: { onRefresh?: () => void }) =>
      R.createElement(
        "button",
        { "data-label": "refresh-control", onClick: onRefresh },
        "Обновить",
      ),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Button: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress }, children),
  };
});
import AchievementsScreen from "../../../../app/(main)/(tabs)/achievements";
let root: Root, host: HTMLDivElement, client: QueryClient;
const success = (count: number) => ({
  success: true,
  data: {
    totalCourses: count,
    completedCourses: 0,
    inProgressCourses: 1,
    totalCompletedDays: 14,
    achievements: [
      {
        id: "one",
        category: "courses",
        icon: "🏆",
        title: "Личный прогресс",
        description: "PRIVATE_STAT",
        unlocked: true,
        progress: 50,
      },
    ],
  },
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { resolve, promise };
};
async function render() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(AchievementsScreen))),
  );
}
async function settled(text: string) {
  await vi.waitFor(() => expect(host.textContent).toContain(text));
}
function button(name: string) {
  const buttons = Array.from(host.querySelectorAll("button"));
  return buttons.find((b) => b.textContent?.includes(name));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.username = "alice";
  m.auth = true;
  m.focus = true;
  m.loading = false;
  m.request.mockResolvedValue(success(42));
  m.courses.mockResolvedValue({
    success: true,
    data: [{ id: "course1", type: "basic", name: "PRIVATE_COURSE", userStatus: "COMPLETED" }],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe("AG3 actual mounted Achievements entitlement and owner private cache", () => {
  it("verified owner gets guarded fresh achievements, stats, scoped courses", async () => {
    await render();
    await settled("Личный прогресс");
    await settled("PRIVATE_COURSE");
    expect(host.textContent).toContain("42");
    expect(m.request).toHaveBeenCalledWith(expect.any(Function));
    expect(m.request.mock.calls[0][0]()).toBe(true);
    expect(m.courses).toHaveBeenCalledWith(undefined, expect.any(Function));
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey.join("/") === "achievements/owner/A/E1"),
    ).toBe(true);
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey.join("/") === "achievements"),
    ).toBe(false);
  });
  it("403 SUBSCRIPTION_REQUIRED from Hono masks stats and shows user-initiated paywall", async () => {
    m.request.mockResolvedValue({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
      error: "secret PRIVATE_STAT",
    });
    await render();
    await settled("Достижения доступны по подписке");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(host.textContent).not.toContain("secret");
    expect(m.courses).not.toHaveBeenCalled();
    expect(m.paywall).not.toHaveBeenCalled();
    await act(async () => button("Посмотреть подписку")?.click());
    expect(m.paywall).toHaveBeenCalledExactlyOnceWith({
      reason: "required",
      contentMode: "subscription",
    });
  });
  it.each(["UNAUTHORIZED", "AUTH_REFRESH_UNAVAILABLE"])(
    "401/%s forces sign-in state, no statistics",
    async (code) => {
      m.request.mockResolvedValue({ success: false, code, error: "PRIVATE_STAT" });
      await render();
      await settled("Необходимо войти снова");
      expect(host.textContent).not.toContain("PRIVATE_STAT");
      expect(m.paywall).not.toHaveBeenCalled();
      expect(m.courses).not.toHaveBeenCalled();
    },
  );
  it.each(["ACHIEVEMENTS_ACCESS_CHECK_FAILED", "REQUEST_TIMEOUT", "NETWORK_ERROR"])(
    "%s is unknown, never empty successful stats",
    async (code) => {
      m.request.mockResolvedValue({ success: false, code, error: "PRIVATE_STAT" });
      await render();
      await settled("Не удалось проверить доступ");
      expect(host.textContent).not.toContain("PRIVATE_STAT");
      expect(m.courses).not.toHaveBeenCalled();
      expect(m.paywall).not.toHaveBeenCalled();
    },
  );
  it("pending GET shows loader rather than stale/private data", async () => {
    const pending = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValue(pending.promise);
    await render();
    await settled("Загрузка достижений");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    await act(async () => pending.resolve(success(42)));
    await settled("Личный прогресс");
  });
  it("logout while API response delayed rejects late stats and disables follow-on private courses", async () => {
    const pending = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValue(pending.promise);
    await render();
    await settled("Загрузка достижений");
    const guard = m.request.mock.calls[0][0] as () => boolean;
    m.auth = false;
    await render();
    await settled("Войдите в аккаунт");
    expect(guard()).toBe(false);
    await act(async () => pending.resolve(success(789)));
    expect(host.textContent).not.toContain("789");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(m.courses).not.toHaveBeenCalled();
  });
  it("A→B→A new epoch while late GET pending cannot show A old cache", async () => {
    const pending = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValue(pending.promise);
    await render();
    await settled("Загрузка достижений");
    const oldGuard = m.request.mock.calls[0][0] as () => boolean;
    m.owner = "B";
    m.epoch = "E-B";
    m.username = "bob";
    m.owner = "A";
    m.epoch = "E2";
    m.request.mockResolvedValue(success(8));
    await render();
    expect(oldGuard()).toBe(false);
    await act(async () => pending.resolve(success(789)));
    await settled("Личный прогресс");
    expect(host.textContent).not.toContain("789");
    expect(host.textContent).toContain("8");
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey.join("/") === "achievements/owner/A/E2"),
    ).toBe(true);
  });
  it("entitlement expires on manual refresh: old data immediately hidden, then 403", async () => {
    await render();
    await settled("Личный прогресс");
    m.request.mockResolvedValue({ success: false, code: "SUBSCRIPTION_REQUIRED" });
    await act(async () => button("Обновить")?.click());
    await settled("Достижения доступны по подписке");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(m.paywall).not.toHaveBeenCalled();
  });
  it("cached USER-A success never renders for USER-B or fresh USER-A epoch", async () => {
    await render();
    await settled("Личный прогресс");
    expect(host.textContent).toContain("42");
    const pending = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValue(pending.promise);
    m.owner = "B";
    m.username = "bob";
    m.epoch = "B1";
    await render();
    await settled("Загрузка достижений");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(host.textContent).not.toContain("42");
    m.owner = "A";
    m.username = "alice";
    m.epoch = "E2";
    m.request.mockResolvedValue(success(7));
    await render();
    await settled("Личный прогресс");
    expect(host.textContent).not.toContain("42");
    expect(host.textContent).toContain("7");
    await act(async () => pending.resolve(success(999)));
    expect(host.textContent).not.toContain("999");
  });
  it("refresh with pending entitlement hides previously granted stats before new 403 arrives", async () => {
    await render();
    await settled("Личный прогресс");
    const pending = deferred<{ success: false; code: string }>();
    m.request.mockReturnValue(pending.promise);
    await act(async () => button("Обновить")?.click());
    await settled("Загрузка достижений");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(host.textContent).not.toContain("42");
    await act(async () => pending.resolve({ success: false, code: "SUBSCRIPTION_REQUIRED" }));
    await settled("Достижения доступны по подписке");
    expect(host.textContent).not.toContain("PRIVATE_COURSE");
  });
  it("first focus rejected READ does not spin forever or expose cached private statistics", async () => {
    m.request.mockRejectedValueOnce(Error("PRIVATE_GET_STACK"));
    await render();
    await settled("Не удалось загрузить достижения");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(host.textContent).not.toContain("PRIVATE_GET_STACK");
    expect(host.textContent).not.toContain("Загрузка достижений");
    expect(m.courses).not.toHaveBeenCalled();
    expect(button("Повторить загрузку")).toBeDefined();
    expect(m.trace).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ACHIEVEMENTS_READ_REFRESH_FAILED" }),
      expect.objectContaining({ issueKey: "Achievements" }),
    );
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_GET_STACK");
  });

  it("resolved observer error without reliable data yields neutral retry instead of spinner", async () => {
    m.request.mockRejectedValueOnce(Error("PRIVATE_OBSERVER_ERROR"));
    await render();
    await settled("Не удалось загрузить достижения");
    expect(host.textContent).not.toContain("PRIVATE_OBSERVER_ERROR");
    expect(button("Повторить загрузку")).toBeDefined();
  });

  it("manual retry after initial failure is single-flight and proves only current successful data", async () => {
    m.request.mockRejectedValueOnce(Error("PRIVATE_FIRST_ERROR"));
    await render();
    await settled("Не удалось загрузить достижения");
    const next = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValue(next.promise);
    await act(async () => {
      button("Повторить загрузку")?.click();
      button("Повторить загрузку")?.click();
    });
    expect(m.request).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    await act(async () => next.resolve(success(87)));
    await settled("Личный прогресс");
    expect(host.textContent).toContain("87");
    expect(m.courses).toHaveBeenCalled();
  });

  it("failed pull refresh clears proof, hides cached grant and offers recovery", async () => {
    await render();
    await settled("Личный прогресс");
    expect(host.textContent).toContain("42");
    m.request.mockRejectedValueOnce(Error("PRIVATE_PULL_REFRESH"));
    await act(async () => button("Обновить")?.click());
    await settled("Не удалось загрузить достижения");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    expect(host.textContent).not.toContain("42");
    expect(host.textContent).not.toContain("PRIVATE_PULL_REFRESH");
    m.request.mockResolvedValue(success(29));
    await act(async () => button("Повторить загрузку")?.click());
    await settled("Личный прогресс");
    expect(host.textContent).toContain("29");
  });

  it("focus leave and reentry ignore late old failure without freeing current retry", async () => {
    const old = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValueOnce(old.promise);
    await render();
    await settled("Загрузка достижений");
    m.focus = false;
    await render();
    m.focus = true;
    const fresh = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValueOnce(fresh.promise);
    await render();
    const callsAfterNewFocus = m.request.mock.calls.length;
    expect(callsAfterNewFocus).toBeGreaterThanOrEqual(2);
    await act(async () => old.resolve(success(999)));
    expect(host.textContent).not.toContain("999");
    expect(host.textContent).not.toContain("PRIVATE_STAT");
    await act(async () => fresh.resolve(success(55)));
    await settled("Личный прогресс");
    expect(host.textContent).toContain("55");
    expect(host.textContent).not.toContain("999");
    expect(m.trace).not.toHaveBeenCalled();
  });

  it("A→B→A stale first-focus completion never publishes old proof/error", async () => {
    const old = deferred<ReturnType<typeof success>>();
    m.request.mockReturnValueOnce(old.promise);
    await render();
    m.owner = "B";
    m.epoch = "B1";
    m.request.mockResolvedValueOnce(success(19));
    await render();
    m.owner = "A";
    m.epoch = "E2";
    m.request.mockResolvedValueOnce(success(23));
    await render();
    await settled("23");
    expect(host.textContent).toContain("Личный прогресс");
    await act(async () => old.resolve(success(999)));
    expect(host.textContent).not.toContain("999");
    expect(host.textContent).toContain("23");
  });

  it("foreign/unverified native login never starts private GET even if auth store user exists", async () => {
    m.epoch = "";
    await render();
    await settled("Войдите в аккаунт");
    expect(m.request).not.toHaveBeenCalled();
    expect(m.courses).not.toHaveBeenCalled();
  });
});
