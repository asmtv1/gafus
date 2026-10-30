// @vitest-environment jsdom
import { act, createElement, forwardRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  api: vi.fn(),
  focus: null as null | (() => void),
  alert: vi.fn(),
  push: vi.fn(),
  trace: vi.fn(),
  queryApi: vi.fn(),
  track: vi.fn(),
  tour: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => {
  const state = () => ({
    isAuthenticated: m.authed,
    isLoading: false,
    user: m.authed ? { id: m.owner } : null,
  });
  return {
    useAuthStore: Object.assign((s: (v: unknown) => unknown) => s(state()), { getState: state }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/api/pets", () => ({
  petsApi: {
    getAll: (...args: unknown[]) => m.api(...args),
    getPreventionEntries: () => Promise.resolve({ success: true, data: [] }),
    getDocuments: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock("@/shared/lib/api/notes", () => ({ notesApi: {} }));
vi.mock("@/shared/lib/api/subscriptions", () => ({ subscriptionsApi: {} }));
vi.mock("@/shared/lib/api/user", () => ({ userApi: {} }));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getCurrentDeviceTokens: vi.fn(),
  isSameVerifiedPushActor: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.trace(...a) }));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: vi.fn(), apiClientMultipart: vi.fn() }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#345", background: "#fff" },
  FONTS: { montserrat: "A", montserratMedium: "A" },
  SPACING: { md: 8, sm: 4 },
}));
vi.mock("@/features/onboarding-tour", () => ({
  useMobileOnboardingTourStore: (s: (v: unknown) => unknown) =>
    s({ isActive: false, currentStepId: null }),
}));
vi.mock("@/shared/lib/tour-targets", async () => {
  const R = await import("react");
  return {
    TourTarget: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    useTourTargets: () => ({ measureTarget: m.tour }),
  };
});
vi.mock("@/features/pets/PetProfileVisibility", async () => {
  const R = await import("react");
  return { PetProfileVisibility: () => R.createElement("span", null, "visibility-stub") };
});
vi.mock("@/features/pets/PetWeightSection", () => ({ PetWeightSection: () => null }));
vi.mock("@/features/pets/PetVetVisits", () => ({ PetVetVisitShortcut: () => null }));
vi.mock("@/features/pets/PetDocumentsList", () => ({ PetDocumentsList: () => null }));
vi.mock("@/features/pets/PendingPreventionNotice", () => ({ PendingPreventionNotice: () => null }));
vi.mock("@/features/pets/PendingPreventionReadStatus", () => ({
  PendingPreventionReadStatus: () => null,
}));
vi.mock("@/features/pets/usePreventionOfflineSave", () => ({
  usePreventionOfflineSave: () => ({
    localPending: [],
    pendingReadStatus: "READY",
    isSaving: false,
    activate: () => undefined,
    deactivate: () => undefined,
    refreshPending: async () => undefined,
    save: async () => false,
  }),
}));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => false }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: vi.fn(), medium: vi.fn(), light: vi.fn() },
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => m.track(...a) }));
vi.mock("expo-router", async () => {
  const R = await import("react");
  return {
    useRouter: () => ({ push: m.push }),
    useFocusEffect: (cb: () => void | (() => void)) =>
      R.useEffect(() => {
        m.focus = cb;
        const cleanup = cb();
        return () => {
          m.focus = null;
          if (typeof cleanup === "function") cleanup();
        };
      }, [cb]),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const ScrollView = forwardRef<HTMLDivElement, { children?: React.ReactNode }>((props, ref) =>
    R.createElement("div", { ref }, props.children),
  );
  return {
    Alert: { alert: m.alert },
    View: Box,
    ScrollView,
    KeyboardAvoidingView: Box,
    Modal: Box,
    TextInput: ({ value }: { value?: string }) =>
      R.createElement("input", { readOnly: true, value: value ?? "" }),
    Switch: ({ value }: { value?: boolean }) =>
      R.createElement("input", { type: "checkbox", checked: !!value, readOnly: true }),
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
    Share: { share: vi.fn() },
    InteractionManager: { runAfterInteractions: () => ({ cancel: vi.fn() }) },
    Platform: { OS: "ios" },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, absoluteFillObject: {} },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({
      children,
      numberOfLines,
      ...rest
    }: {
      children?: React.ReactNode;
      numberOfLines?: number;
    }) => R.createElement("span", { "data-number-of-lines": numberOfLines, ...rest }, children),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    PageHeader: ({ title }: { title: string }) => R.createElement("h1", null, title),
    Loading: () => R.createElement("span", null, "Загружаем питомцев…"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => R.createElement("button", { onClick: onPress, disabled, "aria-label": label }, label),
    Input: () => R.createElement("input", { readOnly: true }),
    Card: () => null,
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-linear-gradient", async () => {
  const R = await import("react");
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-file-system/legacy", () => ({}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pinch: () => ({
      onUpdate() {
        return this;
      },
      onEnd() {
        return this;
      },
    }),
    Pan: () => ({
      onUpdate() {
        return this;
      },
      onEnd() {
        return this;
      },
    }),
    Simultaneous: () => null,
  },
  GestureDetector: () => null,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: () => null },
  runOnJS: (fn: unknown) => fn,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));
vi.mock("react-native-webview", () => ({ default: () => null }));
import PetsTab from "../../../app/(main)/(tabs)/pets";
let root: Root, host: HTMLDivElement, client: QueryClient;
const pet = (overrides: Record<string, unknown> = {}) => ({
  id: "pet-A",
  ownerId: "A",
  name: "Бим",
  type: "DOG",
  breed: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
  photoUrl: null,
  showInProfile: true,
  notes: null,
  createdAt: "2026-10-21T12:00:00Z",
  ...overrides,
});
const data = (items: unknown[]) => ({ success: true, data: items });
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(PetsTab))),
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.focus = null;
  m.api.mockReset().mockResolvedValue(data([pet()]));
  m.alert.mockReset();
  m.trace.mockReset();
  m.push.mockReset();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe("AG3 V110 actual ordinary pet list -> expanded detail -> full notes -> collapse", () => {
  it("long ordinary owner note is fully readable in expanded card, without edit route or write", async () => {
    const fullNote =
      "Первый абзац о характере и обучении собаки. ".repeat(9) +
      "Последнее важное предложение заметки.";
    m.api.mockResolvedValueOnce(data([pet({ notes: fullNote, breed: "Корги", heightCm: 35 })]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
    expect(host.textContent).toContain("Корги");
    expect(host.textContent).not.toContain("Последнее важное предложение заметки.");
    const more = host.querySelector<HTMLButtonElement>('[aria-label="Подробнее о питомце Бим"]');
    expect(more).not.toBeNull();
    await act(async () => more?.click());
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Последнее важное предложение заметки."),
    );
    const note = Array.from(host.querySelectorAll("span")).find((el) =>
      el.textContent?.startsWith("Заметки: Первый абзац"),
    );
    expect(note, "expanded pet note should be present").toBeTruthy();
    expect(
      note?.getAttribute("data-number-of-lines"),
      "full notes must not be clamped to 2 lines",
    ).toBeNull();
    expect(host.textContent).toContain("35 см");
    expect(m.push).not.toHaveBeenCalled();
    const collapse = host.querySelector<HTMLButtonElement>(
      '[aria-label="Свернуть карточку питомца Бим"]',
    );
    expect(collapse).not.toBeNull();
    await act(async () => collapse?.click());
    expect(host.textContent).not.toContain("Последнее важное предложение заметки.");
    expect(m.push).not.toHaveBeenCalled();
    expect(m.api).toHaveBeenCalledTimes(1);
  });
});
