// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type ProfileComponent from "../../../app/(main)/(tabs)/profile";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  signedIn: true,
  permission: "undetermined",
  requestedPermission: "granted",
  token: "expo-A",
  remoteRegistered: false,
  save: vi.fn(),
  delete: vi.fn(),
  status: vi.fn(),
  permissionFetch: vi.fn(),
  permissionRequest: vi.fn(),
  expo: vi.fn(),
  trace: vi.fn(),
  reminders: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  reminderRows: [] as {
    id: string;
    name: string;
    enabled: boolean;
    reminderTime: string;
    reminderDays: string | null;
    timezone: string;
  }[],
  inputName: "Тренировка",
  snack: vi.fn(),
  alert: vi.fn(),
  userUpdated: vi.fn(),
  profileGet: vi.fn(),
  bindingOwner: null as string | null,
  storeUser: null as null | Record<string, unknown>,
  studentNotesRead: vi.fn(),
  trainerCoursesRead: vi.fn(),
  routerPush: vi.fn(),
  routerBack: vi.fn(),
  routerReplace: vi.fn(),
  editOpen: false,
  profilePut: vi.fn(),
  profileSaved: vi.fn(),
  studentNotesRows: [] as {
    id: string;
    title?: string | null;
    createdAt: string;
    trainer: { profile: { fullName: string | null } };
    entries: { id: string; content: string; createdAt: string }[];
  }[],
}));
function dom(tag: string, props: Record<string, unknown> = {}) {
  const { children, onPress, accessibilityLabel, ...rest } = props;
  return createElement(
    tag,
    {
      onClick: onPress,
      disabled: Boolean(rest.disabled),
      "aria-label": accessibilityLabel,
      "data-role": tag,
    },
    children as never,
  );
}
vi.mock("react-native", () => ({
  View: (p: Record<string, unknown>) => dom("div", p),
  SafeAreaView: (p: Record<string, unknown>) => dom("div", p),
  ScrollView: (p: Record<string, unknown>) => dom("div", p),
  Pressable: (p: Record<string, unknown>) => dom("button", p),
  TextInput: (p: Record<string, unknown>) =>
    m.editOpen
      ? createElement("input", {
          placeholder: p.placeholder as string | undefined,
          value: (p.value as string) ?? "",
          onInput: (event: { currentTarget: { value: string } }) =>
            (p.onChangeText as (v: string) => void)(event.currentTarget.value),
        })
      : dom("button", {
          children: "Название напоминания",
          onPress: () => (p.onChangeText as (v: string) => void)(m.inputName),
        }),
  KeyboardAvoidingView: (p: Record<string, unknown>) => dom("div", p),
  Modal: (p: Record<string, unknown>) => (p.visible ? dom("section", p) : null),
  Platform: { OS: "ios" },
  NativeModules: {},
  Alert: { alert: m.alert },
  Linking: { openSettings: vi.fn(), openURL: vi.fn() },
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("react-native-paper", () => ({
  Text: (p: Record<string, unknown>) => dom("span", p),
  Snackbar: (p: Record<string, unknown>) => (p.visible ? dom("aside", p) : null),
  Switch: (p: Record<string, unknown>) =>
    dom("button", {
      children: p.value ? "Включено" : "Выключено",
      onPress: () => (p.onValueChange as (v: boolean) => void)(!p.value),
      accessibilityLabel: "Переключить напоминание",
      disabled: p.disabled,
    }),
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
  FontAwesome5: () => null,
}));
vi.mock("expo-image", () => ({
  Image: (p: { source?: { uri?: string } }) =>
    createElement("div", { "data-image-uri": p.source?.uri ?? "" }),
}));
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: (p: Record<string, unknown>) => dom("div", p),
}));
vi.mock("expo-router", () => ({
  useSegments: () => ["(tabs)"],
  Redirect: () => null,
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: m.routerPush,
    back: m.routerBack,
    replace: m.routerReplace,
    canGoBack: () => true,
  }),
  useFocusEffect: (fn: () => void | (() => void)) => {
    useEffect(fn, [fn]);
  },
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { appOwnership: "standalone", expoConfig: { extra: { eas: { projectId: "test" } } } },
}));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: m.permissionFetch,
  requestPermissionsAsync: m.permissionRequest,
  getExpoPushTokenAsync: m.expo,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: m.trace,
  reportClientErrorAndWait: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.signedIn,
      isLoading: false,
      user: m.signedIn ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.signedIn ? { principalId: m.bindingOwner ?? m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/features/profile", () => ({ ProfileIcon: () => null, ProfileMetaRow: () => null }));
vi.mock("@/features/feed/ProfileFeedPreview", () => ({ ProfileFeedPreview: () => null }));
vi.mock("@/features/app-subscription", () => ({
  appSubscriptionApi: { cancelYookassa: vi.fn() },
  requestAppSubscriptionPaywall: vi.fn(),
  useAppSubscriptionStatus: () => ({
    data: {
      success: true,
      data: {
        hasActiveSubscription: true,
        provider: "MANUAL",
        isLifetime: true,
        paymentMethodTitle: "Партнёрская программа",
      },
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/onboarding-tour", () => ({
  useMobileOnboardingTourStore: (selector: (s: unknown) => unknown) =>
    selector({ startTour: vi.fn() }),
}));
vi.mock("@/shared/hooks", () => ({
  useVkLink: () => ({ handleVkLink: vi.fn(), isVkLinkLoading: false }),
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        user: m.signedIn
          ? (m.storeUser ?? {
              id: m.owner,
              username: m.owner,
              role: "ADMIN",
              email: null,
              profile: { avatarUrl: "synthetic://own-avatar" },
            })
          : null,
        isAuthenticated: m.signedIn,
        isLoading: false,
        logout: vi.fn(),
        setUser: m.userUpdated,
        setUserProfile: m.profileSaved,
      }),
    {
      getState: () => ({
        isAuthenticated: m.signedIn,
        isLoading: false,
        user: m.signedIn
          ? (m.storeUser ?? { id: m.owner, username: m.owner, role: "ADMIN" })
          : null,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/api/public-config-query", () => ({
  useMobileAppPublicConfig: () => ({ data: { success: true, data: {} }, isFetched: true }),
}));
vi.mock("@/shared/lib/api/user", () => ({
  userApi: {
    getProfile: m.profileGet,
  },
}));
vi.mock("@/shared/lib/tracer/mobileTracerSelfTest", () => ({
  canSendMobileTracerSelfTest: () => false,
  sendMobileTracerSelfTest: vi.fn(),
}));
vi.mock("@gafus/types", () => ({ USER_EMAIL_MISSING_HINT: "нет email" }));
vi.mock("@/shared/lib/api", () => ({
  userApi: { getProfile: m.profileGet, updateProfile: m.profilePut },
  remindersApi: m.reminders,
  subscriptionsApi: {
    savePushSubscription: m.save,
    deletePushSubscription: m.delete,
    postPushDeviceStatus: m.status,
  },
}));
vi.mock("@/shared/lib/api/profileTabQueries", () => ({
  userProfileQueryOptions: {
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await m.profileGet();
      if (!res.success) throw Error("PROFILE_UNAVAILABLE");
      return res;
    },
  },
  studentNotesQueryOptions: {
    queryKey: ["student-notes"],
    queryFn: () => m.studentNotesRead(),
  },
  trainerPublicProfileQueryOptions: (username: string) => ({
    queryKey: ["trainer-public-profile", username],
    queryFn: async () => {
      const res = await m.trainerCoursesRead(username);
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки профиля тренера");
      return res;
    },
  }),
  pushDeviceStatusForActor: (actor: { ownerId: string; authEpoch: string } | null) => ({
    queryKey: ["push-subscription-device-status", actor?.ownerId, actor?.authEpoch],
    queryFn: async () => {
      if (!actor || actor.ownerId !== m.owner || actor.authEpoch !== m.epoch || !m.signedIn)
        throw Error("SESSION_CHANGED");
      const res = await m.status([m.token]);
      if (!res.success) throw Error("UNKNOWN");
      return res.data;
    },
    staleTime: 0,
  }),
}));
vi.mock("@/shared/components", () => ({
  TexturedSafeAreaView: (p: Record<string, unknown>) => dom("div", p),
  AppBackButton: (p: { onPress: () => void }) =>
    createElement("button", { onClick: p.onPress, "data-back": "edit" }, "Назад"),
}));
vi.mock("@/shared/components/ui", () => ({
  Button: (p: Record<string, unknown>) => dom("button", { ...p, children: p.label }),
  Card: (p: Record<string, unknown>) => dom("div", p),
  Loading: () => createElement("span", null, "Загрузка профиля…"),
}));
vi.mock("@/shared/config", () => ({
  BORDER_RADIUS: { lg: 12 },
  COLORS: { primary: "#111", disabled: "#888", onPrimary: "#fff" },
  FONTS: { montserratBold: "test", impact: "test" },
  SPACING: { md: 8 },
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: vi.fn(), selection: vi.fn(), light: vi.fn() },
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: vi.fn() }));
let ProfileScreen: typeof ProfileComponent;
let EditProfileScreen: ComponentType;
beforeAll(async () => {
  const rq = createRequire(`${process.cwd()}/app/(main)/(tabs)/profile.tsx`);
  rq.extensions[".png"] = (module) => {
    module.exports = "synthetic-png";
  };
  ProfileScreen = (await import("../../../app/(main)/(tabs)/profile")).default;
  EditProfileScreen = (await import("../../../app/(main)/profile/edit")).default;
});
const person = (id = "A", bio = "OWN_BIO", avatar = "https://cdn.test/own.png") => ({
  id,
  username: id,
  role: "ADMIN",
  phone: null,
  email: `${id.toLowerCase()}@example.test`,
  hasAppPassword: false,
  hasVkLinked: false,
  profile: {
    fullName: "USER_NAME",
    city: "Город",
    about: bio,
    telegram: null,
    instagram: null,
    website: null,
    birthDate: null,
    avatarUrl: avatar,
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
let root: Root, host: HTMLDivElement, client: QueryClient;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(ProfileScreen))),
  );
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.signedIn = true;
  m.bindingOwner = null;
  m.storeUser = null;
  m.editOpen = false;
  m.profilePut.mockReset();
  m.profileSaved.mockReset();
  m.routerBack.mockReset();
  m.routerReplace.mockReset();
  m.routerPush.mockReset();
  m.studentNotesRows = [];
  m.studentNotesRead.mockReset();
  m.studentNotesRead.mockImplementation(async () => ({ success: true, data: m.studentNotesRows }));
  m.trainerCoursesRead.mockReset();
  m.trainerCoursesRead.mockResolvedValue({ success: true, data: { courses: [] } });
  m.permission = "granted";
  m.permissionFetch.mockResolvedValue({ status: "granted" });
  m.status.mockResolvedValue({
    success: true,
    data: { determined: true, hasThisDeviceSubscription: false },
  });
  m.profileGet.mockImplementation(async () => ({ success: true, data: person(m.owner) }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("V104 actual own ProfileScreen / GET /user/profile owner cache", () => {
  it("preseeded foreign A-key Profile GET must not render private B biography or call setUser(B)", async () => {
    client.setQueryData(["user-profile"], {
      success: true,
      data: person("B", "FOREIGN_PRIVATE_BIO", "https://cdn.test/foreign.png"),
    });
    await mount();
    expect(host.textContent).not.toContain("FOREIGN_PRIVATE_BIO");
    expect(host.querySelector('[data-image-uri="https://cdn.test/foreign.png"]')).toBeNull();
    expect(m.userUpdated.mock.calls.every(([value]) => (value as { id: string }).id === "A")).toBe(
      true,
    );
  });

  it("genuine own GET renders own biography/email/avatar and only setUser(A)", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    expect(host.textContent).toContain("a@example.test");
    expect(host.querySelector('[data-image-uri="https://cdn.test/own.png"]')).not.toBeNull();
    expect(m.profileGet).toHaveBeenCalledWith(expect.any(Function));
    await vi.waitFor(() => expect(m.userUpdated).toHaveBeenCalled());
    expect(m.userUpdated.mock.calls.every(([row]) => (row as { id: string }).id === "A")).toBe(
      true,
    );
  });
  it("guest/native principal mismatch block own GET and private fallback avatar", async () => {
    m.signedIn = false;
    await mount();
    expect(host.textContent).toContain("Войдите в аккаунт");
    expect(m.profileGet).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("OWN_BIO");
    m.signedIn = true;
    m.bindingOwner = "B";
    await mount();
    expect(host.textContent).toContain("Войдите в аккаунт");
    expect(m.profileGet).not.toHaveBeenCalled();
  });
  it("pending GET never reveals previous-session fallback biography, email or avatar", async () => {
    const pending = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    m.profileGet.mockReturnValueOnce(pending.promise);
    m.storeUser = {
      ...person("A", "OLD_SESSION_BIO", "https://cdn.test/old-avatar.png"),
      email: "OLD_EMAIL",
    };
    await mount();
    expect(host.textContent).toContain("Загрузка профиля");
    expect(host.textContent).not.toContain("OLD_SESSION_BIO");
    expect(host.textContent).not.toContain("OLD_EMAIL");
    expect(host.querySelector('[data-image-uri="https://cdn.test/old-avatar.png"]')).toBeNull();
    expect(m.userUpdated).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true, data: person("A") }));
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    expect(host.textContent).not.toContain("OLD_SESSION_BIO");
  });
  it("GET 500/unknown is explicit retryable error, never false empty or raw private response", async () => {
    m.profileGet.mockResolvedValueOnce({ success: false, error: "PRIVATE_SERVER_DIAGNOSTIC" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить профиль"));
    expect(host.textContent).not.toContain("PRIVATE_SERVER_DIAGNOSTIC");
    expect(host.textContent).not.toContain("Информация о себе не внесена");
    expect(m.userUpdated).not.toHaveBeenCalled();
    const retry = Array.from(host.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Повторить загрузку профиля"),
    );
    expect(retry).toBeTruthy();
    await act(async () => retry?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    expect(m.profileGet).toHaveBeenCalledTimes(2);
  });
  it("failed refocus after successful own GET hides stale profile instead of false ready", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    m.profileGet.mockResolvedValueOnce({ success: false, error: "PRIVATE_REFETCH_ERROR" });
    await act(async () =>
      client.invalidateQueries({
        queryKey: ["user-profile", "own-tab", "A", "E1"],
        exact: true,
      }),
    );
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить профиль"));
    expect(host.textContent).not.toContain("OWN_BIO");
    expect(host.textContent).not.toContain("PRIVATE_REFETCH_ERROR");
    expect(host.textContent).not.toContain("Информация о себе не внесена");
  });
  it("HTTP-like success 200 with foreign id and malformed avatar DTO never becomes ready", async () => {
    m.profileGet.mockResolvedValueOnce({
      success: true,
      data: person("B", "FOREIGN_HTTP_PRIVATE"),
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить профиль"));
    expect(host.textContent).not.toContain("FOREIGN_HTTP_PRIVATE");
    expect(m.userUpdated).not.toHaveBeenCalled();
    m.profileGet.mockResolvedValueOnce({
      success: true,
      data: {
        ...person("A"),
        profile: { ...person("A").profile, avatarUrl: { uri: "PRIVATE_AVATAR" } },
      },
    });
    await act(async () =>
      client.invalidateQueries({ queryKey: ["user-profile", "own-tab", "A", "E1"], exact: true }),
    );
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalledTimes(2));
    expect(host.textContent).not.toContain("PRIVATE_AVATAR");
    expect(m.userUpdated).not.toHaveBeenCalled();
  });
  it("seeding foreign cache under exact A/E1 key after own successful GET fails closed", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    m.userUpdated.mockClear();
    await act(async () =>
      client.setQueryData(["user-profile", "own-tab", "A", "E1"], {
        success: true,
        data: person("B", "CACHED_FOREIGN_PRIVATE", "https://cdn.test/foreign.png"),
        __ownerId: "A",
        __authEpoch: "E1",
      }),
    );
    expect(host.textContent).not.toContain("CACHED_FOREIGN_PRIVATE");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("CACHED_FOREIGN_PRIVATE");
    expect(host.querySelector('[data-image-uri="https://cdn.test/foreign.png"]')).toBeNull();
    expect(m.userUpdated.mock.calls.every(([row]) => (row as { id: string }).id === "A")).toBe(
      true,
    );
  });
  it("edit form's unwrapped owner cache cannot overwrite own-tab scoped DTO", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("OWN_BIO"));
    await act(async () =>
      client.setQueryData(["user-profile", "A", "E1"], person("B", "EDIT_CACHE_FOREIGN_PRIVATE")),
    );
    expect(host.textContent).toContain("OWN_BIO");
    expect(host.textContent).not.toContain("EDIT_CACHE_FOREIGN_PRIVATE");
    expect(client.getQueryData(["user-profile", "own-tab", "A", "E1"])).toMatchObject({
      __ownerId: "A",
      __authEpoch: "E1",
      success: true,
    });
  });
  it("same owner new native epoch cannot use previous epoch cache before new response", async () => {
    const old = person("A", "E1_SECRET_BIO", "https://cdn.test/E1.png");
    client.setQueryData(["user-profile", "own-tab", "A", "E1"], {
      success: true,
      data: old,
      __ownerId: "A",
      __authEpoch: "E1",
    });
    m.epoch = "E2";
    const wait = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    m.profileGet.mockReturnValueOnce(wait.promise);
    await mount();
    expect(host.textContent).toContain("Загрузка профиля");
    expect(host.textContent).not.toContain("E1_SECRET_BIO");
    expect(host.querySelector('[data-image-uri="https://cdn.test/E1.png"]')).toBeNull();
    await act(async () => wait.resolve({ success: true, data: person("A", "E2_OWN_BIO") }));
    await vi.waitFor(() => expect(host.textContent).toContain("E2_OWN_BIO"));
  });

  it("A/E1 late GET after B/B1 then same A/E2 cannot repopulate B or E1 screen/store", async () => {
    const stale = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    let calls = 0;
    m.profileGet.mockImplementation(async () => {
      calls++;
      if (calls === 1) return stale.promise;
      if (m.owner === "B") return { success: true, data: person("B", "CURRENT_B_BIO") };
      return { success: true, data: person("A", "CURRENT_A_E2_BIO") };
    });
    await mount();
    expect(host.textContent).toContain("Загрузка профиля");
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalledTimes(1));
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("CURRENT_B_BIO"));
    expect(host.textContent).not.toContain("CURRENT_A_E2_BIO");
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("CURRENT_A_E2_BIO"));
    await act(async () =>
      stale.resolve({ success: true, data: person("A", "OLD_E1_LATE_PRIVATE") }),
    );
    await flush();
    expect(host.textContent).not.toContain("OLD_E1_LATE_PRIVATE");
    expect(host.textContent).not.toContain("CURRENT_B_BIO");
    expect(host.textContent).toContain("CURRENT_A_E2_BIO");
    expect(
      m.userUpdated.mock.calls.every(
        ([value]) =>
          (value as { profile: { about?: string } }).profile.about !== "OLD_E1_LATE_PRIVATE",
      ),
    ).toBe(true);
    expect(m.profileGet).toHaveBeenCalledTimes(3);
  });
  it("logout while own GET pending discards late result and never uses old store avatar/name", async () => {
    const pending = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    m.profileGet.mockReturnValueOnce(pending.promise);
    await mount();
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalledOnce());
    m.signedIn = false;
    await mount();
    expect(host.textContent).toContain("Войдите в аккаунт");
    await act(async () =>
      pending.resolve({ success: true, data: person("A", "LATE_LOGOUT_PRIVATE") }),
    );
    await flush();
    expect(host.textContent).not.toContain("LATE_LOGOUT_PRIVATE");
    expect(host.querySelector('[data-image-uri="https://cdn.test/own.png"]')).toBeNull();
    expect(m.userUpdated).not.toHaveBeenCalled();
  });
  it("component unmount pending GET rejects late setUser and private DOM paint", async () => {
    const pending = deferred<{ success: boolean; data: ReturnType<typeof person> }>();
    m.profileGet.mockReturnValueOnce(pending.promise);
    await mount();
    await vi.waitFor(() => expect(m.profileGet).toHaveBeenCalledOnce());
    await act(async () => root.unmount());
    await act(async () =>
      pending.resolve({ success: true, data: person("A", "AFTER_UNMOUNT_PRIVATE") }),
    );
    await flush();
    expect(host.textContent).not.toContain("AFTER_UNMOUNT_PRIVATE");
    expect(m.userUpdated).not.toHaveBeenCalled();
  });
});


describe("AG2 StudentNotes existing Mobile own profile nullable title text", () => {
  it("null, absent and nonempty titles render accessible labels while entries remain visible", async () => {
    m.storeUser = { ...person("A"), role: "USER" };
    m.profileGet.mockResolvedValue({ success: true, data: { ...person("A"), role: "USER" } });
    const entry = (id: string, content: string) => ({
      id, content, createdAt: "2026-10-23T10:00:00.000Z",
    });
    m.studentNotesRows = [
      { id: "n-null", title: null, createdAt: "2026-10-23T10:00:00.000Z",
        trainer: { profile: { fullName: "Кинолог А" } }, entries: [entry("e-null", "ТЕКСТ_ЗАПИСИ_НУЛЕВОЙ")] },
      { id: "n-absent", createdAt: "2026-10-23T11:00:00.000Z",
        trainer: { profile: { fullName: null } }, entries: [entry("e-absent", "ТЕКСТ_ЗАПИСИ_БЕЗ_ИМЕНИ")] },
      { id: "n-named", title: "Дневник прогресса", createdAt: "2026-10-23T12:00:00.000Z",
        trainer: { profile: { fullName: "Кинолог Б" } }, entries: [entry("e-named", "ТЕКСТ_ЗАПИСИ_ИМЕННОЙ")] },
    ];
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("ТЕКСТ_ЗАПИСИ_ИМЕННОЙ"));
    expect(host.textContent).toContain("Заметки тренера");
    expect(host.textContent).toContain("ТЕКСТ_ЗАПИСИ_НУЛЕВОЙ");
    expect(host.textContent).toContain("ТЕКСТ_ЗАПИСИ_БЕЗ_ИМЕНИ");
    expect(host.textContent).toContain("Кинолог А");
    expect(host.textContent).toContain("Дневник прогресса");
    expect(host.textContent?.match(/Заметка без названия/g)).toHaveLength(2);
    expect(host.querySelectorAll('[aria-label="Заметка без названия"]')).toHaveLength(2);
    expect(host.querySelector('[aria-label="Дневник прогресса"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Пока нет заметок от тренера");
  });
});


// AG2_STUDENT_NOTES_READ_UX — existing actual ProfileScreen mounted fixture,
// mocks only the pre-existing read query, not real HTTP/native/push/auth.
const useStudentRole = () => {
  m.storeUser = { ...person("A"), role: "USER" };
  m.profileGet.mockResolvedValue({ success: true, data: { ...person("A"), role: "USER" } });
};
const noteResponse = (title: string | null = null) => ({ success: true, data: [{
  id: "note-1", title, createdAt: "2026-10-23T10:00:00.000Z",
  trainer: { profile: { fullName: "Кинолог" } },
  entries: [{ id: "entry-1", content: "ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ",
    createdAt: "2026-10-23T10:00:00.000Z" }],
}] });
const notesButton = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
  .find(button => button.textContent?.includes("Повторить загрузку заметок"));

describe("AG2_STUDENT_NOTES_READ_UX existing profile notes card", () => {
  it("pending first GET shows loading, not falsely empty or a stale previous note", async () => {
    useStudentRole();
    const wait = deferred<ReturnType<typeof noteResponse>>();
    m.studentNotesRead.mockReturnValueOnce(wait.promise);
    await mount();
    expect(m.studentNotesRead).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(host.textContent).toContain("Загружаем заметки тренера"));
    expect(host.textContent).not.toContain("Пока нет заметок от тренера");
    expect(host.textContent).not.toContain("ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ");
    await act(async () => wait.resolve(noteResponse()));
    await vi.waitFor(() => expect(host.textContent).toContain("ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ"));
    expect(host.textContent).toContain("Заметка без названия");
    expect(notesButton()).toBeUndefined();
  });

  it("thrown 500 is a retryable read error and manual GET recovers, never empty/private text", async () => {
    useStudentRole();
    m.studentNotesRead.mockRejectedValueOnce(Error("PRIVATE_DATABASE_DETAILS"))
      .mockResolvedValueOnce(noteResponse("Именная заметка"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить заметки"));
    expect(host.textContent).not.toContain("Пока нет заметок от тренера");
    expect(host.textContent).not.toContain("PRIVATE_DATABASE_DETAILS");
    expect(m.studentNotesRead).toHaveBeenCalledTimes(1);
    expect(notesButton()).toBeDefined();
    await act(async () => notesButton()?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Именная заметка"));
    expect(host.textContent).toContain("ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ");
    expect(m.studentNotesRead).toHaveBeenCalledTimes(2);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("success:false 500 body never renders confirmed empty; retry via existing refetch", async () => {
    useStudentRole();
    m.studentNotesRead.mockResolvedValueOnce({
      success: false, error: "PRIVATE_NOTES_500_MESSAGE", code: "NOTES_INTERNAL_ERROR",
    }).mockResolvedValueOnce({ success: true, data: [] });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить заметки"));
    expect(host.textContent).not.toContain("Пока нет заметок от тренера");
    expect(host.textContent).not.toContain("PRIVATE_NOTES_500_MESSAGE");
    expect(m.studentNotesRead).toHaveBeenCalledTimes(1);
    await act(async () => notesButton()?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Пока нет заметок от тренера"));
    expect(m.studentNotesRead).toHaveBeenCalledTimes(2);
  });

  it("fresh GET pending after prior good notes hides cached notes until strictly confirmed", async () => {
    useStudentRole();
    m.studentNotesRead.mockResolvedValueOnce(noteResponse("ПРЕЖНЯЯ_ЛИЧНАЯ_ЗАМЕТКА"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("ПРЕЖНЯЯ_ЛИЧНАЯ_ЗАМЕТКА"));
    const wait = deferred<{ success: boolean; data?: unknown; error?: string }>();
    m.studentNotesRead.mockReturnValueOnce(wait.promise);
    await act(async () => { void client.invalidateQueries({ queryKey: ["student-notes"] }); });
    await vi.waitFor(() => expect(host.textContent).toContain("Загружаем заметки тренера"));
    expect(host.textContent).not.toContain("ПРЕЖНЯЯ_ЛИЧНАЯ_ЗАМЕТКА");
    expect(host.textContent).not.toContain("ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ");
    expect(host.textContent).not.toContain("Пока нет заметок от тренера");
    await act(async () => wait.resolve({ success: false, error: "PRIVATE_REFETCH_FAILURE" }));
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить заметки"));
    expect(host.textContent).not.toContain("ПРЕЖНЯЯ_ЛИЧНАЯ_ЗАМЕТКА");
    expect(host.textContent).not.toContain("PRIVATE_REFETCH_FAILURE");
  });

  it("200 confirmed [] alone displays empty state; title fallback and entries on later success", async () => {
    useStudentRole();
    m.studentNotesRead.mockResolvedValueOnce({ success: true, data: [] });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Пока нет заметок от тренера"));
    expect(host.textContent).not.toContain("Не удалось загрузить заметки");
    await act(async () => client.setQueryData(["student-notes"], noteResponse(null)));
    await vi.waitFor(() => expect(host.textContent).toContain("Заметка без названия"));
    expect(host.textContent).toContain("ТЕКСТ_ЗАМЕТКИ_ДЛЯ_ЧТЕНИЯ");
  });

  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "%s terminal auth failure must not expose a retry or stale private notes", async code => {
      useStudentRole();
      m.studentNotesRead.mockResolvedValueOnce({ success: false, code, error: "PRIVATE_AUTH" });
      await mount();
      await vi.waitFor(() => expect(host.textContent).toContain("Заметки недоступны"));
      expect(host.textContent).not.toContain("Пока нет заметок от тренера");
      expect(host.textContent).not.toContain("PRIVATE_AUTH");
      expect(notesButton()).toBeUndefined();
      expect(m.studentNotesRead).toHaveBeenCalledTimes(1);
    },
  );
});


// AG2_TRAINER_COURSES_READ_UX — only the existing native own-profile trainer card.
const useTrainerCourseOwner = () => {
  m.storeUser = { ...person("A"), role: "TRAINER" };
  m.profileGet.mockResolvedValue({ success: true, data: { ...person("A"), role: "TRAINER" } });
};
const availableCourse = {
  id: "course-1", name: "КУРС_НЕПОДБОР", type: "NON_PICKING",
  shortDesc: "Занятия с собакой",
};
const trainerCourseRetry = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
  .find(node => node.getAttribute("aria-label") === "Повторить загрузку курсов кинолога");

describe("AG2_TRAINER_COURSES_READ_UX existing own trainer-profile courses card", () => {
  it("initial pending GET is explicit loading, never a false empty course list", async () => {
    useTrainerCourseOwner();
    const pending = deferred<{ success: boolean; data: { courses: typeof availableCourse[] } }>();
    m.trainerCoursesRead.mockReturnValueOnce(pending.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курсы кинолога"));
    expect(host.textContent).toContain("Загружаем курсы кинолога");
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(host.textContent).not.toContain("КУРС_НЕПОДБОР");
    expect(m.trainerCoursesRead).toHaveBeenCalledWith("A");
    await act(async () => pending.resolve({ success: true, data: { courses: [availableCourse] } }));
    await vi.waitFor(() => expect(host.textContent).toContain("КУРС_НЕПОДБОР"));
    expect(host.textContent).not.toContain("Загружаем курсы кинолога");
  });

  it("thrown API error displays accessible error and manual retry recovers actual courses", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockRejectedValueOnce(new Error("PRIVATE_TRAINER_DIAGNOSTIC"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(host.textContent).not.toContain("PRIVATE_TRAINER_DIAGNOSTIC");
    expect(trainerCourseRetry()).toBeDefined();
    await act(async () => trainerCourseRetry()?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Курсы не найдены"));
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(2);
    expect(trainerCourseRetry()).toBeUndefined();
  });

  it("ApiResponse failure cannot become empty and retry must be user initiated", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockResolvedValueOnce({ success: false, error: "PRIVATE_API_BODY" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(host.textContent).not.toContain("PRIVATE_API_BODY");
    await flush();
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(1);
    await act(async () => trainerCourseRetry()?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Курсы не найдены"));
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(2);
  });

  it("after successful GET stale course must disappear during refetch and after failed refetch", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockResolvedValueOnce({
      success: true, data: { courses: [availableCourse] },
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("КУРС_НЕПОДБОР"));
    const pending = deferred<{ success: boolean; data: { courses: typeof availableCourse[] } }>();
    m.trainerCoursesRead.mockReturnValueOnce(pending.promise);
    await act(async () => { void client.invalidateQueries({ queryKey: ["trainer-public-profile", "A"] }); });
    await vi.waitFor(() => expect(host.textContent).toContain("Загружаем курсы кинолога"));
    expect(host.textContent).not.toContain("КУРС_НЕПОДБОР");
    expect(host.textContent).not.toContain("Курсы не найдены");
    await act(async () => pending.resolve({ success: false, data: { courses: [] } }));
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("КУРС_НЕПОДБОР");
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(host.textContent).not.toContain("PRIVATE_REFETCH_ERROR");
  });

  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "terminal %s never exposes stale courses or a retry button", async code => {
      useTrainerCourseOwner();
      m.trainerCoursesRead.mockRejectedValueOnce(new Error(code));
      await mount();
      await vi.waitFor(() => expect(host.textContent).toContain("Курсы недоступны"));
      expect(host.textContent).not.toContain("Курсы не найдены");
      expect(host.textContent).not.toContain("КУРС_НЕПОДБОР");
      expect(trainerCourseRetry()).toBeUndefined();
      await flush();
      expect(m.trainerCoursesRead).toHaveBeenCalledTimes(1);
    },
  );

  it("confirmed empty is truly empty; valid course retains exact existing training navigation", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockResolvedValueOnce({ success: true, data: { courses: [] } });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Курсы не найдены"));
    expect(host.textContent).not.toContain("Не удалось загрузить курсы кинолога");
    m.trainerCoursesRead.mockResolvedValueOnce({
      success: true, data: { courses: [availableCourse] },
    });
    await act(async () => { await client.invalidateQueries({ queryKey: ["trainer-public-profile", "A"] }); });
    await vi.waitFor(() => expect(host.textContent).toContain("КУРС_НЕПОДБОР"));
    const link = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("КУРС_НЕПОДБОР"));
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(m.routerPush).toHaveBeenCalledWith("/training/NON_PICKING");
    expect(m.trainerCoursesRead).toHaveBeenCalledWith("A");
  });

  it("malformed 200 with non-array courses is retryable failure, never empty", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockResolvedValueOnce({ success: true, data: { courses: null } });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(trainerCourseRetry()).toBeDefined();
  });
});


describe("MOBILE_PROFILE_TRAINER_CODE_UI code-aware existing trainer card", () => {
  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "%s typed transport failure with generic message is terminal, without retry", async code => {
      useTrainerCourseOwner();
      const error = Object.assign(new Error("Сбой чтения данных"), { code });
      m.trainerCoursesRead.mockRejectedValueOnce(error);
      await mount();
      await vi.waitFor(() => expect(host.textContent).toContain("Курсы недоступны"));
      expect(host.textContent).not.toContain("Сбой чтения данных");
      expect(host.textContent).not.toContain("Курсы не найдены");
      expect(trainerCourseRetry()).toBeUndefined();
      await flush();
      expect(m.trainerCoursesRead).toHaveBeenCalledTimes(1);
      expect(m.save).not.toHaveBeenCalled();
    },
  );
  it("NETWORK_ERROR preserves existing explicit retry and confirmed success recovery", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockRejectedValueOnce(
      Object.assign(new Error("Сбой чтения данных"), { code: "NETWORK_ERROR" }),
    ).mockResolvedValueOnce({ success: true, data: { courses: [availableCourse] } });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(host.textContent).not.toContain("Сбой чтения данных");
    expect(trainerCourseRetry()).toBeDefined();
    await flush();
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(1);
    await act(async () => trainerCourseRetry()?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("КУРС_НЕПОДБОР"));
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(2);
    expect(trainerCourseRetry()).toBeUndefined();
  });
  it("unknown typed failure remains generic manual retry, never invented entitlement", async () => {
    useTrainerCourseOwner();
    m.trainerCoursesRead.mockRejectedValueOnce(
      Object.assign(new Error("PRIVATE_SERVER_DETAILS"), { code: "UNRECOGNIZED_CODE" }),
    );
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить курсы кинолога"));
    expect(host.textContent).not.toContain("PRIVATE_SERVER_DETAILS");
    expect(host.textContent).not.toContain("Курсы не найдены");
    expect(trainerCourseRetry()).toBeDefined();
    expect(m.trainerCoursesRead).toHaveBeenCalledTimes(1);
  });
});


describe("USER020 original own profile tab -> real editor -> readback -> return/reopen", () => {
  const server = () => ({ ...person("A", "СТАРЫЙ_ТЕКСТ"), profile: {
    ...person("A", "СТАРЫЙ_ТЕКСТ").profile, city: "Самара",
  } });
  async function openEditor() {
    await vi.waitFor(() => expect(host.textContent).toContain("Внести/Изменить"));
    const entry = Array.from(host.querySelectorAll("button")).find(
      el => el.textContent?.includes("Внести/Изменить «О себе»"),
    );
    expect(entry).toBeDefined();
    await act(async () => entry?.click());
    expect(m.routerPush).toHaveBeenLastCalledWith({ pathname: "/profile/edit" });
    m.editOpen = true;
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(EditProfileScreen))),
    );
    await vi.waitFor(() =>
      expect(host.querySelector('input[placeholder="Например, Самара"]')).not.toBeNull(),
    );
  }
  async function field(placeholder: string, value: string) {
    const input = host.querySelector<HTMLInputElement>('input[placeholder="' + placeholder + '"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function save() {
    const button = Array.from(host.querySelectorAll("button")).find(
      el => el.textContent?.trim() === "Сохранить",
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
  }
  async function parent() {
    m.editOpen = false;
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(ProfileScreen))),
    );
  }
  it("real profile link -> editor PUT once -> confirmed GET -> auto Back -> parent display -> reopen values", async () => {
    const persisted = server();
    m.profileGet.mockImplementation(async () => ({
      success: true, data: structuredClone(persisted),
    }));
    m.profilePut.mockImplementation(async (
      changes: Record<string, unknown>, guard: () => boolean,
    ) => {
      expect(guard()).toBe(true);
      Object.assign(persisted.profile, changes);
      return { success: true, data: { userId: "A", ...persisted.profile } };
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("СТАРЫЙ_ТЕКСТ"));
    await openEditor();
    expect(host.querySelector<HTMLInputElement>('input[placeholder="Например, Самара"]')?.value).toBe("Самара");
    await field("Например, Самара", "Казань");
    await field("О себе", "СОХРАНЁННЫЙ_ПРОФИЛЬ");
    await save();
    await vi.waitFor(() => expect(m.profilePut).toHaveBeenCalledTimes(1));
    expect(m.profilePut.mock.calls[0][0]).toEqual({ city: "Казань", about: "СОХРАНЁННЫЙ_ПРОФИЛЬ" });
    await vi.waitFor(() => expect(m.profileSaved).toHaveBeenCalledTimes(1));
    expect(m.profileSaved.mock.calls[0][0]).toEqual(
      expect.objectContaining({ city: "Казань", about: "СОХРАНЁННЫЙ_ПРОФИЛЬ", userId: "A" }),
    );
    await vi.waitFor(() => expect(m.routerBack).toHaveBeenCalledTimes(1), { timeout: 2500 });
    await parent();
    await vi.waitFor(() => expect(host.textContent).toContain("СОХРАНЁННЫЙ_ПРОФИЛЬ"));
    expect(host.textContent).not.toContain("СТАРЫЙ_ТЕКСТ");
    await openEditor();
    expect(host.querySelector<HTMLInputElement>('input[placeholder="Например, Самара"]')?.value).toBe("Казань");
    expect(host.querySelector<HTMLInputElement>('input[placeholder="О себе"]')?.value).toBe("СОХРАНЁННЫЙ_ПРОФИЛЬ");
    expect(m.profilePut).toHaveBeenCalledTimes(1);
    expect(persisted.role).toBe("ADMIN");
    expect(persisted.username).toBe("A");
  });
  it("server PROFILE_VALIDATION_ERROR allows correction, unknown ACK never double PUT; Back/reopen reconciles GET", async () => {
    const persisted = server();
    m.profileGet.mockImplementation(async () => ({
      success: true, data: structuredClone(persisted),
    }));
    m.profilePut.mockResolvedValueOnce({
      success: false, code: "PROFILE_VALIDATION_ERROR", error: "PRIVATE_SERVER",
    }).mockImplementationOnce(async (changes: Record<string, unknown>) => {
      Object.assign(persisted.profile, changes);
      throw new Error("PRIVATE_TOKEN_LOST_ACK");
    });
    await mount();
    await openEditor();
    await field("Например, Самара", "Некорректно");
    await save();
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте заполненные поля"));
    expect(m.profilePut).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("PRIVATE_SERVER");
    await field("Например, Самара", "Казань");
    await save();
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(m.profilePut).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("PRIVATE_TOKEN_LOST_ACK");
    await save();
    expect(m.profilePut).toHaveBeenCalledTimes(2);
    const back = host.querySelector<HTMLButtonElement>('[data-back="edit"]');
    expect(back).not.toBeNull();
    await act(async () => back?.click());
    expect(m.routerBack).toHaveBeenCalled();
    await parent();
    await vi.waitFor(() => expect(host.textContent).toContain("СТАРЫЙ_ТЕКСТ"));
    await openEditor();
    await vi.waitFor(() => expect(
      host.querySelector<HTMLInputElement>('input[placeholder="Например, Самара"]')?.value,
    ).toBe("Казань"));
    expect(m.profileGet.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(m.profilePut).toHaveBeenCalledTimes(2);
  });
});
