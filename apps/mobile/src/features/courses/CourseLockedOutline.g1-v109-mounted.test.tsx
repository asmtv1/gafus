// @vitest-environment jsdom
/** Locked course day outline: genuine read-only UI, no SDK/HTTP/offline writes. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
  courseType: "basic",
  loading: false,
  denied: false,
  denialCode: "FORBIDDEN",
  failed: false,
  days: [
    {
      id: "day1",
      dayOnCourseId: "day-on-course-1",
      title: "Первый день",
      type: "regular",
      order: 1,
      estimatedDuration: 15,
      theoryMinutes: 3,
      equipment: "поводок",
      isLocked: false,
      userStatus: "NOT_STARTED",
      completedAt: null,
    },
  ],
  getAll: vi.fn(),
  authed: false,
  authLoading: false,
  owner: "A",
  epoch: "E1",
  trace: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => m.push(...args),
    back: () => m.back(),
    replace: (...args: unknown[]) => m.replace(...args),
  }),
  useLocalSearchParams: () => ({ courseType: m.courseType }),
  Stack: { Screen: () => null },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const View = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View,
    KeyboardAvoidingView: View,
    ScrollView: View,
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
      style,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
      style?: unknown | ((state: { pressed: boolean }) => unknown);
    }) =>
      R.createElement(
        "button",
        {
          onClick: onPress,
          disabled,
          "aria-label": accessibilityLabel,
          "data-card-style": JSON.stringify(
            typeof style === "function" ? style({ pressed: false }) : style,
          ),
        },
        children,
      ),
    RefreshControl: () => null,
    StyleSheet: { create: (v: unknown) => v },
    Platform: { OS: "android" },
    Share: { share: vi.fn() },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  const View = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Surface: View,
    Snackbar: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? R.createElement("aside", null, children) : null,
  };
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("@gafus/core-client/utils", () => ({
  declineRussianName: () => ({
    genitive: "",
    dative: "",
    accusative: "",
    instrumental: "",
    prepositional: "",
  }),
}));
vi.mock("@gafus/core-client/utils/training", () => ({
  calculateDayStatus: () => "NOT_STARTED",
  getDayDisplayStatus: () => "NOT_STARTED",
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "olive",
    background: "white",
    cardBackground: "white",
    text: "black",
    textSecondary: "gray",
    error: "red",
    border: "gray",
    surface: "white",
  },
  SPACING: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  FONTS: { montserrat: "a", montserratBold: "b", impact: "c" },
}));
vi.mock("@/shared/lib/training/dayTypes", () => ({ DAY_TYPE_LABELS: { regular: "Обычный" } }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { light: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/shared/lib/utils/alerts", () => ({ showLockedDayAlert: vi.fn() }));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress, "aria-label": label }, label),
    Loading: ({ message }: { message: string }) => R.createElement("span", null, message),
    Input: () => null,
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("section", null, children),
    AppBackButton: ({ onPress, label }: { onPress: () => void; label?: string }) =>
      R.createElement("button", { onClick: onPress }, label ?? "Назад"),
  };
});
vi.mock("@/shared/lib/api", () => ({
  coursesApi: { savePersonalization: vi.fn() },
  trainingApi: {
    getPublicPaidCourseOutline: (...args: unknown[]) => m.getAll(...args),
  },
}));
vi.mock("@/shared/hooks", () => ({
  useTrainingDays: () => ({
    data: m.loading
      ? undefined
      : m.denied
        ? { success: false, code: m.denialCode, error: "Доступа нет" }
        : m.failed
          ? { success: false, error: "Ошибка сети" }
          : {
              success: true,
              data: {
                courseId: "c1",
                courseDescription: "Тренировки с собакой",
                courseEquipment: "поводок",
                courseTrainingLevel: "BEGINNER",
                courseVideoUrl: "",
                trainingDays: m.days,
              },
            },
    isLoading: m.loading,
    error: null,
    refetch: () => m.refetch(),
    isRefetching: false,
  }),
}));
vi.mock("@/shared/stores", () => {
  const auth = () => ({
    isAuthenticated: m.authed,
    isLoading: m.authLoading,
    user: m.authed ? { id: m.owner } : null,
  });
  return {
    useAuthStore: Object.assign(
      (selector: (state: ReturnType<typeof auth>) => unknown) => selector(auth()),
      { getState: auth },
    ),
    useStepStatesForCourse: () => ({}),
    useOfflineStore: (f: (v: unknown) => unknown) =>
      f({
        status: { status: "idle" },
        downloadQueue: [],
        downloaded: {},
        startDownload: vi.fn(),
        cancelDownload: vi.fn(),
        removeFromQueue: vi.fn(),
        removeDownload: vi.fn(),
      }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed && m.epoch
      ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/features/training", async () => {
  const R = await import("react");
  return {
    CourseDescription: ({ description }: { description: string }) =>
      R.createElement("p", null, description),
  };
});
vi.mock("@/features/app-subscription", () => ({
  openAppSubscriptionPaywall: vi.fn(),
  useAppSubscriptionStatus: () => ({
    data: { success: true, data: { hasActiveSubscription: false, planCode: null } },
    isLoading: false,
    isFetching: false,
  }),
}));
import TrainingDaysScreen from "../../../app/(main)/training/[courseType]/index";
let root: Root, host: HTMLDivElement;
async function mount() {
  await act(async () => root.render(createElement(TrainingDaysScreen)));
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const preview = (type: string, description: string) => ({
  courseId: "c1", courseType: type, name: "Обучение",
  description, equipment: "поводок", trainingLevel: "BEGINNER",
  outline: [{ id: "day-on-course-1", order: 1, title: description }],
});
const previewResponse = (type: string, description: string) => ({
  success: true, data: preview(type, description),
});
beforeEach(() => {
  vi.clearAllMocks();
  m.loading = false;
  m.denied = false;
  m.denialCode = "FORBIDDEN";
  m.failed = false;
  m.courseType = "basic";
  m.authed = false;
  m.authLoading = false;
  m.owner = "A";
  m.epoch = "E1";
  m.days = [
    {
      id: "day1",
      dayOnCourseId: "day-on-course-1",
      title: "Первый день",
      type: "regular",
      order: 1,
      estimatedDuration: 15,
      theoryMinutes: 3,
      equipment: "поводок",
      isLocked: false,
      userStatus: "NOT_STARTED",
      completedAt: null,
    },
  ];
  m.getAll.mockReset().mockResolvedValue(previewResponse("basic", "Первый день"));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V109 actual locked-course read-only outline", () => {
  it("403 preview orders days but does not navigate without verified public paid entitlement metadata", async () => {
    m.denied = true;
    m.getAll.mockResolvedValue({
      success: true,
      data: { ...preview("basic", "О курсе"), outline: [
        { id: "day-on-course-2", order: 2, title: "Второй день" },
        { id: "day-on-course-1", order: 1, title: "Первый день" },
      ] },
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Первый день"));
    expect(host.textContent).toContain("Второй день");
    expect(host.textContent).not.toContain("Доступно по подписке");
    expect(host.textContent!.indexOf("Первый день")).toBeLessThan(
      host.textContent!.indexOf("Второй день"),
    );
    const row = Array.from(host.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Первый день"),
    );
    expect(row, "Without verified paid public course and principal, navigation disabled").toBeDefined();
    expect(row?.disabled).toBe(true);
    expect(host.textContent).toContain("Войдите в аккаунт, чтобы просмотреть шаги");
    expect(m.push).not.toHaveBeenCalled();
  });

  it("public paid overview lets verified user open a day without displaying paywall", async () => {
    m.denied = true;
    m.authed = true;
    m.getAll.mockResolvedValueOnce(previewResponse("basic", "Первый день"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Первый день"));
    expect(host.textContent).not.toContain("Доступно по подписке");
    const dayButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Первый день. Открыть шаги"]',
    );
    expect(dayButton).not.toBeNull();
    expect(dayButton?.disabled).toBe(false);
    expect(m.push).not.toHaveBeenCalled();
    await act(async () => dayButton?.click());
    expect(m.push).toHaveBeenCalledWith("/training/basic/day-on-course-1");
  });

  it("renders each paid-course day as a standalone card with time and title like Web", async () => {
    m.denied = true;
    m.authed = true;
    m.getAll.mockResolvedValueOnce({
      success: true,
      data: {
        ...preview("basic", "О курсе"),
        outline: [
          {
            id: "day-2", order: 2, title: "День с теорией",
            type: "regular", equipment: "поводок",
            estimatedDuration: 0, theoryMinutes: 12,
          },
          {
            id: "day-1", order: 1, title: "Диагностика: почему собака тянет",
            type: "regular", equipment: "поводок и лакомство",
            estimatedDuration: 20, theoryMinutes: 5,
          },
        ],
      },
    });
    await mount();
    const first = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Диагностика: почему собака тянет. Открыть шаги"]',
    );
    const second = host.querySelector<HTMLButtonElement>(
      'button[aria-label="День с теорией. Открыть шаги"]',
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.disabled).toBe(false);
    expect(first?.textContent).toContain("Блок 01");
    expect(first?.textContent).toContain("Диагностика: почему собака тянет");
    expect(first?.textContent).toContain("Практика · 20 мин");
    expect(first?.textContent).toContain("Теория · 5 мин");
    expect(first?.textContent).toContain("Понадобится: поводок и лакомство");
    expect(first?.getAttribute("data-card-style")).toContain('"borderRadius":18');
    expect(second?.textContent).toContain("Блок 02");
    expect(second?.textContent).toContain("Теория · 12 мин");
    expect(second?.textContent).not.toContain("Практика ·");
    expect(host.textContent!.indexOf("Блок 01")).toBeLessThan(
      host.textContent!.indexOf("Блок 02"),
    );
    await act(async () => first?.click());
    expect(m.push).toHaveBeenCalledWith("/training/basic/day-1");
  });

  it("displays unknown duration instead of inventing minutes", async () => {
    m.denied = true;
    m.authed = true;
    await mount();
    const row = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Первый день. Открыть шаги"]',
    );
    expect(row?.textContent).toContain("Длительность не указана");
    expect(row?.textContent).not.toContain("0 мин");
  });

  it("public marketing outline loads while native auth binding is still pending", async () => {
    m.denied = true;
    m.authed = true;
    m.epoch = "";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Первый день"));
    expect(host.textContent).toContain("План занятий");
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Первый день. Недоступно"]',
    )?.disabled).toBe(true);
    expect(m.push).not.toHaveBeenCalled();
  });

  it("public outline rejects private/non-paid courses, even for a verified user", async () => {
    m.denied = true;
    m.authed = true;
    m.getAll.mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "Курс не найден" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курс не найден в каталоге"));
    expect(host.querySelector('button[aria-label*="Открыть шаги"]')).toBeNull();
    expect(m.push).not.toHaveBeenCalled();
  });

  it("402 subscription-required course shows days without triggering a paywall", async () => {
    m.denied = true;
    m.denialCode = "SUBSCRIPTION_REQUIRED";
    m.authed = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Первый день"));
    expect(host.textContent).toContain("План занятий");
    expect(host.textContent).not.toContain("Выберите тариф");
    expect(host.querySelector('button[aria-label="Первый день. Открыть шаги"]'))
      .not.toBeNull();
    expect(m.getAll).toHaveBeenCalledOnce();
  });

  it("rejected preview READ shows neutral error and retries the same metadata endpoint", async () => {
    m.denied = true;
    m.getAll
      .mockRejectedValueOnce(Error("PRIVATE_PREVIEW_NETWORK"))
      .mockResolvedValueOnce(previewResponse("basic", "Каталог после повтора"));
    await mount();
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Не удалось загрузить описание курса"),
    );
    expect(host.textContent).not.toContain("PRIVATE_PREVIEW_NETWORK");
    expect(host.textContent).not.toContain("Курс не найден в каталоге");
    const retry = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Повторить загрузку описания курса"]',
    );
    expect(retry).not.toBeNull();
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("Каталог после повтора"));
    expect(m.getAll).toHaveBeenCalledTimes(2);
    expect(m.trace.mock.calls.join(" ")).not.toContain("PRIVATE_PREVIEW_NETWORK");
    expect(m.replace).not.toHaveBeenCalled();
  });

  it("success false differs from successful missing course, without access grant", async () => {
    m.denied = true;
    m.getAll
      .mockResolvedValueOnce({ success: false, error: "PRIVATE_CATALOG_REASON" })
      .mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "Курс не найден" });
    await mount();
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Не удалось загрузить описание курса"),
    );
    expect(host.textContent).not.toContain("PRIVATE_CATALOG_REASON");
    const retry = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Повторить загрузку описания курса"]',
    );
    await act(async () => retry?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Курс не найден в каталоге"));
    expect(host.textContent).not.toContain("Не удалось загрузить описание курса");
    expect(m.getAll).toHaveBeenCalledTimes(2);
    expect(m.replace).not.toHaveBeenCalled();
  });

  it("switching course prevents old preview and starts current guarded READ", async () => {
    m.denied = true;
    const old = deferred<ReturnType<typeof previewResponse>>();
    m.getAll
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(previewResponse("advanced", "Сведения нового курса"));
    await mount();
    const oldGuard = m.getAll.mock.calls[0]?.[1] as (() => boolean) | undefined;
    expect(typeof oldGuard).toBe("function");
    expect(oldGuard?.()).toBe(true);
    m.courseType = "advanced";
    await mount();
    expect(oldGuard?.()).toBe(false);
    await vi.waitFor(() => expect(host.textContent).toContain("Сведения нового курса"));
    await act(async () => old.resolve(previewResponse("basic", "СТАРОЕ ОПИСАНИЕ")));
    expect(host.textContent).not.toContain("СТАРОЕ ОПИСАНИЕ");
    expect(m.getAll).toHaveBeenCalledTimes(2);
  });

  it("A to B to A actor epochs isolate preview and stale response", async () => {
    m.denied = true;
    m.authed = true;
    const old = deferred<ReturnType<typeof previewResponse>>();
    m.getAll
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(previewResponse("basic", "Актуальное описание B"))
      .mockResolvedValueOnce(previewResponse("basic", "Актуальное описание A2"));
    await mount();
    const oldGuard = m.getAll.mock.calls[0]?.[1] as (() => boolean) | undefined;
    expect(oldGuard?.()).toBe(true);
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    expect(oldGuard?.()).toBe(false);
    await vi.waitFor(() => expect(host.textContent).toContain("Актуальное описание A2"));
    await act(async () => old.resolve(previewResponse("basic", "СТАРЫЙ АКТЁР")));
    expect(host.textContent).not.toContain("СТАРЫЙ АКТЁР");
    expect(m.getAll).toHaveBeenCalledTimes(3);
  });

  it("unmount invalidates preview guard, deferred metadata never publishes", async () => {
    m.denied = true;
    const old = deferred<ReturnType<typeof previewResponse>>();
    m.getAll.mockReturnValueOnce(old.promise);
    await mount();
    const guard = m.getAll.mock.calls[0]?.[1] as (() => boolean) | undefined;
    expect(guard?.()).toBe(true);
    await act(async () => root.unmount());
    expect(guard?.()).toBe(false);
    await act(async () => old.resolve(previewResponse("basic", "ЗАПОЗДАЛЫЙ ОТВЕТ")));
    expect(host.textContent).not.toContain("ЗАПОЗДАЛЫЙ ОТВЕТ");
    root = createRoot(host);
  });
});
