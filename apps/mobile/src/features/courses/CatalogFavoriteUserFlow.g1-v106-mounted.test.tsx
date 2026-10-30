// @vitest-environment jsdom
/** V106: real mounted existing CoursesScreen, synthetic course API. No device/HTTP/SQL. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  catalog: vi.fn(),
  post: vi.fn(),
  getFavorites: vi.fn(),
  remoteFavorites: { A: [] as string[], B: [] as string[] },
  native: { owner: "A", epoch: "E1" },
  calls: [] as {
    owner: string;
    method: string;
    id?: string;
    action?: string;
    guard?: boolean;
    skipReplay?: boolean;
  }[],
  pendingPost: null as Promise<unknown> | null,
  failPost: false,
  malformedPost: false,
  nav: vi.fn(),
  trace: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
}));
const oneCourse = (id = "c1", name = "Курс A") => ({
  id,
  name,
  type: "public-dog",
  shortDesc: "Обучение собак",
  description: "Обучение",
  logoImg: "",
  isPaid: false,
  isPrivate: false,
  hasAccess: true,
  isFavorite: false,
  createdAt: "2026-10-19",
  updatedAt: "2026-10-20",
  duration: "12 дней",
  trainingLevel: "BEGINNER",
  authorUsername: "trainer",
  avgRating: null,
  userStatus: "NOT_STARTED",
  startedAt: null,
  completedAt: null,
});
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  const useAuthStore = create(() => ({
    user: { id: "A", username: "owner" } as { id: string; username: string } | null,
    isAuthenticated: true,
    isLoading: false,
  }));
  type TestCourseStore = {
    favorites: string[];
    filters: Record<string, unknown>;
    addToFavorites: (id: string) => void;
    removeFromFavorites: (id: string) => void;
    isFavorite: (id: string) => boolean;
    setFilter: (key: string, value: unknown) => void;
  };
  const useCourseStore = create<TestCourseStore>((set, get) => ({
    favorites: [] as string[],
    filters: { tab: "all", level: "all", progress: "all", rating: "all", search: "", sort: "new" },
    addToFavorites: (id: string) =>
      set((s: { favorites: string[] }) => ({ favorites: [...new Set([...s.favorites, id])] })),
    removeFromFavorites: (id: string) =>
      set((s: { favorites: string[] }) => ({ favorites: s.favorites.filter((x) => x !== id) })),
    isFavorite: (id: string) => get().favorites.includes(id),
    setFilter: (key: string, value: unknown) =>
      set((s: { filters: Record<string, unknown> }) => ({
        filters: { ...s.filters, [key]: value },
      })),
  }));
  return { useAuthStore, useCourseStore };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.native.owner, authEpoch: m.native.epoch }),
  },
}));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => false }));
vi.mock("@/shared/hooks/useDailyCourse", () => ({
  getMobileMoscowDateKey: () => "2026-10-22",
  useTodayDailyCourse: () => ({ data: null, refetch: () => Promise.resolve() }),
}));
vi.mock("@/shared/hooks/usePrefetchOtherTabsAfterCourses", () => ({
  usePrefetchOtherTabsAfterCourses: () => undefined,
}));
vi.mock("@/shared/lib/api/public-config-query", () => ({
  useMobileAppPublicConfig: () => ({ data: null, isFetched: true }),
}));
vi.mock("@/shared/lib/api/coursesQuery", () => ({
  coursesCatalogQueryOptions: { queryKey: ["courses"], queryFn: () => m.catalog() },
}));
vi.mock("@/shared/lib/api", () => ({
  coursesApi: { toggleFavorite: (...args: unknown[]) => m.post(...args) },
}));
vi.mock("@/shared/lib/api/client", () => ({
  apiClient: (
    route: string,
    options?: {
      method?: string;
      body?: { courseId: string; action: string };
      requestGuard?: () => boolean;
      skipAuthRefreshReplay?: boolean;
    },
  ) => {
    if (route !== "/api/v1/courses/favorites") throw Error("UNAPPROVED_PATH");
    if (options?.method === "POST" && options.body)
      return m.post(
        options.body.courseId,
        options.body.action,
        options.requestGuard,
        options.skipAuthRefreshReplay,
      );
    if (options?.requestGuard && !options.requestGuard())
      return Promise.resolve({ success: false, code: "G05_SESSION_CHANGED" });
    return m.getFavorites();
  },
}));
vi.mock("@/shared/utils/courseFilters", () => ({
  filterAndSortCourses: (rows: unknown[]) => rows,
}));
vi.mock("@/features/onboarding-tour", () => ({
  useMobileOnboardingTourStore: (
    selector: (s: { isActive: boolean; currentStepId: null }) => unknown,
  ) => selector({ isActive: false, currentStepId: null }),
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "white",
    text: "black",
    textSecondary: "gray",
    error: "darkred",
    secondary: "olive",
    primary: "olive",
    cardBackground: "white",
  },
  SPACING: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  FONTS: { impact: "test", montserratBold: "test", montserrat: "test" },
  API_BASE_URL: "http://test.invalid",
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return { Loading: ({ message }: { message: string }) => R.createElement("span", null, message) };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("section", null, children),
  };
});
vi.mock("@/shared/lib/tour-targets", () => ({ TourTarget: () => null }));
vi.mock("@/features/offline", () => ({ OfflineDownloadedScreen: () => null }));
vi.mock("@/features/courses", async () => {
  const R = await import("react");
  return {
    CourseCard: ({ course }: { course: { name: string; type: string } }) =>
      R.createElement(
        "button",
        {
          onClick: () => m.nav(`/training/${course.type}`),
          "aria-label": `Открыть курс «${course.name}»`,
        },
        course.name,
      ),
    CourseSearch: () => null,
    CourseFilters: () => null,
  };
});
vi.mock("expo-router", () => ({ useRouter: () => ({ push: (route: string) => m.nav(route) }) }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-image", () => ({
  Image: Object.assign(() => null, { prefetch: (...args: unknown[]) => m.prefetch(...args) }),
}));
vi.mock("@shopify/flash-list", async () => {
  const R = await import("react");
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      refreshControl,
      ListEmptyComponent,
    }: {
      data: unknown[];
      renderItem: (arg: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      refreshControl?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) =>
      R.createElement(
        "div",
        null,
        ListHeaderComponent,
        refreshControl,
        data.length
          ? data.map((item, i) =>
              R.createElement("div", { key: i }, renderItem({ item, index: i })),
            )
          : ListEmptyComponent,
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
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    Image: () => null, // StartupLoader uses react-native Image; this DOM test has no bitmap.
    StyleSheet: { absoluteFill: {}, absoluteFillObject: {}, create: (x: unknown) => x },
    Platform: { OS: "android" },
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
        { disabled, onClick: onPress, "aria-label": accessibilityLabel },
        children,
      ),
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement(
        "button",
        { onClick: onRefresh, "aria-label": "Обновить каталог" },
        "Обновить",
      ),
    InteractionManager: { runAfterInteractions: () => ({ cancel: () => undefined }) },
  };
});
import RealCoursesScreen, { CoursesScreenContent as CoursesScreen }
  from "../../../app/(main)/(tabs)/index";
import { useAuthStore, useCourseStore } from "@/shared/stores";
let root: Root, host: HTMLDivElement, client: QueryClient;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => (resolve = ok));
  return { promise, resolve };
};
async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client },
      <CoursesScreen showFavoritesUI />)),
  );
  await flush();
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (el) => el.getAttribute("aria-label") === label,
  );
  expect(button, `missing ${label}`).toBeTruthy();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  m.native = { owner: "A", epoch: "E1" };
  m.pendingPost = null;
  m.failPost = false;
  m.malformedPost = false;
  m.calls = [];
  m.remoteFavorites = { A: [], B: [] };
  m.getFavorites.mockImplementation(async () => ({
    success: true,
    data: { favoriteIds: [...(m.remoteFavorites[m.native.owner as "A" | "B"] ?? [])], data: [] },
  }));
  m.catalog.mockImplementation(async () => ({ success: true, data: [oneCourse()] }));
  m.post.mockImplementation(
    async (id: string, action: string, guard?: () => boolean, skipReplay?: boolean) => {
      const owner = useAuthStore.getState().user?.id ?? "guest";
      m.calls.push({ owner, method: "POST", id, action, guard: guard?.(), skipReplay });
      if (m.pendingPost) return m.pendingPost;
      if (m.failPost) return { success: false, error: "PRIVATE_POST_ERROR" };
      if (!m.malformedPost && (owner === "A" || owner === "B")) {
        const ids = m.remoteFavorites[owner];
        m.remoteFavorites[owner] =
          action === "add" ? [...new Set([...ids, id])] : ids.filter((x) => x !== id);
      }
      return {
        success: true,
        data: { isFavorite: m.malformedPost ? !(action === "add") : action === "add" },
      };
    },
  );
  useAuthStore.setState({
    user: { id: "A", username: "owner", phone: null, email: "a@example.test", role: "USER" },
    isAuthenticated: true,
    isLoading: false,
  });
  useCourseStore.setState({ favorites: [] });
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
describe("AG3 V106 actual CoursesScreen catalog favorite user action", () => {
  it("user sees the existing course and can open it", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Открыть курс «Курс A»");
    expect(m.nav).toHaveBeenCalledWith("/training/public-dog");
  });
  it("user can actually add a catalog course to Favorites before navigating", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Добавить в избранное: Курс A");
    await vi.waitFor(() => expect(useCourseStore.getState().favorites).toEqual(["c1"]));
    expect(m.calls).toEqual([
      { owner: "A", method: "POST", id: "c1", action: "add", guard: true, skipReplay: true },
    ]);
  });

  it("confirmed add shows saved button and exact confirm remove restores unsaved", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Добавить в избранное: Курс A");
    await vi.waitFor(() => expect(useCourseStore.getState().favorites).toEqual(["c1"]));
    await vi.waitFor(() =>
      expect(host.querySelector('[aria-label="Убрать из избранного: Курс A"]')).not.toBeNull(),
    );
    await click("Убрать из избранного: Курс A");
    await vi.waitFor(() => expect(useCourseStore.getState().favorites).toEqual([]));
    expect(m.calls.map((c) => c.action)).toEqual(["add", "remove"]);
    expect(m.remoteFavorites.A).toEqual([]);
  });
  it("rapid doubletap pending add dispatches one POST and waits for positive ACK", async () => {
    const pending = deferred<{ success: boolean; data: { isFavorite: boolean } }>();
    m.pendingPost = pending.promise;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    const button = host.querySelector('[aria-label="Добавить в избранное: Курс A"]');
    expect(button).not.toBeNull();
    await act(async () => {
      (button as HTMLButtonElement)?.click();
      (button as HTMLButtonElement)?.click();
    });
    expect(m.calls).toHaveLength(1);
    expect(useCourseStore.getState().favorites).toEqual([]);
    await act(async () => pending.resolve({ success: true, data: { isFavorite: true } }));
    await vi.waitFor(() => expect(useCourseStore.getState().favorites).toEqual(["c1"]));
  });
  it("unknown server add outcome preserves unsaved UI, quarantines second POST until real GET readback", async () => {
    m.failPost = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Добавить в избранное: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить избранное"));
    expect(useCourseStore.getState().favorites).toEqual([]);
    const button = host.querySelector(
      '[aria-label="Добавить в избранное: Курс A"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_POST_ERROR");
    m.failPost = false;
    await click("Обновить каталог");
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    await click("Добавить в избранное: Курс A");
    await vi.waitFor(() => expect(useCourseStore.getState().favorites).toEqual(["c1"]));
    expect(m.calls).toHaveLength(2);
    expect(m.getFavorites).toHaveBeenCalledTimes(1);
  });
  it("malformed positive add ACK cannot flip UI or allow repeated write", async () => {
    m.malformedPost = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Добавить в избранное: Курс A");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить избранное"));
    expect(useCourseStore.getState().favorites).toEqual([]);
    expect(
      (host.querySelector('[aria-label="Добавить в избранное: Курс A"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(m.calls).toHaveLength(1);
  });
  it("logged-out user sees catalog but add action cannot POST", async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    const button = host.querySelector(
      '[aria-label="Добавить в избранное: Курс A"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(m.calls).toHaveLength(0);
  });
  it("late A add ACK after A to B actor switch never mutates B store or B UI", async () => {
    const pending = deferred<{ success: boolean; data: { isFavorite: boolean } }>();
    m.pendingPost = pending.promise;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    await click("Добавить в избранное: Курс A");
    expect(m.calls).toHaveLength(1);
    m.native = { owner: "B", epoch: "B1" };
    useAuthStore.setState({
      user: { id: "B", username: "beta", phone: null, email: "b@example.test", role: "USER" },
      isAuthenticated: true,
      isLoading: false,
    });
    useCourseStore.setState({ favorites: [] });
    await mount();
    await act(async () => pending.resolve({ success: true, data: { isFavorite: true } }));
    await flush();
    expect(useCourseStore.getState().favorites).toEqual([]);
    expect(host.querySelector('[aria-label="Добавить в избранное: Курс A"]')).not.toBeNull();
    expect(m.calls).toHaveLength(1);
  });
});

describe("GAFUS hidden favorite catalog action", () => {
  it("actual mobile courses tab never offers bookmark action or favorite mutation", async () => {
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(RealCoursesScreen))),
    );
    await flush();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс A"));
    expect(host.querySelector('[aria-label="Добавить в избранное: Курс A"]')).toBeNull();
    expect(host.querySelector('[aria-label="Убрать из избранного: Курс A"]')).toBeNull();
    expect(m.calls.filter(call => call.method === "POST")).toHaveLength(0);
  });
});
