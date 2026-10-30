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
  update: vi.fn(),
  remove: vi.fn(),
  post: vi.fn(),
  lookup: vi.fn(),
  haptic: vi.fn(),
  track: vi.fn(),
  nameChange: vi.fn(),
  selectedScrollIndex: 0,
}));
vi.mock("@/shared/lib/api", () => ({
  remindersApi: {
    getAll: (...a: unknown[]) => m.list(...a),
    create: (...a: unknown[]) => m.oldCreate(...a),
    update: (...a: unknown[]) => m.update(...a),
    remove: (...a: unknown[]) => m.remove(...a),
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
  const Scrollable = ({children,onMomentumScrollEnd}:{children?:ReactNode;
    onMomentumScrollEnd?:(event:{nativeEvent:{contentOffset:{y:number}}})=>void}) =>
    createElement("div",{"data-time-column":onMomentumScrollEnd?"true":undefined,
      onClick: onMomentumScrollEnd ? ()=>onMomentumScrollEnd({
        nativeEvent:{contentOffset:{y:m.selectedScrollIndex*44}},
      }) : undefined},children);
  return {
    View: Box,
    ScrollView: Scrollable,
    Pressable,
    TextInput,
    Modal,
    StyleSheet: { create: (o: unknown) => o },
    Alert: { alert: vi.fn() },
    Platform: { OS: "android" },
  };
});
import { RemindersV2ReviewScreen, default as RemindersScreen } from "../../../app/(main)/reminders";
import { createReminderV2ReviewCandidate } from "./reminderV2Candidate";
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
  candidate: ReturnType<typeof createReminderV2ReviewCandidate>;
async function render(review = true) {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        review
          ? createElement(RemindersV2ReviewScreen, { candidate })
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
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.live = true;
  m.segments = ["(tabs)"];
  m.selectedScrollIndex = 0;
  m.list.mockReset().mockResolvedValue({ success: true, data: [] });
  m.oldCreate.mockReset().mockResolvedValue({ success: true, data: row() });
  m.update.mockReset().mockResolvedValue({ success: true, data: row() });
  m.remove.mockReset().mockResolvedValue({ success: true });
  m.post.mockReset().mockResolvedValue({ success: true, data: row() });
  m.lookup.mockReset().mockResolvedValue({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
  candidate = createReminderV2ReviewCandidate({
    uuidV4: () => KEY,
    post: m.post,
    ownerLookupMock: m.lookup,
  });
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
describe("V48 review injection through ACTUAL ordinary RemindersContent", () => {
  it("default production route remains exact keyless remindersApi.create", async () => {
    m.list.mockResolvedValue({ success: true, data: [row()] });
    await render(false);
    await shown("Тренировка");
    await fill();
    await submit();
    await vi.waitFor(() => expect(m.oldCreate).toHaveBeenCalledOnce());
    expect(m.oldCreate.mock.calls[0][0]).toEqual({
      name: "Тренировка",
      reminderTime: "09:00",
      reminderDays: null,
      timezone: row().timezone,
    });
    expect(m.post).not.toHaveBeenCalled();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("injected candidate sends exactly one header mock POST; exact owner list readback required", async () => {
    m.list
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValue({ success: true, data: [row()] });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Напоминание добавлено");
    expect(m.post).toHaveBeenCalledExactlyOnceWith({
      method: "POST",
      path: "/api/v1/reminders",
      headers: { "Idempotency-Key": KEY },
      body: {
        name: "Тренировка",
        reminderTime: "09:00",
        reminderDays: null,
        timezone: row().timezone,
      },
      requestGuard: expect.any(Function),
    });
    expect(m.oldCreate).not.toHaveBeenCalled();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("doubletap while POST pending never allocates second intent/POST", async () => {
    const wait = deferred<{ success: boolean; data: ReturnType<typeof row> }>();
    m.post.mockReturnValueOnce(wait.promise);
    await render();
    await shown("Добавить");
    await fill();
    await act(async () => {
      press("Добавить")?.click();
      press("Добавить")?.click();
    });
    expect(m.post).toHaveBeenCalledOnce();
    await act(async () => wait.resolve({ success: false, data: row() }));
    await shown("Статус изменения неизвестен");
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("400 REMINDER_LIMIT_REACHED is rejected with text, no silent fallback or retry", async () => {
    m.post.mockResolvedValueOnce({ success: false, code: "REMINDER_LIMIT_REACHED" });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Максимум 5 напоминаний");
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.oldCreate).not.toHaveBeenCalled();
    expect(press("Добавить")?.disabled).toBe(true);
  });
  it("409 conflict is terminal, blocks further POST and no auto owner lookup", async () => {
    m.post.mockResolvedValueOnce({ success: false, code: "REMINDER_IDEMPOTENCY_CONFLICT" });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Конфликт операции");
    expect(press("Добавить")?.disabled).toBe(true);
    await submit();
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("timeout/lost ACK unknown: empty owned list alone never retries or unlocks", async () => {
    m.post.mockRejectedValueOnce(new Error("PRIVATE_PAYLOAD"));
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Статус изменения неизвестен");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.lookup).not.toHaveBeenCalled();
    await submit();
    expect(m.post).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("PRIVATE_PAYLOAD");
  });
  it("only injected explicit manual GET 404 remains UNKNOWN, no new POST", async () => {
    m.post.mockRejectedValueOnce(new Error("ACK LOST"));
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Проверить операцию");
    await act(async () => press("Проверить операцию")?.click());
    await vi.waitFor(() => expect(m.lookup).toHaveBeenCalledOnce());
    expect(m.lookup.mock.calls[0][0].path).toBe(`/api/v1/reminders/operations/${KEY}`);
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).toHaveBeenCalledOnce();
  });
  it("manual owner lookup committed + matching refreshed owned list confirms, no repeat POST", async () => {
    m.post.mockRejectedValueOnce(new Error("LOST ACK"));
    let current = false;
    m.list.mockImplementation(async () => ({ success: true, data: current ? [row()] : [] }));
    m.lookup.mockImplementation(async () => {
      current = true;
      return { success: true, data: { status: "COMMITTED", reminder: row() } };
    });
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Проверить операцию");
    await act(async () => press("Проверить операцию")?.click());
    await shown("Напоминание подтверждено");
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.lookup).toHaveBeenCalledOnce();
  });
  it("same-process remount with same UNKNOWN intent never starts a new POST", async () => {
    m.post.mockRejectedValueOnce(new Error("LOST_POST_ACK"));
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await shown("Проверить операцию");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    await shown("Проверить операцию");
    expect(press("Добавить")?.disabled).toBe(true);
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("unmount with pending POST stops late success projection", async () => {
    const wait = deferred<{ success: boolean; data: ReturnType<typeof row> }>();
    m.post.mockReturnValueOnce(wait.promise);
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    await act(async () => root.unmount());
    m.live = false;
    await act(async () => wait.resolve({ success: true, data: row() }));
    expect(m.post).toHaveBeenCalledOnce();
    expect(m.list).toHaveBeenCalledOnce();
    root = createRoot(host);
  });
  it("A→B→A epoch before ACK suppresses stale UI/result", async () => {
    const wait = deferred<{ success: boolean; data: ReturnType<typeof row> }>();
    m.post.mockReturnValueOnce(wait.promise);
    await render();
    await shown("Добавить");
    await fill();
    await submit();
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.post.mock.calls[0][0].requestGuard()).toBe(false);
    await act(async () => wait.resolve({ success: true, data: row() }));
    expect(host.textContent).not.toContain("Напоминание добавлено");
    expect(m.lookup).not.toHaveBeenCalled();
  });
});


describe("AG2 actual production Mobile reminder EDIT original Hono PUT existing form", () => {
  const editButton = () => host.querySelector<HTMLButtonElement>(
    'button[aria-label="Изменить напоминание: Тренировка"]');
  const original = () => ({ ...row(), reminderDays: "1,3", timezone: "Asia/Tokyo" });
  it("editing existing reminder uses old ID, saved timezone, canonical weekdays and fresh owner GET",async()=>{
    let saved=original();
    m.list.mockImplementation(async()=>({success:true,data:[saved]}));
    m.update.mockImplementation(async(id:string,changes:Record<string,unknown>)=>{
      expect(id).toBe("r1");
      saved={...saved,...changes} as typeof saved;
      return {success:true,data:saved};
    });
    await render(false);
    await shown("Тренировка");
    expect(editButton()?.disabled).toBe(false);
    await act(async()=>editButton()?.click());
    await shown("Сохранить изменения");
    expect(host.textContent).toContain("Asia/Tokyo".replace(/_/g," "));
    await act(async()=>m.nameChange(" Вечерняя тренировка "));
    await act(async()=>press("Сохранить изменения")?.click());
    await shown("Напоминание обновлено");
    expect(m.update).toHaveBeenCalledOnce();
    expect(m.update.mock.calls[0][1]).toEqual({
      name:"Вечерняя тренировка",reminderTime:"09:00",
      reminderDays:"1,3",timezone:"Asia/Tokyo",
    });
    expect(m.update.mock.calls[0][2]).toEqual(expect.any(Function));
    expect(m.update.mock.calls[0][2]()).toBe(true);
    expect(m.oldCreate).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.list).toHaveBeenCalledTimes(2);
  });
  it("edit picker changes HH:MM and recurrence days; IANA zone remains old original value",async()=>{
    let saved=original();
    m.list.mockImplementation(async()=>({success:true,data:[saved]}));
    m.update.mockImplementation(async (_id:string,changes:Record<string,unknown>)=>{
      saved={...saved,...changes} as typeof saved;
      return {success:true,data:saved};
    });
    await render(false);await shown("Тренировка");
    await act(async()=>editButton()?.click());
    const timeButton=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Выбрать время: 09:00"]');
    expect(timeButton).not.toBeNull();
    await act(async()=>timeButton?.click());
    const columns=host.querySelectorAll<HTMLElement>('[data-time-column="true"]');
    expect(columns).toHaveLength(2);
    m.selectedScrollIndex=17;
    await act(async()=>columns[0]?.click());
    m.selectedScrollIndex=45;
    await act(async()=>columns[1]?.click());
    await act(async()=>press("Готово")?.click());
    await act(async()=>press("Пн")?.click());
    await act(async()=>press("Ср")?.click());
    await act(async()=>press("Вт")?.click());
    await act(async()=>press("Пт")?.click());
    await act(async()=>press("Сохранить изменения")?.click());
    await shown("Напоминание обновлено");
    expect(m.update).toHaveBeenCalledExactlyOnceWith("r1",{
      name:"Тренировка",reminderTime:"17:45",reminderDays:"2,5",
      timezone:"Asia/Tokyo",
    },expect.any(Function));
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("cancel edit performs no PUT/POST and does not destroy persisted schedule",async()=>{
    m.list.mockResolvedValue({success:true,data:[original()]});
    await render(false);await shown("Тренировка");
    await act(async()=>editButton()?.click());
    await shown("Сохранить изменения");
    await act(async()=>press("Отменить редактирование")?.click());
    expect(press("Добавить")).toBeDefined();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
  it("unknown PUT network result blocks second save and clears no server state",async()=>{
    m.list.mockResolvedValue({success:true,data:[original()]});
    m.update.mockRejectedValueOnce(Error("REMOTE_PRIVATE_ERR"));
    await render(false);await shown("Тренировка");
    await act(async()=>editButton()?.click());
    await act(async()=>m.nameChange("Другое"));
    await act(async()=>press("Сохранить изменения")?.click());
    await shown("Статус изменения неизвестен");
    expect(m.update).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("REMOTE_PRIVATE_ERR");
    await act(async()=>press("Сохранить изменения")?.click());
    expect(m.update).toHaveBeenCalledOnce();
  });
  it("late PUT after A→B→A epoch change never reads or projects old owner result",async()=>{
    m.list.mockResolvedValue({success:true,data:[original()]});
    const pending=deferred<{success:boolean;data:ReturnType<typeof original>}>();
    m.update.mockReturnValueOnce(pending.promise);
    await render(false);await shown("Тренировка");
    await act(async()=>editButton()?.click());
    await act(async()=>m.nameChange("Другой график"));
    await act(async()=>press("Сохранить изменения")?.click());
    expect(m.update).toHaveBeenCalledOnce();
    const reads=m.list.mock.calls.length;
    m.owner="B";m.epoch="B1";
    m.owner="A";m.epoch="E2";
    await render(false);
    expect(m.update.mock.calls[0][2]()).toBe(false);
    await act(async()=>pending.resolve({success:true,data:original()}));
    expect(m.list.mock.calls).toHaveLength(reads+1);
    expect(host.textContent).not.toContain("Напоминание обновлено");
  });
  it("current readback with mismatch never confirms and never automatically repeats PUT",async()=>{
    m.list.mockResolvedValue({success:true,data:[original()]});
    m.update.mockResolvedValueOnce({success:true,data:{...original(),name:"wrong"}});
    await render(false);await shown("Тренировка");
    await act(async()=>editButton()?.click());
    await act(async()=>m.nameChange("Новое имя"));
    await act(async()=>press("Сохранить изменения")?.click());
    await shown("Статус изменения неизвестен");
    expect(m.update).toHaveBeenCalledOnce();
    expect(m.oldCreate).not.toHaveBeenCalled();
  });
});
