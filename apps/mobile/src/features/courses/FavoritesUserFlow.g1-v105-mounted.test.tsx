// @vitest-environment jsdom
/** V105 actual FavoritesScreen mounted with QueryClient and synthetic GET/POST.
 * Existing CourseCard stays a test visual leaf; it has no bookmark UI today.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  offline: false,
  stored: ["cA"] as string[],
  database: { A: ["cA"], B: ["cB"] } as Record<string, string[]>,
  calls: [] as { method: string; owner: string; id?: string; action?: string; guard?: boolean }[],
  pendingGet: null as Promise<unknown> | null,
  pendingPost: null as Promise<unknown> | null,
  failGet: false,
  failPost: false,
  malformed: false,
  push: vi.fn(),
  replace: vi.fn(),
  report: vi.fn(),
  api: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
const rows = {
  cA: {
    id: "cA",
    name: "Курс A",
    type: "A_TYPE",
    shortDesc: "Тренировки A",
    isPaid: false,
    isPrivate: false,
    hasAccess: true,
    isFavorite: true,
    logoImg: "",
    duration: "2 часа",
    trainingLevel: "BEGINNER",
    userStatus: "NOT_STARTED",
    updatedAt: "2026-10-20",
    createdAt: "2026-10-20",
    startedAt: null,
    completedAt: null,
    description: "",
    authorUsername: "teacher",
    avgRating: null,
  },
  cB: {
    id: "cB",
    name: "Курс B",
    type: "B_TYPE",
    shortDesc: "Тренировки B",
    isPaid: false,
    isPrivate: false,
    hasAccess: true,
    isFavorite: true,
    logoImg: "",
    duration: "2 часа",
    trainingLevel: "BEGINNER",
    userStatus: "NOT_STARTED",
    updatedAt: "2026-10-20",
    createdAt: "2026-10-20",
    startedAt: null,
    completedAt: null,
    description: "",
    authorUsername: "teacher",
    avgRating: null,
  },
};
const read = async () => {
  const owner = m.owner;
  m.calls.push({ method: "GET", owner });
  if (m.pendingGet) return m.pendingGet;
  if (m.failGet) return { success: false, error: "PRIVATE_SERVER_ERROR" };
  const favoriteIds = [...(m.database[owner] ?? [])];
  return {
    success: true,
    data: { favoriteIds, data: favoriteIds.map((id) => rows[id as keyof typeof rows]) },
  };
};
const write = async (courseId: string, action: string, guard?: () => boolean) => {
  const owner = m.owner;
  if (guard && !guard()) return { success: false, code: "G05_SESSION_CHANGED" };
  m.calls.push({ method: "POST", owner, id: courseId, action, guard: guard?.() });
  if (m.pendingPost) return m.pendingPost;
  if (m.failPost) return { success: false, error: "PRIVATE_WRITER_ERROR", code: "UNKNOWN" };
  if (action !== "remove") throw Error("UNAPPROVED_ACTION");
  m.database[owner] = (m.database[owner] ?? []).filter((id) => id !== courseId);
  return { success: true, data: { isFavorite: m.malformed ? true : false } };
};
vi.mock("@/shared/stores", () => {
  const store = () => ({
    favorites: m.stored,
    addToFavorites: (id: string) => {
      m.stored = [...new Set([...m.stored, id])];
    },
    removeFromFavorites: (id: string) => {
      m.stored = m.stored.filter((x) => x !== id);
    },
  });
  return {
    useCourseStore: Object.assign(
      (selector: (s: ReturnType<typeof store>) => unknown) => selector(store()),
      {
        getState: store,
        setState: (data: { favorites?: string[] }) => {
          if (data.favorites) m.stored = data.favorites;
        },
      },
    ),
    useAuthStore: Object.assign(
      (
        selector: (s: {
          user: { id: string } | null;
          isAuthenticated: boolean;
          isLoading: boolean;
        }) => unknown,
      ) =>
        selector({
          user: m.authed ? { id: m.owner } : null,
          isAuthenticated: m.authed,
          isLoading: m.authLoading,
        }),
      {
        getState: () => ({
          user: m.authed ? { id: m.owner } : null,
          isAuthenticated: m.authed,
          isLoading: m.authLoading,
        }),
      },
    ),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => m.offline }));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...values: unknown[]) => m.report(...values),
}));
vi.mock("@/shared/lib/api/courses", () => ({
  coursesApi: {
    getFavorites: (...args: unknown[]) => m.get(...args),
    toggleFavorite: (...args: Parameters<typeof write>) => m.post(...args),
  },
}));
vi.mock("@/shared/lib/api", () => ({
  coursesApi: {
    getFavorites: (...args: unknown[]) => m.get(...args),
    toggleFavorite: (...args: Parameters<typeof write>) => m.post(...args),
  },
}));
vi.mock("@/shared/lib/api/client", () => ({
  apiClient: (
    url: string,
    options?: {
      method?: string;
      body?: { courseId: string; action: string };
      requestGuard?: () => boolean;
    },
  ) => {
    if (url !== "/api/v1/courses/favorites") throw Error("UNAPPROVED_ROUTE");
    if (options?.method === "POST" && options.body)
      return m.post(options.body.courseId, options.body.action, options.requestGuard);
    if (options?.requestGuard && !options.requestGuard())
      return Promise.resolve({ success: false, code: "G05_SESSION_CHANGED" });
    return m.get();
  },
}));
vi.mock("@/shared/lib/api/favoritesQuery", () => ({
  favoritesQueryOptions: {
    queryKey: ["favorites"],
    queryFn: async () => {
      const result = await m.get();
      if (!result || typeof result !== "object" || !(result as { success: boolean }).success)
        throw Error("FAVORITES_FETCH_FAILED");
      return result;
    },
  },
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "#fff",
    text: "#111",
    textSecondary: "#444",
    error: "#a00",
    secondary: "#456",
  },
  SPACING: { md: 12, sm: 8, xs: 4, xl: 24, xxl: 36 },
  FONTS: { impact: "test" },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("section", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: ({ message }: { message: string }) => R.createElement("span", null, message),
  };
});
vi.mock("expo-router", () => ({ useRouter: () => ({
  push: (route: string) => m.push(route),
  replace: (route: string) => m.replace(route),
}) }));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    StyleSheet: { create: (data: unknown) => data },
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel },
        children,
      ),
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement(
        "button",
        { onClick: onRefresh, "aria-label": "Обновить избранные курсы" },
        "Обновить",
      ),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Snackbar: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? R.createElement("aside", null, children) : null,
  };
});
vi.mock("@shopify/flash-list", async () => {
  const R = await import("react");
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      refreshControl,
    }: {
      data: unknown[];
      renderItem: (p: { item: unknown }) => React.ReactNode;
      ListHeaderComponent?: () => React.ReactNode;
      refreshControl?: React.ReactNode;
    }) =>
      R.createElement(
        "div",
        null,
        ListHeaderComponent?.(),
        refreshControl,
        ...data.map((item, i) => R.createElement("div", { key: i }, renderItem({ item }))),
      ),
  };
});
vi.mock("@/features/offline", () => ({ OfflineDownloadedScreen: () => null }));
vi.mock("@/features/courses", async () => {
  const R = await import("react");
  return {
    CourseCard: ({ course }: { course: { id: string; name: string; type: string } }) =>
      R.createElement(
        "button",
        {
          onClick: () => m.push(`/training/${course.type}`),
          "aria-label": `Открыть курс «${course.name}»`,
        },
        course.name,
      ),
  };
});
import HiddenFavoritesRoute, { FavoritesScreenContent as FavoritesScreen }
  from "../../../app/(main)/(tabs)/courses";
let root: Root, host: HTMLDivElement, client: QueryClient;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 17; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(FavoritesScreen))),
  );
  await flush();
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (x) => x.getAttribute("aria-label") === label || x.textContent?.includes(label),
  );
  expect(button, `button ${label} missing`).toBeTruthy();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockImplementation(read);
  m.post.mockImplementation(write);
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.authLoading = false;
  m.offline = false;
  m.stored = ["cA"];
  m.database = { A: ["cA"], B: ["cB"] };
  m.calls = [];
  m.failGet = false;
  m.failPost = false;
  m.malformed = false;
  m.pendingGet = null;
  m.pendingPost = null;
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
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { resolve, promise };
};
describe("AG3 V105 Favorites actual screen user route", () => {
  it("renders own saved course, opens its actual user-facing training route", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Открыть курс «Курс A»");
    expect(m.push).toHaveBeenCalledWith("/training/A_TYPE");
  });
  it("user can remove a favorite from the Favorites screen and sees confirmed empty", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Убрать из избранного: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("У вас пока нет избранных курсов"));
    expect(m.calls.filter((c) => c.method === "POST")).toEqual([
      {
        method: "POST",
        owner: "A",
        id: "cA",
        action: "remove",
        guard: true,
      },
    ]);
  });

  it("guest sends zero private GET/POST and sees login guidance", async () => {
    m.authed = false;
    await mount();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.calls).toEqual([]);
  });
  it("loading and read failure are not a successful empty favorites list; retry recovers", async () => {
    m.failGet = true;
    await mount();
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Не удалось загрузить избранные курсы"),
    );
    expect(host.textContent).not.toContain("У вас пока нет избранных курсов");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ERROR");
    m.failGet = false;
    await click("Попробовать снова");
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
  });
  it("A cached Zustand favorites never paint B course: owner B GET and course navigation", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    m.owner = "B";
    m.epoch = "B1";
    m.stored = ["cA"];
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс B"));
    expect(host.textContent).not.toContain("Курс A");
    await click("Открыть курс «Курс B»");
    expect(m.push).toHaveBeenCalledWith("/training/B_TYPE");
    expect(m.calls.filter((c) => c.method === "GET").map((c) => c.owner)).toEqual(["A", "B"]);
  });
  it("rapid duplicate remove while POST pending dispatches once; only ACK removes row", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    const result = deferred<{ success: boolean; data: { isFavorite: boolean } }>();
    m.pendingPost = result.promise;
    const button = Array.from(host.querySelectorAll("button")).find(
      (x) => x.getAttribute("aria-label") === "Убрать из избранного: Курс A",
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button?.click();
      button?.click();
    });
    await flush();
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(host.textContent).toContain("Курс A");
    m.database.A = [];
    await act(async () => result.resolve({ success: true, data: { isFavorite: false } }));
    await vi.waitFor(() => expect(host.textContent).toContain("У вас пока нет избранных курсов"));
    expect(m.stored).toEqual([]);
  });
  it("unknown POST outcome preserves course and cannot silently repeat until successful refresh", async () => {
    m.failPost = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Убрать из избранного: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить удаление"));
    expect(host.textContent).toContain("Курс A");
    expect(m.stored).toContain("cA");
    const button = Array.from(host.querySelectorAll("button")).find(
      (x) => x.getAttribute("aria-label") === "Убрать из избранного: Курс A",
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
    const before = m.calls.filter((c) => c.method === "POST").length;
    await act(async () => button?.click());
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(before);
    m.failPost = false;
    await click("Обновить избранные курсы");
    const reenabled = Array.from(host.querySelectorAll("button")).find(
      (x) => x.getAttribute("aria-label") === "Убрать из избранного: Курс A",
    );
    await vi.waitFor(() => expect(reenabled?.hasAttribute("disabled")).toBe(false));
    await click("Убрать из избранного: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("У вас пока нет избранных курсов"));
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(before + 1);
    expect(JSON.stringify(m.report.mock.calls)).not.toContain("PRIVATE_WRITER_ERROR");
  });
  it("malformed positive remove ACK does not remove row or permit instant re-POST", async () => {
    m.malformed = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Убрать из избранного: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить удаление"));
    expect(host.textContent).toContain("Курс A");
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(m.stored).toContain("cA");
  });
  it("late A list response across A->B->A fresh epoch cannot paint old data", async () => {
    const late = deferred<unknown>();
    m.pendingGet = late.promise;
    await mount();
    await vi.waitFor(() => expect(m.calls.some((c) => c.method === "GET")).toBe(true));
    m.pendingGet = null;
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс B"));
    m.owner = "A";
    m.epoch = "E2";
    m.database.A = [];
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("У вас пока нет избранных курсов"));
    await act(async () =>
      late.resolve({ success: true, data: { favoriteIds: ["cA"], data: [rows.cA] } }),
    );
    await flush();
    expect(host.textContent).not.toContain("Курс A");
    expect(host.textContent).not.toContain("Курс B");
    expect(m.stored).toEqual([]);
  });
  it("logout while remove POST awaits ACK cannot mutate a new session's course store", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    const late = deferred<{ success: boolean; data: { isFavorite: boolean } }>();
    m.pendingPost = late.promise;
    const button = Array.from(host.querySelectorAll("button")).find(
      (x) => x.getAttribute("aria-label") === "Убрать из избранного: Курс A",
    );
    await act(async () => button?.click());
    await vi.waitFor(() => expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(1));
    m.authed = false;
    m.stored = ["cB"];
    await mount();
    await act(async () => late.resolve({ success: true, data: { isFavorite: false } }));
    await flush();
    expect(m.stored).toEqual(["cB"]);
    expect(host.textContent).toContain("войдите в аккаунт");
  });
});


describe("GAFUS hidden native favorites route", () => {
  it("returns nothing and navigates to catalog without any favorites GET", async () => {
    await act(async () => root.render(createElement(QueryClientProvider, { client },
      createElement(HiddenFavoritesRoute))));
    await flush();
    expect(host.textContent).toBe("");
    expect(m.replace).toHaveBeenCalledWith("/");
    expect(m.get).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
  });
});
