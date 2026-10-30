// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import type { ReactNode, ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  live: true,
  segments: ["(tabs)"] as string[],
  list: vi.fn(),
  oldCreate: vi.fn(),
  post: vi.fn(),
  lookup: vi.fn(),
  haptic: vi.fn(),
  track: vi.fn(),
  nameChange: vi.fn(),
}));
vi.mock("@/shared/lib/api", () => ({
  remindersApi: {
    getAll: (...a: unknown[]) => m.list(...a),
    create: (...a: unknown[]) => m.oldCreate(...a),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getVerifiedPushActor: () => ({ ownerId: m.owner, authEpoch: m.epoch }),
  isSameVerifiedPushActor: (actor: { ownerId: string; authEpoch: string } | null) =>
    !!actor && m.live && actor.ownerId === m.owner && actor.authEpoch === m.epoch,
  getPushPermissionStatus: vi.fn().mockResolvedValue("denied"),
  setupPushNotifications: vi.fn(),
  shouldShowPushPermissionEducation: vi.fn().mockResolvedValue(false),
  markPushPermissionEducationSeen: vi.fn(),
}));
vi.mock("@/shared/lib/utils/usePushRegistrationLiveness", () => ({
  usePushRegistrationLiveness: () => () => m.live,
}));
vi.mock("@/shared/lib/api/profileTabQueries", () => ({
  pushDeviceStatusForActor: vi.fn(() => ({ queryKey: ["mock"] })),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: {
    selection: () => m.haptic(),
    light: () => m.haptic(),
    success: () => m.haptic(),
  },
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => m.track(...a) }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/config", () => ({
  BORDER_RADIUS: { lg: 6, xl: 10 },
  COLORS: {
    background: "white",
    cardBackground: "white",
    text: "black",
    textSecondary: "gray",
    disabled: "gray",
    primary: "olive",
    onPrimary: "white",
    borderLight: "gray",
  },
  FONTS: { montserrat: "sans", montserratBold: "sans" },
  SPACING: { lg: 16, md: 12, sm: 8, xl: 20 },
}));
vi.mock("expo-router", () => ({
  useSegments: () => m.segments,
  Redirect: () => null,
  useFocusEffect: (cb: () => void) => {
    useEffect(() => {
      cb();
    }, [cb]);
  },
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/components", () => ({
  TexturedSafeAreaView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/shared/components/ui", () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, label),
}));
vi.mock("react-native-paper", () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  Snackbar: ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
    visible ? createElement("div", null, children) : null,
  Switch: ({
    value,
    onValueChange,
    disabled,
  }: {
    value: boolean;
    onValueChange: (v: boolean) => void;
    disabled?: boolean;
  }) =>
    createElement("input", {
      type: "checkbox",
      checked: value,
      disabled,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onValueChange(e.target.checked),
    }),
}));
vi.mock("react-native", () => {
  const Box = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const Pressable = ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    );
  const TextInput = ({
    value,
    onChangeText,
    placeholder,
    editable,
  }: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    editable?: boolean;
  }) => {
    if (placeholder === "Название напоминания") m.nameChange = vi.fn(onChangeText);
    return createElement("input", {
      value,
      "aria-label": placeholder,
      disabled: editable === false,
      readOnly: true,
    });
  };
  const Modal = ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
    visible ? createElement("div", null, children) : null;
  return {
    View: Box,
    ScrollView: Box,
    Pressable,
    TextInput,
    Modal,
    StyleSheet: { create: (o: unknown) => o },
    Alert: { alert: vi.fn() },
    Platform: { OS: "android" },
  };
});
import {
  RemindersV49AG4ReviewScreen,
  default as RemindersScreen,
} from "../../../app/(main)/reminders";
import {
  createReminderV49AG4Review,
  type V49AG4Record,
  type V49AG4MockStore,
} from "./reminderV49AG4Compat.review";
const KEY = "4bc11bb9-a9a7-499a-8aa2-86fbeabfa47d";
const row = () => ({
  id: "r1",
  name: "Тренировка",
  reminderTime: "09:00",
  reminderDays: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  enabled: true,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((fn) => (resolve = fn));
  return { resolve, promise };
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  candidate: ReturnType<typeof createReminderV49AG4Review>;
async function render(review = true) {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        review
          ? createElement(RemindersV49AG4ReviewScreen, { candidate })
          : createElement(RemindersScreen),
      ),
    ),
  );
}
async function shown(text: string) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await vi.waitFor(() => expect(host.textContent).toContain(text));
}
function press(label: string) {
  return Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
}
async function fill() {
  await act(async () => m.nameChange(" Тренировка "));
  await act(async () => press("Все дни")?.click());
}
async function submit() {
  await act(async () => press("Добавить")?.click());
}
const HANDLE = "h_" + "a".repeat(32);
let journal: ReturnType<typeof journalMock>;
function journalMock() {
  let row: unknown = null;
  const store: V49AG4MockStore = {
    load: vi.fn(async () => (row === null ? null : JSON.parse(JSON.stringify(row)))),
    reserve: vi.fn(async (next) => {
      if (row !== null) return false;
      row = JSON.parse(JSON.stringify(next));
      return true;
    }),
    cas: vi.fn(async (previous, next) => {
      if (JSON.stringify(previous) !== JSON.stringify(row)) return false;
      row = JSON.parse(JSON.stringify(next));
      return true;
    }),
  };
  return {
    store,
    get: () => row,
    put: (next: unknown) => {
      row = next;
    },
  };
}
function make() {
  return createReminderV49AG4Review({
    store: journal.store,
    scopeHandle: (who) => (who.ownerId === "A" ? HANDLE : "h_" + "b".repeat(32)),
    clock: () => 100000,
    uuidV4: () => KEY,
    postMock: m.post,
    lookupMock: m.lookup,
  });
}
const unknownRow = (): V49AG4Record => ({
  schemaVersion: 2,
  ownerScopeHandle: HANDLE,
  authEpoch: "E1",
  idempotencyKey: KEY,
  phase: "MAY_HAVE_SENT",
  createdAt: 100000,
  lastSeenAt: 100000,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.live = true;
  m.segments = ["(tabs)"];
  m.list.mockReset().mockResolvedValue({ success: true, data: [] });
  m.oldCreate.mockReset().mockResolvedValue({ success: true, data: row() });
  m.post.mockReset().mockResolvedValue({ success: true, data: row() });
  m.lookup.mockReset().mockResolvedValue({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
  journal = journalMock();
  candidate = make();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

describe("AG3 AG4-granted V49 actual RemindersContent injected journal/mock", () => {
  it("normal RemindersScreen remains old keyless even when injected candidate exists", async () => {
    await render(false);
    await shown("Добавить");
    await fill();
    await submit();
    await vi.waitFor(() => expect(m.oldCreate).toHaveBeenCalledOnce());
    expect(m.post).not.toHaveBeenCalled();
    expect(journal.get()).toBeNull();
  });
  it("injected journal makes PREPARED→MAY_HAVE_SENT durably before one POST, exact UI list proof", async () => {
    m.list
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValue({ success: true, data: [row()] });
    m.post.mockImplementation(async (req) => {
      expect(journal.get()).toEqual({ ...unknownRow(), phase: "MAY_HAVE_SENT" });
      expect(req.headers).toEqual({ "Idempotency-Key": KEY });
      return { success: true, data: row() };
    });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Напоминание добавлено");
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.oldCreate).not.toHaveBeenCalled();
    expect((journal.get() as V49AG4Record).phase).toBe("COMMITTED");
    expect(JSON.stringify(journal.get())).not.toMatch(/Тренировка|reminderTime|ownerId|payload/);
  });
  it("storage reserve fault => UI safely blocked; zero mock network, zero new UUID header", async () => {
    journal.store.reserve = vi.fn().mockRejectedValue(new Error("PRIVATE_STORE_ERROR"));
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Отправка заблокирована");
    expect(m.post).not.toHaveBeenCalled();
    expect(m.oldCreate).not.toHaveBeenCalled();
    expect(press("Добавить")?.disabled).toBe(true);
    expect(host.textContent).not.toContain("PRIVATE_STORE_ERROR");
  });
  it("storage restore fault => UI blocked from startup before first POST", async () => {
    journal.store.load = vi.fn().mockRejectedValue(new Error("PRIVATE_READ_FAIL"));
    await render();
    await shown("Безопасное создание недоступно");
    expect(press("Добавить")?.disabled).toBe(true);
    await submit();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("cold restart PREPARED/MAY_HAVE_SENT displays UNKNOWN, disables POST, manual 404 remains unknown", async () => {
    journal.put(unknownRow());
    await render();
    await shown("Проверить операцию");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).not.toHaveBeenCalled();
    expect(m.lookup).not.toHaveBeenCalled();
    await act(async () => press("Проверить операцию")?.click());
    await vi.waitFor(() => expect(m.lookup).toHaveBeenCalledOnce());
    expect(m.lookup.mock.calls[0][0].path).toBe(`/api/v1/reminders/operations/${KEY}`);
    expect(press("Добавить")?.disabled).toBe(true);
    expect((journal.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
    await act(async () => root.unmount());
    root = createRoot(host);
    candidate = make();
    await render();
    await shown("Проверить операцию");
    expect(m.post).not.toHaveBeenCalled();
  });
  it("manual 200 COMMITTED after cold restart records server-only proof, NEVER draft equality", async () => {
    journal.put(unknownRow());
    m.lookup.mockResolvedValueOnce({
      success: true,
      data: { status: "COMMITTED", reminder: row() },
    });
    await render();
    await shown("Проверить операцию");
    await act(async () => press("Проверить операцию")?.click());
    await shown("Сервер подтвердил создание");
    expect(host.textContent).not.toContain("Напоминание подтверждено");
    expect(host.textContent).not.toContain("Исходные поля совпадают");
    expect((journal.get() as V49AG4Record).phase).toBe("SERVER_COMMITTED_UNVERIFIED_DRAFT");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).not.toHaveBeenCalled();
  });
  it("cold restart after persisted server-only proof shows neutral status, no new POST/GET", async () => {
    journal.put({ ...unknownRow(), phase: "SERVER_COMMITTED_UNVERIFIED_DRAFT" });
    await render();
    await shown("Сервер подтвердил создание");
    expect(host.textContent).toContain("Исходные поля после перезапуска не проверены");
    expect(host.textContent).not.toContain(KEY);
    expect(press("Добавить")?.disabled).toBe(true);
    expect(press("Проверить операцию")).toBeUndefined();
    expect(m.post).not.toHaveBeenCalled();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("mock CAS failure after GET200 keeps stored UNKNOWN and fails closed in UI", async () => {
    journal.put(unknownRow());
    m.lookup.mockResolvedValueOnce({
      success: true,
      data: { status: "COMMITTED", reminder: row() },
    });
    journal.store.cas = vi.fn().mockResolvedValue(false);
    await render();
    await shown("Проверить операцию");
    await act(async () => press("Проверить операцию")?.click());
    await vi.waitFor(() => expect(m.lookup).toHaveBeenCalledOnce());
    await shown("Безопасное создание недоступно");
    expect((journal.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
    expect(host.textContent).not.toContain("Сервер подтвердил создание");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).not.toHaveBeenCalled();
  });
  it("unverified session prohibits even manual GET on restored UNKNOWN", async () => {
    journal.put(unknownRow());
    await render();
    await shown("Проверить операцию");
    m.live = false;
    await act(async () => press("Проверить операцию")?.click());
    expect(m.lookup).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
  });
  it("A→B→A/E2 existing journal quarantined, no second POST or private marker in UI", async () => {
    journal.put(unknownRow());
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await shown("Безопасное создание недоступно");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(host.textContent).not.toContain(KEY);
    expect(host.textContent).not.toContain(HANDLE);
    expect(m.post).not.toHaveBeenCalled();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("CAP 400 shows correct rejected text, persists REJECTED, no retry", async () => {
    m.post.mockResolvedValueOnce({ success: false, code: "REMINDER_LIMIT_REACHED" });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Максимум 5 напоминаний");
    expect((journal.get() as V49AG4Record).phase).toBe("REJECTED");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("409 conflict displays terminal message, no owner lookup or re-POST", async () => {
    m.post.mockResolvedValueOnce({ success: false, code: "REMINDER_IDEMPOTENCY_CONFLICT" });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Конфликт операции");
    expect((journal.get() as V49AG4Record).phase).toBe("REJECTED");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("doubletap during async POST only one journal record and one mock POST", async () => {
    const wait = deferred<{ success: boolean; data: ReturnType<typeof row> }>();
    m.post.mockReturnValueOnce(wait.promise);
    await render();
    await shown("Добавить");
    await fill();
    await act(async () => {
      press("Добавить")?.click();
      press("Добавить")?.click();
    });
    await vi.waitFor(() => expect(m.post).toHaveBeenCalledOnce());
    expect((journal.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
    await act(async () => wait.resolve({ success: false, data: row() }));
    await shown("Статус изменения неизвестен");
    expect(m.post).toHaveBeenCalledOnce();
    expect(press("Добавить")?.disabled).toBe(true);
  });
  it("logout/unmount while POST pending never projects private ACK or resets journal", async () => {
    const wait = deferred<{ success: boolean; data: ReturnType<typeof row> }>();
    m.post.mockReturnValueOnce(wait.promise);
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await vi.waitFor(() => expect(m.post).toHaveBeenCalledOnce());
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ success: true, data: row() }));
    expect(m.post).toHaveBeenCalledOnce();
    expect((journal.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
    root = createRoot(host);
  });
});
