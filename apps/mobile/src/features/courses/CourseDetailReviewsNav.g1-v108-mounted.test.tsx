// @vitest-environment jsdom
/** Existing mounted course→day/reviews navigation; no SDK/HTTP/offline writes. */
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
      R.createElement("button", { onClick: onPress }, label),
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
  trainingApi: { getPublicPaidCourseOutline: (...args: unknown[]) => m.getAll(...args) },
}));
vi.mock("@/shared/hooks", () => ({
  useTrainingDays: () => ({
    data: m.loading
      ? undefined
      : m.denied
        ? { success: false, code: "FORBIDDEN", error: "Доступа нет" }
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
  // Guest-only scope: keep the existing navigation scenario unauthenticated.
  const guest = () => ({ isAuthenticated: false, isLoading: false, user: null });
  return {
    useAuthStore: Object.assign(
      (selector: (state: ReturnType<typeof guest>) => unknown) => selector(guest()),
      { getState: guest },
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
// The screen now reads offline ownership as part of its locked-preview gate.
// This mounted navigation fixture has no native device or verified binding;
// avoid importing the real SecureStore-backed native queue in Node.
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => null },
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
async function click(label: string) {
  const btn = Array.from(host.querySelectorAll("button")).find(
    (x) => x.getAttribute("aria-label") === label || x.textContent?.includes(label),
  );
  expect(btn, `missing button ${label}`).toBeTruthy();
  await act(async () => btn?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.loading = false;
  m.denied = false;
  m.failed = false;
  m.courseType = "basic";
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
  m.getAll.mockResolvedValue({
    success: true,
    data: {
      courseId: "c1", courseType: "basic", name: "Обучение",
      description: "О курсе", equipment: "поводок", trainingLevel: "BEGINNER",
      outline: [{ id: "day-on-course-1", order: 1, title: "Первый день" }],
    },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V108 actual online course overview actions", () => {
  it("normal overview: day route already works and reviews route must be user-reachable", async () => {
    await mount();
    expect(host.textContent).toContain("Первый день");
    await click("Первый день");
    expect(m.push).toHaveBeenCalledWith("/training/basic/day-on-course-1");
    await click("Отзывы о курсе");
    expect(m.push).toHaveBeenCalledWith({
      pathname: "/training/[courseType]/reviews",
      params: { courseType: "basic" },
    });
  });
  it("denied course overview still allows public reviews without unlocking a day", async () => {
    m.denied = true;
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("План занятий"));
    await click("Отзывы о курсе");
    expect(m.push).toHaveBeenCalledWith({
      pathname: "/training/[courseType]/reviews",
      params: { courseType: "basic" },
    });
  });
});
