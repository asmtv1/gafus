// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type ProfileComponent from "../../../../app/(main)/(tabs)/profile";
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
    dom("button", {
      children: "Название напоминания",
      onPress: () => (p.onChangeText as (v: string) => void)(m.inputName),
    }),
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
vi.mock("expo-image", () => ({ Image: () => null }));
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
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
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
    getVerifiedBinding: () => (m.signedIn ? { principalId: m.owner, authEpoch: m.epoch } : null),
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
          ? {
              id: m.owner,
              username: m.owner,
              role: "ADMIN",
              profile: { avatarUrl: "synthetic://avatar" },
            }
          : null,
        isAuthenticated: m.signedIn,
        isLoading: false,
        logout: vi.fn(),
        setUser: m.userUpdated,
      }),
    {
      getState: () => ({
        isAuthenticated: m.signedIn,
        isLoading: false,
        user: m.signedIn ? { id: m.owner } : null,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/api/public-config-query", () => ({
  useMobileAppPublicConfig: () => ({ data: { success: true, data: {} }, isFetched: true }),
}));
vi.mock("@/shared/lib/api/user", () => ({
  userApi: {
    getProfile: async () => ({
      success: true,
      data: {
        id: m.owner,
        username: m.owner,
        role: "ADMIN",
        profile: { avatarUrl: "synthetic://avatar" },
      },
    }),
  },
}));
vi.mock("@/shared/lib/tracer/mobileTracerSelfTest", () => ({
  canSendMobileTracerSelfTest: () => false,
  sendMobileTracerSelfTest: vi.fn(),
}));
vi.mock("@gafus/types", () => ({ USER_EMAIL_MISSING_HINT: "нет email" }));
vi.mock("@/shared/lib/api", () => ({
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
    queryFn: async () => ({
      success: true,
      data: {
        id: m.owner,
        username: m.owner,
        role: "ADMIN",
        profile: { avatarUrl: "synthetic://avatar" },
      },
    }),
  },
  studentNotesQueryOptions: {
    queryKey: ["student-notes"],
    queryFn: async () => ({ success: true, data: [] }),
  },
  trainerPublicProfileQueryOptions: (username: string) => ({
    queryKey: ["trainer-public-profile", username],
    queryFn: async () => ({ success: true, data: { courses: [] } }),
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
}));
vi.mock("@/shared/components/ui", () => ({
  Button: (p: Record<string, unknown>) => dom("button", { ...p, children: p.label }),
  Card: (p: Record<string, unknown>) => dom("div", p),
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
import RemindersScreen from "../../../../app/(main)/reminders";
let ProfileScreen: typeof ProfileComponent;
beforeAll(async () => {
  // Synthetic asset loader, scoped to this Vitest process. No native UI/device.
  const rq = createRequire(`${process.cwd()}/app/(main)/(tabs)/profile.tsx`);
  rq.extensions[".png"] = (module) => {
    module.exports = "synthetic-png";
  };
  ProfileScreen = (await import("../../../../app/(main)/(tabs)/profile")).default;
});
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let runIndex = 0;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(RemindersScreen))),
  );
  await flush();
}
async function press(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(text),
  );
  expect(button, `Missing button: ${text}`).toBeTruthy();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  runIndex++;
  m.owner = "A";
  m.epoch = `R-${runIndex}`;
  m.signedIn = true;
  m.permission = "undetermined";
  m.requestedPermission = "granted";
  m.token = `expo-${runIndex}`;
  m.remoteRegistered = false;
  m.permissionFetch.mockImplementation(async () => ({ status: m.permission }));
  m.permissionRequest.mockImplementation(async () => ({ status: m.requestedPermission }));
  m.expo.mockImplementation(async () => ({ data: m.token }));
  m.save.mockImplementation(async (_: unknown, guard: () => boolean) => {
    if (!guard()) return { success: false };
    m.remoteRegistered = true;
    return { success: true };
  });
  m.delete.mockImplementation(async (_: unknown, guard: () => boolean) => {
    if (!guard()) return { success: false };
    m.remoteRegistered = false;
    return { success: true };
  });
  m.status.mockImplementation(async () => ({
    success: true,
    data: { determined: true, hasThisDeviceSubscription: m.remoteRegistered },
  }));
  m.reminderRows = [];
  m.inputName = "Тренировка";
  m.reminders.getAll.mockImplementation(async () => ({
    success: true,
    data: m.reminderRows.map((row) => ({ ...row })),
  }));
  m.reminders.create.mockImplementation(
    async (
      payload: {
        name: string;
        reminderTime: string;
        reminderDays: string | null;
        timezone: string;
      },
      guard: () => boolean,
    ) => {
      if (!guard()) return { success: false, code: "G05_SESSION_CHANGED" };
      const row = { id: `synthetic-${m.reminderRows.length + 1}`, enabled: true, ...payload };
      m.reminderRows.push(row);
      return { success: true, data: row };
    },
  );
  m.reminders.update.mockImplementation(
    async (id: string, patch: { enabled: boolean }, guard: () => boolean) => {
      if (!guard()) return { success: false, code: "G05_SESSION_CHANGED" };
      const row = m.reminderRows.find((x) => x.id === id);
      if (!row) return { success: false, code: "NOT_FOUND" };
      Object.assign(row, patch);
      return { success: true, data: { ...row } };
    },
  );
  m.reminders.remove.mockImplementation(async (id: string, guard: () => boolean) => {
    if (!guard()) return { success: false, code: "G05_SESSION_CHANGED" };
    m.reminderRows = m.reminderRows.filter((x) => x.id !== id);
    return { success: true };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe("actual mounted Reminders screen with synthetic Expo SDK and API", () => {
  it("education cancel never registers or reports enabled", async () => {
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    await vi.waitFor(() => expect(host.textContent).toContain("Напомнить о тренировке?"));
    await press("Не сейчас");
    expect(m.save).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Уведомления включены");
  });
  it("denied permission cannot produce success or POST", async () => {
    m.permission = "denied";
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    expect(m.save).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Уведомления включены");
  });
  it("native POST ACK and readback both required before success toast", async () => {
    const ack = deferred<{ success: boolean }>();
    m.save.mockImplementationOnce(() => ack.promise);
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    await press("Разрешить уведомления");
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledOnce());
    expect(host.textContent).not.toContain("Уведомления включены");
    m.remoteRegistered = true;
    await act(async () => ack.resolve({ success: true }));
    await flush();
    expect(host.textContent).toContain("Уведомления включены");
  });
  it("network-unknown status readback cannot show enabled toast", async () => {
    m.status.mockResolvedValue({ success: false, code: "NETWORK_ERROR" });
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    await press("Разрешить уведомления");
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledOnce());
    await flush();
    expect(host.textContent).not.toContain("Уведомления включены");
    expect(host.textContent).toContain("Проверьте статус уведомлений");
  });
  it("user cancels the OS permission prompt: no provider token, POST or success", async () => {
    m.requestedPermission = "denied";
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    await vi.waitFor(() => expect(host.textContent).toContain("Напомнить о тренировке?"));
    await press("Разрешить уведомления");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось подтвердить включение"));
    expect(m.expo).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("logout during SDK token fetch leaves no old-owner subscription or toast", async () => {
    const token = deferred<{ data: string }>();
    m.permission = "granted";
    m.expo.mockReturnValueOnce(token.promise);
    await mount();
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledOnce());
    m.signedIn = false;
    m.owner = "B";
    m.epoch = `B-${runIndex}`;
    await act(async () => token.resolve({ data: `secret-old-${runIndex}` }));
    await flush();
    expect(m.save).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Уведомления включены");
  });
});

async function mountProfile() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(ProfileScreen))),
  );
  await flush();
}
function profilePushRow() {
  return host.querySelector<HTMLButtonElement>(
    'button[aria-label="Подписка на этом устройстве. Настроить уведомления"]',
  );
}
async function tapProfilePush() {
  const row = profilePushRow();
  expect(row).toBeTruthy();
  await act(async () => row?.click());
  await flush();
}
async function waitForRow(text: string) {
  await vi.waitFor(() => expect(profilePushRow()?.textContent).toContain(text));
  await flush();
}

describe("actual mounted Profile screen synthetic enable-disable-re-enable", () => {
  it("ACK + fresh device-status controls full enable -> disable -> re-enable lifecycle", async () => {
    m.permission = "granted";
    await mountProfile();
    await waitForRow("Неактивна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    await waitForRow("Активна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.delete).toHaveBeenCalledTimes(1));
    await waitForRow("Неактивна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
    await waitForRow("Активна");
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.delete.mock.calls[0][0]).toBe(m.token);
    expect(m.delete.mock.calls[0][1]()).toBe(true);
  });
  it("Profile: POST ACK pending and then status-readback unknown never claims active", async () => {
    m.permission = "granted";
    const ack = deferred<{ success: boolean }>();
    m.save.mockReturnValueOnce(ack.promise);
    await mountProfile();
    await waitForRow("Неактивна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(profilePushRow()?.textContent).not.toContain("Активна");
    m.remoteRegistered = true;
    m.status.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
    await act(async () => ack.resolve({ success: true }));
    await flush();
    await vi.waitFor(() => expect(m.alert).toHaveBeenCalled());
    expect(profilePushRow()?.textContent).not.toContain("Активна");
  });
  it("unknown DELETE ACK never paints disabled and remains retryable", async () => {
    m.permission = "granted";
    m.remoteRegistered = true;
    m.delete.mockResolvedValueOnce({ success: false, code: "NETWORK_ERROR" });
    await mountProfile();
    await waitForRow("Активна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.delete).toHaveBeenCalledTimes(1));
    await waitForRow("Активна");
    expect(m.alert).toHaveBeenCalled();
  });
  it("logout during native token lookup prevents stale DELETE and B UI remains inactive", async () => {
    m.permission = "granted";
    m.remoteRegistered = true;
    await mountProfile();
    await waitForRow("Активна");
    const native = deferred<{ data: string }>();
    m.expo.mockReturnValueOnce(native.promise);
    await tapProfilePush();
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledTimes(1));
    m.signedIn = false;
    await act(async () => native.resolve({ data: "secret-old-A" }));
    await flush();
    expect(m.delete).not.toHaveBeenCalled();
    m.signedIn = true;
    m.owner = "B";
    m.epoch = `PROFILE-B-${runIndex}`;
    m.remoteRegistered = false;
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(ProfileScreen, { key: m.epoch }),
        ),
      ),
    );
    await waitForRow("Неактивна");
  });
  it("late DELETE ACK after A logout cannot mark B disabled or mutate B UI", async () => {
    m.permission = "granted";
    m.remoteRegistered = true;
    await mountProfile();
    await waitForRow("Активна");
    const ack = deferred<{ success: boolean }>();
    m.delete.mockReturnValueOnce(ack.promise);
    await tapProfilePush();
    await vi.waitFor(() => expect(m.delete).toHaveBeenCalledTimes(1));
    m.signedIn = false;
    m.owner = "B";
    m.epoch = `DELETE-B-${runIndex}`;
    m.remoteRegistered = false;
    await act(async () => ack.resolve({ success: true }));
    await flush();
    m.signedIn = true;
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(ProfileScreen, { key: m.epoch }),
        ),
      ),
    );
    await waitForRow("Неактивна");
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("concurrent Profile and actual Reminders screen share one owner-scoped POST", async () => {
    m.permission = "granted";
    const ack = deferred<{ success: boolean }>();
    m.save.mockReturnValueOnce(ack.promise);
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement("div", null, createElement(ProfileScreen), createElement(RemindersScreen)),
        ),
      ),
    );
    await waitForRow("Неактивна");
    await tapProfilePush();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    expect(m.save).toHaveBeenCalledTimes(1);
    m.remoteRegistered = true;
    await act(async () => ack.resolve({ success: true }));
    await flush();
    await waitForRow("Активна");
    expect(m.save).toHaveBeenCalledTimes(1);
  });
  it("a new rotated Expo token is posted after prior success", async () => {
    m.permission = "granted";
    await mountProfile();
    await waitForRow("Неактивна");
    await tapProfilePush();
    await waitForRow("Активна");
    await tapProfilePush();
    await waitForRow("Неактивна");
    const original = m.token;
    m.token = `rotated-${runIndex}`;
    await tapProfilePush();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
    expect(m.save.mock.calls[0][0].endpoint).toBe(original);
    expect(m.save.mock.calls[1][0].endpoint).toBe(m.token);
  });
});

function testReminder(id = "reminder-A"): (typeof m.reminderRows)[number] {
  return {
    id,
    name: "Тренировка",
    enabled: true,
    reminderTime: "09:00",
    reminderDays: null,
    timezone: "Europe/Samara",
  };
}
async function newReminderForm() {
  await mount();
  await press("Название напоминания");
  await press("Все дни");
}

describe("actual mounted Reminders CRUD ordinary handlers via existing API mock", () => {
  it("create sends immutable changed fields once; no success before ACK and exact GET readback", async () => {
    const pending = deferred<{ success: true; data: ReturnType<typeof testReminder> }>();
    m.reminders.create.mockReturnValueOnce(pending.promise);
    m.inputName = "Утренняя тренировка";
    await newReminderForm();
    // Two actual handler calls in one React batch: disabled prop has not rerendered yet.
    const add = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Добавить",
    );
    expect(add).toBeTruthy();
    await act(async () => {
      add?.click();
      add?.click();
    });
    await flush();
    await vi.waitFor(() => expect(m.reminders.create).toHaveBeenCalledTimes(1));
    const [payload, guard] = m.reminders.create.mock.calls[0] as [
      Record<string, unknown>,
      () => boolean,
    ];
    expect(payload).toEqual({
      name: "Утренняя тренировка",
      reminderTime: "09:00",
      reminderDays: null,
      timezone: expect.any(String),
    });
    expect(guard()).toBe(true);
    expect(host.textContent).not.toContain("Напоминание добавлено");
    expect(m.reminders.create).toHaveBeenCalledTimes(1);
    const row = {
      ...testReminder(),
      name: payload.name as string,
      timezone: payload.timezone as string,
    };
    m.reminderRows.push(row);
    await act(async () => pending.resolve({ success: true, data: row }));
    await vi.waitFor(() => expect(host.textContent).toContain("Напоминание добавлено"));
    expect(m.reminders.getAll).toHaveBeenCalledTimes(2);
  });
  it("create ACK without matching persisted row is UNKNOWN: no automatic retry", async () => {
    m.reminders.create.mockImplementationOnce(
      async (payload: {
        name: string;
        reminderTime: string;
        reminderDays: string | null;
        timezone: string;
      }) => ({
        success: true,
        data: { id: "ghost", enabled: true, ...payload },
      }),
    );
    await newReminderForm();
    await press("Добавить");
    await vi.waitFor(() => expect(host.textContent).toContain("Статус изменения неизвестен"));
    expect(host.textContent).not.toContain("Напоминание добавлено");
    await press("Добавить");
    expect(m.reminders.create).toHaveBeenCalledTimes(1);
  });
  it("toggle sends only changed enabled field, unchanged UI until ACK+GET", async () => {
    m.reminderRows = [testReminder()];
    const pending = deferred<{ success: true; data: ReturnType<typeof testReminder> }>();
    m.reminders.update.mockReturnValueOnce(pending.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Тренировка"));
    await press("Включено");
    await vi.waitFor(() => expect(m.reminders.update).toHaveBeenCalledTimes(1));
    const [id, patch, guard] = m.reminders.update.mock.calls[0] as [string, unknown, () => boolean];
    expect(id).toBe("reminder-A");
    expect(patch).toEqual({ enabled: false });
    expect(guard()).toBe(true);
    expect(host.textContent).toContain("Включено");
    m.reminderRows[0].enabled = false;
    await act(async () => pending.resolve({ success: true, data: { ...m.reminderRows[0] } }));
    await vi.waitFor(() => expect(host.textContent).toContain("Выключено"));
  });
  it("toggle positive ACK but mismatched persisted enabled => UNKNOWN, not fabricated success", async () => {
    m.reminderRows = [testReminder()];
    m.reminders.update.mockResolvedValueOnce({
      success: true,
      data: { ...m.reminderRows[0], enabled: false },
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Включено"));
    await press("Включено");
    await vi.waitFor(() => expect(host.textContent).toContain("Статус изменения неизвестен"));
    expect(host.textContent).toContain("Включено");
    expect(m.reminders.update).toHaveBeenCalledTimes(1);
  });
  it("delete cancel sends nothing, confirmed DELETE + absent-id GET removes row", async () => {
    m.reminderRows = [testReminder()];
    const pending = deferred<{ success: boolean }>();
    m.reminders.remove.mockReturnValueOnce(pending.promise);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Тренировка"));
    const deleteButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить напоминание: Тренировка"]',
    );
    expect(deleteButton).toBeTruthy();
    await act(async () => deleteButton?.click());
    expect(m.reminders.remove).not.toHaveBeenCalled();
    const prompt = m.alert.mock.calls.find((call: unknown[]) => call[0] === "Удалить напоминание");
    expect(prompt).toBeTruthy();
    const actions = prompt?.[2] as { text: string; onPress?: () => void }[];
    const cancel = actions.find((a) => a.text === "Отмена");
    expect(cancel?.onPress).toBeUndefined();
    expect(m.reminders.remove).not.toHaveBeenCalled();
    const confirm = actions.find((a) => a.text === "Удалить");
    await act(async () => confirm?.onPress?.());
    await vi.waitFor(() => expect(m.reminders.remove).toHaveBeenCalledTimes(1));
    const [id, guard] = m.reminders.remove.mock.calls[0] as [string, () => boolean];
    expect(id).toBe("reminder-A");
    expect(guard()).toBe(true);
    expect(host.textContent).toContain("Тренировка");
    m.reminderRows = [];
    await act(async () => pending.resolve({ success: true }));
    await vi.waitFor(() => expect(host.textContent).toContain("Напоминание удалено"));
    expect(host.textContent).not.toContain("Тренировка •");
  });
  it("DELETE lost ACK leaves unknown status even if backend-side mutation occurred", async () => {
    m.reminderRows = [testReminder()];
    m.reminders.remove.mockImplementationOnce(async () => {
      m.reminderRows = [];
      return { success: false, code: "NETWORK_TIMEOUT" };
    });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Тренировка"));
    const deleteButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить напоминание: Тренировка"]',
    );
    expect(deleteButton).toBeTruthy();
    await act(async () => deleteButton?.click());
    const prompt = m.alert.mock.calls.find((args: unknown[]) => args[0] === "Удалить напоминание");
    const confirm = (prompt?.[2] as { text: string; onPress?: () => void }[]).find(
      (a) => a.text === "Удалить",
    );
    await act(async () => confirm?.onPress?.());
    await vi.waitFor(() => expect(host.textContent).toContain("Статус изменения неизвестен"));
    expect(m.reminders.remove).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Напоминание удалено");
  });
  it("late create response after A->B->A new epoch cannot mark success for new owner", async () => {
    const pending = deferred<{ success: boolean; data: ReturnType<typeof testReminder> }>();
    m.reminders.create.mockReturnValueOnce(pending.promise);
    await newReminderForm();
    await press("Добавить");
    await vi.waitFor(() => expect(m.reminders.create).toHaveBeenCalledOnce());
    const guard = m.reminders.create.mock.calls[0][1] as () => boolean;
    m.owner = "B";
    m.epoch = `B-${runIndex}`;
    m.owner = "A";
    m.epoch = `A-E2-${runIndex}`;
    expect(guard()).toBe(false);
    await act(async () => pending.resolve({ success: true, data: testReminder() }));
    await flush();
    expect(host.textContent).not.toContain("Напоминание добавлено");
    expect(m.reminderRows).toEqual([]);
  });
  it("failed owner-scoped initial GET does not claim empty list or allow create", async () => {
    m.reminders.getAll.mockResolvedValueOnce({ success: false, code: "NETWORK_ERROR" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось проверить список"));
    await press("Название напоминания");
    await press("Все дни");
    await press("Добавить");
    expect(m.reminders.create).not.toHaveBeenCalled();
  });
});
