// @vitest-environment jsdom
import { act, createElement, forwardRef, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  api: vi.fn(),
  deletePet: vi.fn(),
  // Only the combined source-mounted journey opts into the actual child.
  realWeight: false,
  weightGet: vi.fn(),
  weightAdd: vi.fn(),
  weightTarget: vi.fn(),
  weightRemove: vi.fn(),
  successHaptic: vi.fn(),
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
    delete: (...args: unknown[]) => m.deletePet(...args),
    getPreventionEntries: () => Promise.resolve({ success: true, data: [] }),
    getDocuments: () => Promise.resolve({ success: true, data: [] }),
  },
  petWeightApi: {
    get: (...args: unknown[]) => m.weightGet(...args),
    add: (...args: unknown[]) => m.weightAdd(...args),
    setTarget: (...args: unknown[]) => m.weightTarget(...args),
    remove: (...args: unknown[]) => m.weightRemove(...args),
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
vi.mock("@/features/pets/PetWeightSection", async () => {
  const R = await import("react");
  const actual = await vi.importActual<{
    PetWeightSection: ComponentType<{ petId: string }>;
  }>("./PetWeightSection");
  return {
    PetWeightSection: ({ petId }: { petId: string }) =>
      m.realWeight ? R.createElement(actual.PetWeightSection, { petId }) : null,
  };
});
vi.mock("@/features/pets/PetVetVisits", () => ({ PetVetVisitShortcut: () => null }));
vi.mock("@/features/pets/PetDocumentsList", () => ({ PetDocumentsList: () => null }));
vi.mock("@/features/pets/PendingPreventionNotice", () => ({ PendingPreventionNotice: () => null }));
vi.mock("@/features/pets/PendingPreventionReadStatus", () => ({
  PendingPreventionReadStatus: () => null,
}));
vi.mock("@/features/pets/usePreventionOfflineSave", () => ({
  // Expanded pet renders the existing offline section; the deletion suite must
  // never initialize, replay or persist a native prevention queue.
  usePreventionOfflineSave: () => ({
    localPending: [], pendingReadStatus: "READY", isSaving: false,
    refreshPending: async () => undefined, save: vi.fn(),
    activate: vi.fn(), deactivate: vi.fn(),
  }),
}));
vi.mock("@/shared/hooks/useNetworkStatus", () => ({ useIsOffline: () => false }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: (...args: unknown[]) => m.successHaptic(...args),
    medium: vi.fn(), light: vi.fn() },
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
    TextInput: ({
      value, placeholder, onChangeText,
    }: {
      value?: string; placeholder?: string; onChangeText?: (value: string) => void;
    }) => R.createElement("input", {
      value: value ?? "", placeholder,
      onInput: (event: { currentTarget: { value: string } }) =>
        onChangeText?.(event.currentTarget.value),
    }),
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
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
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
vi.mock("@/shared/components/ui/Button", async () => {
  const R = await import("react");
  return {
    Button: ({
      label, onPress, disabled,
    }: {
      label: string; onPress?: () => void; disabled?: boolean;
    }) => R.createElement("button", { onClick: onPress, disabled }, label),
  };
});
vi.mock("react-native-svg", async () => {
  const R = await import("react");
  const Svg = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("svg", null, children);
  const Line = (props: Record<string, unknown>) => R.createElement("line", props);
  const Circle = (props: Record<string, unknown>) => R.createElement("circle", props);
  const Polyline = (props: Record<string, unknown>) => R.createElement("polyline", props);
  const Text = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("text", null, children);
  return { default: Svg, Line, Circle, Polyline, Text };
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
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";
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
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(PetsTab))),
  );
}
async function resume(times = 1) {
  await act(async () => {
    for (let i = 0; i < times; i++) m.focus?.();
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.focus = null;
  m.api.mockReset().mockResolvedValue(data([pet()]));
  m.deletePet.mockReset().mockResolvedValue({ success: true });
  m.realWeight = false;
  m.weightGet.mockReset();
  m.weightAdd.mockReset();
  m.weightTarget.mockReset();
  m.weightRemove.mockReset();
  m.successHaptic.mockReset();
  m.track.mockReset();
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
describe("V93 actual PetsTab GET list / owner epoch read-only", () => {
  it("guest issues zero GET and cannot display cached private pet", async () => {
    m.authed = false;
    client.setQueryData(petsQueryOptions.queryKey, { success: true, data: [pet()] });
    await mount();
    expect(m.api).not.toHaveBeenCalled();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(host.textContent).not.toContain("Бим");
  });
  it("initial pending GET shows loading, not empty or private data", async () => {
    const gate = deferred<ReturnType<typeof data>>();
    m.api.mockReturnValueOnce(gate.promise);
    await mount();
    expect(host.textContent).toContain("Загружаем питомцев");
    expect(host.textContent).not.toContain("Питомцы пока не добавлены");
    await act(async () => gate.resolve(data([pet()])));
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
  });
  it("own DOG CAT records display from server and use only one list GET on initial focus", async () => {
    m.api.mockResolvedValueOnce(data([pet(), pet({ id: "cat-2", name: "Мурка", type: "CAT" })]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
    await vi.waitFor(() => expect(host.textContent).toContain("Мурка"));
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("true empty success displays empty state and no error", async () => {
    m.api.mockResolvedValueOnce(data([]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Питомцы пока не добавлены"));
    expect(host.textContent).not.toContain("Не удалось загрузить список питомцев");
  });
  it.each(["UNAUTHORIZED", "RATE_LIMITED", "INTERNAL_SERVER_ERROR"])(
    "%s read failure shows error+manual retry, never false empty",
    async (code) => {
      m.api.mockResolvedValueOnce({ success: false, code }).mockResolvedValueOnce(data([pet()]));
      await mount();
      await vi.waitFor(() =>
        expect(host.textContent).toContain("Не удалось загрузить список питомцев"),
      );
      expect(host.textContent).not.toContain("Питомцы пока не добавлены");
      const button = host.querySelector<HTMLButtonElement>(
        '[aria-label="Повторить загрузку питомцев"]',
      );
      expect(button).not.toBeNull();
      await act(async () => {
        button?.click();
        button?.click();
      });
      await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
      expect(m.api).toHaveBeenCalledTimes(2);
    },
  );
  it("malformed or foreign owner success response never paints pet or empty", async () => {
    m.api.mockResolvedValueOnce(data([pet({ ownerId: "B", name: "PRIVATE_FOREIGN" })]));
    await mount();
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Не удалось загрузить список питомцев"),
    );
    expect(host.textContent).not.toContain("PRIVATE_FOREIGN");
    expect(host.textContent).not.toContain("Питомцы пока не добавлены");
  });
  it("refocus while old GET in flight does not issue second GET, but after ACK fresh GET clears unread", async () => {
    const gate = deferred<ReturnType<typeof data>>();
    m.api.mockReturnValueOnce(gate.promise).mockResolvedValueOnce(data([]));
    await mount();
    await resume(3);
    expect(m.api).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve(data([pet()])));
    await resume();
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.textContent).toContain("Питомцы пока не добавлены"));
  });
  it("A→B→A epoch rotation drops delayed A private reply and forbids old cached snapshot", async () => {
    const gate = deferred<ReturnType<typeof data>>();
    m.api.mockReturnValueOnce(gate.promise);
    await mount();
    m.owner = "B";
    m.epoch = "B1";
    m.api.mockResolvedValue(data([pet({ id: "B-pet", ownerId: "B", name: "Б-питомец" })]));
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    m.api.mockResolvedValue(data([pet({ name: "А-новый" })]));
    await mount();
    await act(async () => gate.resolve(data([pet({ name: "PRIVATE_A_E1" })])));
    await vi.waitFor(() => expect(host.textContent).toContain("А-новый"));
    expect(host.textContent).not.toContain("PRIVATE_A_E1");
  });
  it("unmount pending GET does not paint or schedule a second GET", async () => {
    const gate = deferred<ReturnType<typeof data>>();
    m.api.mockReturnValueOnce(gate.promise);
    await mount();
    await act(async () => root.unmount());
    await act(async () => gate.resolve(data([pet({ name: "PRIVATE_UNMOUNT" })])));
    expect(host.textContent).not.toContain("PRIVATE_UNMOUNT");
    expect(m.api).toHaveBeenCalledTimes(1);
    root = createRoot(host);
  });
});


describe("MOBILE_PETS_DELETE_ACK_GUARD_20261024 mounted existing PetsTab", () => {
  async function openConfirmation() {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
    const expand = host.querySelector<HTMLButtonElement>(
      '[aria-label="Подробнее о питомце Бим"]',
    );
    expect(expand).not.toBeNull();
    await act(async () => expand?.click());
    const remove = host.querySelector<HTMLButtonElement>('[aria-label="Удалить питомца"]');
    expect(remove).not.toBeNull();
    await act(async () => remove?.click());
    const confirmation = m.alert.mock.calls.find(([title]) => title === "Удалить питомца");
    expect(confirmation).toBeDefined();
    const buttons = confirmation![2] as { text: string; onPress?: () => void }[];
    const confirm = buttons.find((b) => b.text === "Удалить")?.onPress;
    expect(confirm).toBeDefined();
    return { confirm: confirm!, cancel: buttons.find((b) => b.text === "Отмена")?.onPress };
  }
  it("requires explicit destructive confirmation, cancel or mere dialog never issues DELETE", async () => {
    const { cancel } = await openConfirmation();
    expect(m.deletePet).not.toHaveBeenCalled();
    await act(async () => cancel?.());
    expect(m.deletePet).not.toHaveBeenCalled();
    expect(m.successHaptic).not.toHaveBeenCalled();
  });
  it("resolved 403 ApiResponse is NOT successful deletion and never exposes server error", async () => {
    m.deletePet.mockResolvedValue({ success: false, code: "FORBIDDEN", error: "PRIVATE_SESSION_TOKEN" });
    const { confirm } = await openConfirmation();
    const invalidated = vi.spyOn(client, "invalidateQueries");
    await act(async () => confirm());
    await vi.waitFor(() => expect(m.deletePet).toHaveBeenCalledWith("pet-A"));
    await vi.waitFor(() => expect(m.track).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: "pet-delete-fail" }),
    ));
    expect(m.track).not.toHaveBeenCalledWith(expect.objectContaining({
      elementId: "pet-delete-success",
    }));
    expect(m.successHaptic).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.some(([title]) => title === "Ошибка")).toBe(true);
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("PRIVATE_SESSION_TOKEN");
  });
  it("real success=true ACK invalidates owner list exactly once", async () => {
    const { confirm } = await openConfirmation();
    const invalidated = vi.spyOn(client, "invalidateQueries");
    await act(async () => confirm());
    await vi.waitFor(() => expect(m.deletePet).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(m.successHaptic).toHaveBeenCalledTimes(1));
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ["pets"] });
    expect(m.track).toHaveBeenCalledWith(expect.objectContaining({
      elementId: "pet-delete-success",
    }));
    expect(m.alert.mock.calls.some(([title]) => title === "Ошибка")).toBe(false);
  });
  it("double confirmed destructive callback while pending dispatches a single DELETE", async () => {
    const pending = deferred<{ success: boolean }>();
    m.deletePet.mockReturnValueOnce(pending.promise);
    const { confirm } = await openConfirmation();
    await act(async () => { confirm(); confirm(); });
    expect(m.deletePet).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ success: true }));
    await vi.waitFor(() => expect(m.successHaptic).toHaveBeenCalledTimes(1));
  });
  it("retired session before alert confirmation never executes old principal DELETE", async () => {
    const { confirm } = await openConfirmation();
    m.owner = "B";
    m.epoch = "E2";
    await act(async () => root.render(
      createElement(QueryClientProvider, { client }, createElement(PetsTab)),
    ));
    await act(async () => confirm());
    expect(m.deletePet).not.toHaveBeenCalled();
    expect(m.successHaptic).not.toHaveBeenCalled();
  });
  it("old deletion ACK after A→B→A epoch rotation never signals success or invalidates new owner", async () => {
    const pending = deferred<{ success: boolean }>();
    m.deletePet.mockReturnValueOnce(pending.promise);
    const { confirm } = await openConfirmation();
    await act(async () => confirm());
    await vi.waitFor(() => expect(m.deletePet).toHaveBeenCalledTimes(1));
    m.owner = "B";
    m.epoch = "B1";
    await act(async () => root.render(
      createElement(QueryClientProvider, { client }, createElement(PetsTab)),
    ));
    m.owner = "A";
    m.epoch = "E2";
    await act(async () => root.render(
      createElement(QueryClientProvider, { client }, createElement(PetsTab)),
    ));
    const invalidated = vi.spyOn(client, "invalidateQueries");
    await act(async () => pending.resolve({ success: true }));
    expect(m.successHaptic).not.toHaveBeenCalled();
    expect(m.track).not.toHaveBeenCalledWith(expect.objectContaining({ elementId: "pet-delete-success" }));
    expect(invalidated).not.toHaveBeenCalled();
  });
  it("transport lost ACK never leaks thrown raw owner error or claims successful removal", async () => {
    m.deletePet.mockRejectedValueOnce(new Error("PRIVATE_DELETE_DB_PASSWORD"));
    const { confirm } = await openConfirmation();
    await act(async () => confirm());
    await vi.waitFor(() => expect(m.alert.mock.calls.some(([title]) => title === "Ошибка")).toBe(true));
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("PRIVATE_DELETE_DB_PASSWORD");
    expect(m.successHaptic).not.toHaveBeenCalled();
  });
});


describe("USER020 real original PetsTab card + actual PetWeightSection combined mounted journey", () => {
  const row = (id: string, weightKg: number) => ({
    id, petId: "pet-A", ownerId: "A", weightKg,
    measuredAt: "2026-10-22T12:00:00.000Z",
    createdAt: "2026-10-22T12:00:00.000Z",
  });
  const weightResponse = (rows: ReturnType<typeof row>[], targetWeightKg: number | null) => ({
    success: true,
    data: { currentWeightKg: rows.at(-1)?.weightKg ?? null, targetWeightKg, entries: rows },
  });
  async function press(label: string) {
    const button = Array.from(host.querySelectorAll("button")).find(
      node => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
  }
  async function enter(placeholder: string, value: string) {
    const input = Array.from(host.querySelectorAll("input")).find(
      node => node.getAttribute("placeholder") === placeholder,
    );
    expect(input).toBeDefined();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function pressWeightSave(placeholder: string, label: string) {
    // The expanded pet has unrelated procedure/document Save buttons.
    // Limit the click to the actual weight/goal form containing this input.
    const input = host.querySelector<HTMLInputElement>(
      `input[placeholder="${placeholder}"]`,
    );
    expect(input).not.toBeNull();
    const target = Array.from(input?.parentElement?.querySelectorAll("button") ?? [])
      .find(node => node.textContent?.trim() === label);
    expect(target).toBeDefined();
    await act(async () => target?.click());
  }
  it("own list → expand actual history → POST ACK → owner GET → target set/clear → collapse/reopen GET", async () => {
    m.realWeight = true;
    const rows = [row("w-before", 13.4)];
    let targetWeightKg: number | null = null;
    // This source-mounted transport is mocked: supply a syntactically valid
    // *selected* token hint to exercise the real negative-only native fence.
    // The real Hono/JWT verifier is covered by the separate V99 integration.
    const tokenFor = (sub: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.fixture`;
    m.weightGet.mockImplementation(async (petId: string,
      guard: (selectedAccessToken?: string | null) => boolean) => {
      expect(petId).toBe("pet-A");
      expect(guard(tokenFor("A"))).toBe(true);
      expect(guard(tokenFor("B"))).toBe(false);
      return weightResponse([...rows], targetWeightKg);
    });
    m.weightAdd.mockImplementation(async (petId: string, kg: number) => {
      expect(petId).toBe("pet-A");
      rows.push(row("w-added", kg));
      return { success: true, data: rows.at(-1) };
    });
    m.weightTarget.mockImplementation(async (petId: string, kg: number | null) => {
      expect(petId).toBe("pet-A");
      targetWeightKg = kg;
      return { success: true };
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
    expect(m.weightGet).not.toHaveBeenCalled();
    await press("Подробнее о питомце Бим");
    await vi.waitFor(() => expect(m.weightGet).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await press("Записать вес");
    await enter("Например, 24,3", "14,6");
    await pressWeightSave("Например, 24,3", "Сохранить");
    await vi.waitFor(() => expect(m.weightAdd).toHaveBeenCalledTimes(1));
    expect(m.weightAdd.mock.calls[0][0]).toBe("pet-A");
    expect(m.weightAdd.mock.calls[0][1]).toBe(14.6);
    await vi.waitFor(() => expect(m.weightGet).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.textContent).toContain("14,6 кг"));
    await press("Цель");
    await enter("Оставьте пустым, чтобы убрать цель", "12");
    await pressWeightSave("Оставьте пустым, чтобы убрать цель", "Сохранить цель");
    await vi.waitFor(() => expect(m.weightTarget).toHaveBeenCalledWith("pet-A", 12, expect.any(Function)));
    await vi.waitFor(() => expect(host.textContent).toContain("До цели"));
    await press("Цель");
    await enter("Оставьте пустым, чтобы убрать цель", "");
    await pressWeightSave("Оставьте пустым, чтобы убрать цель", "Сохранить цель");
    await vi.waitFor(() => expect(m.weightTarget).toHaveBeenCalledWith("pet-A", null, expect.any(Function)));
    await vi.waitFor(() => expect(m.weightGet).toHaveBeenCalledTimes(4));
    expect(host.textContent).not.toContain("До цели");
    await press("Свернуть карточку питомца Бим");
    expect(host.textContent).not.toContain("Измерения");
    await press("Подробнее о питомце Бим");
    await vi.waitFor(() => expect(m.weightGet).toHaveBeenCalledTimes(5));
    await vi.waitFor(() => expect(host.textContent).toContain("14,6 кг"));
    expect(m.weightAdd).toHaveBeenCalledTimes(1);
    expect(m.weightTarget).toHaveBeenCalledTimes(2);
    expect(m.weightRemove).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
  });
  it("known POST rejection enables correction; unknown write does not repeat and collapse/reopen manually reconciles GET", async () => {
    m.realWeight = true;
    const rows = [row("w-before", 13.4)];
    m.weightGet.mockImplementation(async () => weightResponse([...rows], null));
    m.weightAdd.mockResolvedValueOnce({
      success: false, code: "INVALID_VALUE", error: "PRIVATE_OTHER_ACTOR_DB",
    }).mockImplementationOnce(async (_petId: string, kg: number) => {
      // Model lost ACK after isolated server accepted write, not a real POST.
      rows.push(row("w-unknown", kg));
      throw new Error("PRIVATE_TRANSPORT_SECRET");
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
    await press("Подробнее о питомце Бим");
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await press("Записать вес");
    await enter("Например, 24,3", "14");
    await pressWeightSave("Например, 24,3", "Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось сохранить данные"));
    expect(host.textContent).not.toContain("PRIVATE_");
    expect(m.weightAdd).toHaveBeenCalledTimes(1);
    expect(m.weightGet).toHaveBeenCalledTimes(1);
    await enter("Например, 24,3", "15,2");
    await pressWeightSave("Например, 24,3", "Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить сохранение"));
    expect(m.weightAdd).toHaveBeenCalledTimes(2);
    expect(m.weightGet).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("PRIVATE_");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_");
    await press("Свернуть карточку питомца Бим");
    await press("Подробнее о питомце Бим");
    await vi.waitFor(() => expect(m.weightGet).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.textContent).toContain("15,2 кг"));
    expect(m.weightAdd).toHaveBeenCalledTimes(2);
    expect(m.weightRemove).not.toHaveBeenCalled();
  });
});
