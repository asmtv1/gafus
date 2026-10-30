// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  courseType: "basics",
  loading: false,
  error: false,
  rows: [] as {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { id: string; username: string; profile: null };
  }[],
  keys: [] as unknown[][],
  options: [] as { queryKey: unknown[]; queryFn: () => Promise<unknown> }[],
  refetch: vi.fn(),
  getReviews: vi.fn(),
  trace: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  client: { invalidateQueries: (...v: unknown[]) => m.invalidate(...v) },
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: m.authLoading,
  });
  return {
    useAuthStore: Object.assign((f: (s: ReturnType<typeof state>) => unknown) => f(state()), {
      getState: state,
    }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/api/courses", () => ({
  coursesApi: {
    getReviews: (...v: unknown[]) => m.getReviews(...v),
    createReview: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => m.client,
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    m.options.push(options);
    m.keys.push(options.queryKey);
    return {
      data:
        m.loading || m.error
          ? undefined
          : {
              data: {
                courseName: "Базовый курс",
                reviews: m.rows,
                userStatus: { hasCompleted: false, userReview: null },
              },
            },
      isLoading: m.loading,
      isError: m.error,
      refetch: () => m.refetch(),
    };
  },
  useMutation: () => ({ isPending: false, mutate: (...v: unknown[]) => m.mutate(...v) }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: () => m.back() }),
  useLocalSearchParams: () => ({ courseType: m.courseType }),
  Stack: { Screen: () => null },
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "white",
    text: "black",
    textSecondary: "gray",
    primary: "olive",
    cardBackground: "white",
  },
  FONTS: { montserrat: "a", impact: "c" },
  SPACING: { md: 12, sm: 8, xs: 4 },
}));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { success: vi.fn() } }));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      R.createElement("button", { onClick: onPress }, "Назад"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: () => R.createElement("span", null, "Загрузка отзывов..."),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
      R.createElement("button", { "aria-label": label, onClick: onPress }, label),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children, accessible }: { children?: React.ReactNode; accessible?: boolean }) =>
      R.createElement("span", { "aria-hidden": accessible === false ? true : undefined }, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children, accessible, accessibilityRole, accessibilityLabel }: {
    children?: React.ReactNode; accessible?: boolean;
    accessibilityRole?: string; accessibilityLabel?: string;
  }) => R.createElement("div", {
    role: accessible ? accessibilityRole : undefined,
    "aria-label": accessible ? accessibilityLabel : undefined,
  }, children);
  return {
    View: Box,
    ScrollView: Box,
    StyleSheet: { create: (v: unknown) => v },
    Alert: { alert: (...v: unknown[]) => m.alert(...v) },
    Pressable: ({
      children, onPress, disabled, accessibilityRole, accessibilityLabel, accessibilityState,
    }: {
      children?: React.ReactNode; onPress?: () => void; disabled?: boolean;
      accessibilityRole?: string; accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    }) => R.createElement("button", {
      disabled, onClick: onPress, role: accessibilityRole,
      "aria-label": accessibilityLabel,
      "aria-checked": accessibilityState?.selected,
    }, children),
    TextInput: () => null,
  };
});
import ReviewsScreen from "../../../app/(main)/training/[courseType]/reviews";
let root: Root, host: HTMLDivElement;
const gate = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(ReviewsScreen)));
}
async function retry() {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку отзывов"]')
      ?.click(),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.authLoading = false;
  m.courseType = "basics";
  m.loading = false;
  m.error = false;
  m.rows = [];
  m.keys = [];
  m.options = [];
  m.refetch.mockResolvedValue(undefined);
  m.getReviews.mockResolvedValue({
    success: true,
    data: {
      courseName: "Базовый курс",
      reviews: [],
      userStatus: { hasCompleted: false, userReview: null },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V67 actual course reviews GET mounted", () => {
  it("guest reads public reviews using guest scope", async () => {
    m.authed = false;
    await render();
    expect(m.keys).toContainEqual(["course-reviews", "basics", "guest", "public"]);
    expect(host.textContent).toContain("Базовый курс");
    const guestRead = await m.options.at(-1)!.queryFn();
    expect(guestRead).toMatchObject({ success: true });
    const [type, guard] = m.getReviews.mock.calls.at(-1)!;
    expect(type).toBe("basics");
    expect(guard()).toBe(true);
    m.authed = true;
    m.owner = "B";
    m.epoch = "B1";
    expect(guard()).toBe(false);
  });
  it("authenticated but unverified actor does not issue private query", async () => {
    m.epoch = "";
    await render();
    expect(m.keys).toHaveLength(0);
    expect(host.textContent).toContain("Загрузка отзывов");
  });
  it("missing course parameter ends as not found", async () => {
    m.courseType = "";
    await render();
    expect(m.keys).toHaveLength(0);
    expect(host.textContent).toContain("Курс не найден");
  });
  it("A→B→A new epoch changes query key", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.keys.at(-1)).toEqual(["course-reviews", "basics", "A", "E2"]);
  });
  it("loading is not mistaken for empty reviews", async () => {
    m.loading = true;
    await render();
    expect(host.textContent).toContain("Загрузка отзывов");
    expect(host.textContent).not.toContain("Пока нет отзывов");
  });
  it("successful empty GET shows empty state", async () => {
    await render();
    expect(host.textContent).toContain("Пока нет отзывов");
  });
  it("failed GET is neutral and retry single-flight", async () => {
    m.error = true;
    const x = gate<void>();
    m.refetch.mockReturnValueOnce(x.promise);
    await render();
    expect(host.textContent).toContain("Не удалось загрузить отзывы");
    expect(host.textContent).not.toContain("Пока нет отзывов");
    await act(async () => {
      const b = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Повторить загрузку отзывов"]',
      );
      b?.click();
      b?.click();
    });
    expect(m.refetch).toHaveBeenCalledOnce();
    await act(async () => x.resolve(undefined));
    expect(host.textContent).not.toContain("Не удалось повторно загрузить отзывы");
  });
  it("active manual retry executes the same guarded queryFn", async () => {
    m.error = true;
    m.refetch.mockImplementationOnce(async () => ({
      isError: false,
      data: await m.options.at(-1)!.queryFn(),
    }));
    await render();
    await retry();
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(m.getReviews).toHaveBeenCalledExactlyOnceWith("basics", expect.any(Function));
    expect(m.getReviews.mock.calls[0][1]()).toBe(true);
    expect(host.textContent).not.toContain("Не удалось повторно загрузить отзывы");
  });

  it("stale actor cannot retry old private GET", async () => {
    m.error = true;
    await render();
    m.epoch = "E2";
    await retry();
    expect(m.refetch).not.toHaveBeenCalled();
  });
  it("rejected retry never logs raw backend error", async () => {
    m.error = true;
    m.refetch.mockRejectedValueOnce(Error("PRIVATE_STACK"));
    await render();
    await retry();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_STACK");
  });
  it("initial read passes verified scope guard and rejects stale-before-start request", async () => {
    await render();
    const read = m.options.at(-1)!.queryFn;
    const result = await read();
    expect(result).toMatchObject({ success: true });
    const [type, guard] = m.getReviews.mock.calls.at(-1)!;
    expect(type).toBe("basics");
    expect(typeof guard).toBe("function");
    expect(guard()).toBe(true);
    m.epoch = "E2";
    expect(guard()).toBe(false);
    m.getReviews.mockClear();
    await expect(read()).rejects.toThrow("COURSE_REVIEWS_READ_STALE");
    expect(m.getReviews).not.toHaveBeenCalled();
  });

  it("old deferred GET after A→B→A epoch change cannot publish a stale success", async () => {
    const old = gate<{ success: boolean; data: unknown }>();
    m.getReviews.mockReturnValueOnce(old.promise);
    await render();
    const oldRead = m.options
      .at(-1)!
      .queryFn()
      .catch((error: unknown) => error);
    expect(m.getReviews).toHaveBeenCalledOnce();
    const guard = m.getReviews.mock.calls[0][1] as () => boolean;
    expect(guard()).toBe(true);
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(guard()).toBe(false);
    await act(async () =>
      old.resolve({
        success: true,
        data: { courseName: "STALE_PRIVATE_GET", reviews: [], userStatus: null },
      }),
    );
    expect(await oldRead).toMatchObject({ message: "COURSE_REVIEWS_READ_STALE" });
    expect(host.textContent).not.toContain("STALE_PRIVATE_GET");
    expect(m.trace).not.toHaveBeenCalled();
  });

  it("old course and unmounted screen cannot start or publish READ result", async () => {
    await render();
    const oldRead = m.options.at(-1)!.queryFn;
    m.courseType = "advanced";
    await render();
    expect(m.keys.at(-1)).toEqual(["course-reviews", "advanced", "A", "E1"]);
    m.getReviews.mockClear();
    await expect(oldRead()).rejects.toThrow("COURSE_REVIEWS_READ_STALE");
    expect(m.getReviews).not.toHaveBeenCalled();
    const deferred = gate<{ success: boolean; data: unknown }>();
    m.getReviews.mockReturnValueOnce(deferred.promise);
    const currentRead = m.options
      .at(-1)!
      .queryFn()
      .catch((error: unknown) => error);
    await act(async () => root.unmount());
    const guard = m.getReviews.mock.calls[0][1] as () => boolean;
    expect(guard()).toBe(false);
    await act(async () =>
      deferred.resolve({
        success: true,
        data: { courseName: "UNMOUNTED_PRIVATE_GET", reviews: [], userStatus: null },
      }),
    );
    expect(await currentRead).toMatchObject({ message: "COURSE_REVIEWS_READ_STALE" });
    expect(m.trace).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it("resolved retry error shows neutral feedback and stale retry cannot affect new epoch", async () => {
    m.error = true;
    m.refetch.mockResolvedValueOnce({ isError: true, error: Error("PRIVATE_REFETCH_STACK") });
    await render();
    await retry();
    expect(host.textContent).toContain("Не удалось повторно загрузить отзывы");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_REFETCH_STACK");
    const later = gate<{ isError: boolean }>();
    m.refetch.mockReturnValueOnce(later.promise);
    await retry();
    m.epoch = "E2";
    await render();
    await act(async () => later.resolve({ isError: true }));
    expect(host.textContent).not.toContain("Не удалось повторно загрузить отзывы");
  });

  it("queryFn preserves exact existing API", async () => {
    await render();
    const res = await m.options.at(-1)?.queryFn();
    expect(m.getReviews).toHaveBeenCalledExactlyOnceWith("basics", expect.any(Function));
    expect(res).toMatchObject({ success: true });
  });
});


// ACCESSIBLE_COURSE_REVIEW_READONLY: public list is a single spoken rating.
describe("ACCESSIBLE_COURSE_REVIEW_READONLY guest rating announcement", () => {
  it("announces the saved rating once without five decorative disabled controls", async () => {
    m.authed = false;
    m.rows = [{
      id: "guest-review", rating: 4, comment: "Полезно",
      createdAt: "2026-10-20T10:00:00Z",
      user: { id: "review-author", username: "читатель", profile: null },
    }];
    await render();
    const rating = host.querySelector<HTMLElement>(
      '[role="text"][aria-label="Оценка 4 из 5"]',
    );
    expect(rating).not.toBeNull();
    expect(rating?.querySelectorAll<HTMLButtonElement>("button")).toHaveLength(0);
    expect(rating?.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).toHaveLength(5);
    expect(host.querySelectorAll('button[role="radio"]')).toHaveLength(0);
    expect(host.textContent).toContain("Полезно");
    expect(m.getReviews).not.toHaveBeenCalled();
  });
});
