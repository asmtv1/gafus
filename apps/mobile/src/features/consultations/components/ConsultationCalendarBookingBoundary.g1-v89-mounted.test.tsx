// @vitest-environment jsdom
/** Actual Mobile booking-confirm screen. Only platform UI, navigation, native queue and API mocked. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { resetBookingAttemptForTests, currentBookingAttempt } from "../lib/bookingAttemptSession";
const m = vi.hoisted(() => ({
  owner: "A",
  slotId: "slotA",
  params: null as null | Record<string, string>,
  calendar: vi.fn(),
  paywall: vi.fn(),
  bookingDenied: vi.fn(),
  navOptions: vi.fn(),
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  verify: vi.fn(),
  book: vi.fn(),
  my: vi.fn(),
  uuid: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
  log: vi.fn(),
  disk: new Map<string, string>(),
  readFault: false,
  writeFault: false,
  afterWriteFault: false,
  readbackFault: false,
  readCount: 0,
  writeBarrier: null as Promise<void> | null,
  writeEntered: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const box = (tag: string) => (p: Record<string, unknown>) =>
    React.createElement(
      tag,
      {
        onClick: p.onPress as (() => void) | undefined,
        "aria-label": p.accessibilityLabel,
        disabled: p.disabled,
      },
      p.children as React.ReactNode,
    );
  return {
    Alert: { alert: (...a: unknown[]) => m.alert(...a) },
    FlatList: box("div"),
    View: box("div"),
    Pressable: box("div"),
    ScrollView: box("div"),
    KeyboardAvoidingView: box("div"),
    Platform: { OS: "ios" },
    StyleSheet: { create: (x: unknown) => x },
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    Button: ({
      children,
      onPress,
      disabled,
      loading,
    }: {
      children: React.ReactNode;
      onPress: () => void;
      disabled?: boolean;
      loading?: boolean;
    }) =>
      React.createElement(
        "button",
        { "data-paper": true, onClick: onPress, disabled: disabled || loading },
        children,
      ),
  };
});
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: ({ onPress, label = "Назад" }: { onPress: () => void; label?: string }) =>
      React.createElement("button", { onClick: onPress }, label),
    TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
const fixture: Record<string, string> = {
  "Имя владельца *": "Анна",
  "Номер телефона для связи *": "+79991234567",
  "Имя питомца *": "Бим",
  "Возраст питомца *": "2 года",
  "Порода *": "Корги",
  "Проблема *": "Хочется снизить возбуждение",
  "Как пытались решить сами *": "Пробовали дома",
};
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Loading: () => React.createElement("span", null, "Загрузка свободного времени"),
    Input: ({
      label,
      onChangeText,
      value,
    }: {
      label: string;
      onChangeText: (v: string) => void;
      value: string;
    }) =>
      React.createElement(
        "button",
        { "data-input": label, onClick: () => onChangeText(fixture[label] ?? "") },
        label + ": " + value,
      ),
    Button: ({
      label,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      React.createElement(
        "button",
        {
          "data-label": label,
          "aria-label": accessibilityLabel ?? label,
          onClick: onPress,
          disabled,
        },
        label,
      ),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      m.readCount += 1;
      if (
        m.readFault ||
        (m.readbackFault && [...m.disk.keys()].some((x) => x.includes("booking-tombstone")))
      )
        throw Error("READ_FAULT");
      return m.disk.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (m.writeBarrier) {
        m.writeEntered();
        await m.writeBarrier;
      }
      if (m.writeFault) throw Error("DISK_FULL");
      m.disk.set(key, value);
      if (m.afterWriteFault) throw Error("COMMIT_THEN_ACK_LOST");
    },
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => m.uuid() }));
vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Stack: { Screen: () => null },
    useLocalSearchParams: () =>
      m.params ?? {
        cynologistUserId: "cynoA",
        slotId: m.slotId,
        startAtUtc: "2026-10-19T09:00:00Z",
        endAtUtc: "2026-10-19T09:30:00Z",
        cynologistName: "Кинолог",
      },
    useNavigation: () => ({ setOptions: (...a: unknown[]) => m.navOptions(...a) }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(cb, [cb]);
    },
    useRouter: () => ({ replace: m.replace, push: m.push, back: m.back }),
  };
});
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{
      user: { id: string } | null;
      isAuthenticated: boolean;
      isLoading: boolean;
    }>(() => ({ user: { id: "A" }, isAuthenticated: true, isLoading: false })),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch, schemaVersion: 2 }),
  },
}));
vi.mock("@/shared/lib/api", () => ({
  consultationsApi: {
    verifySlotFree: (...a: unknown[]) => m.verify(...a),
    getSlotsCalendar: (...a: unknown[]) => m.calendar(...a),
    book: (...a: unknown[]) => m.book(...a),
    myBookings: (...a: unknown[]) => m.my(...a),
  },
  isSubscriptionRequiredCode: () => false,
}));
vi.mock("../lib/consultationAccessPaywall", () => ({
  openConsultationAccessPaywall: () => m.paywall(),
  showConsultationBookingNotIncludedAlert: () => m.bookingDenied(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.log(...a) }));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { light: vi.fn(), medium: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/features/consultations", async () => ({
  ...(await import("../lib/bookingIntakeForm")),
  ...(await import("../lib/bookingAttemptSession")),
  ...(await import("../lib/bookingAttemptResolution")),
  bookingDurableNative: (await import("../lib/bookingDurableNative")).bookingDurableNative,
  SLOT_TAKEN_MESSAGE: "Слот занят",
  openConsultationAccessPaywall: vi.fn(),
  showConsultationBookingNotIncludedAlert: vi.fn(),
}));
import { useAuthStore } from "@/shared/stores/authStore";
import BookingScreen from "../../../../app/(main)/consultations/booking-confirm";
import { ConsultationSlotsCalendar } from "./ConsultationSlotsCalendar";
import {
  consultationBookingCalendarWindowMsk,
  consultationMskDayKey,
  formatConsultationConfirmSlotMsk,
} from "@gafus/consultation-shared";

let root: Root, node: HTMLDivElement, query: QueryClient;
const windowMsk = consultationBookingCalendarWindowMsk(14);
const startAtUtc = new Date(`${windowMsk.fromKey}T12:00:00+03:00`).toISOString();
const endAtUtc = new Date(`${windowMsk.fromKey}T12:45:00+03:00`).toISOString();
const slot = () => ({ id: "slotA", startAtUtc, endAtUtc, status: "FREE" as const });
const secondStartUtc = new Date(new Date(startAtUtc).getTime() + 86_400_000).toISOString();
const secondEndUtc = new Date(new Date(endAtUtc).getTime() + 86_400_000).toISOString();
const secondSlot = () => ({
  id: "slotB",
  startAtUtc: secondStartUtc,
  endAtUtc: secondEndUtc,
  status: "FREE" as const,
});
const calendarResponse = () => ({
  success: true,
  data: [slot()],
  dayOffDates: [],
  bookingEligibility: { canBook: true },
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function mountCalendar(trainer = "cynoA") {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: query },
        createElement(ConsultationSlotsCalendar, {
          cynologistUserId: trainer,
          slotDurationMin: 45,
          displayName: "Кинолог Один & друзья",
        }),
      ),
    ),
  );
  await flush();
}
async function clickAvailable(times = 1) {
  await vi.waitFor(() =>
    expect(node.querySelector('[aria-label^="Выбрать слот "]')).not.toBeNull(),
  );
  const b = node.querySelector<HTMLButtonElement>('[aria-label^="Выбрать слот "]')!;
  await act(async () => {
    for (let i = 0; i < times; i++) b.click();
  });
  await flush();
}
async function transitionFromCalendarToActualConfirm(expected = slot()) {
  expect(m.push).toHaveBeenCalledOnce();
  const href = m.push.mock.calls[0][0] as string;
  const url = new URL(href, "https://local.test");
  expect(url.pathname).toBe("/consultations/booking-confirm");
  expect([...url.searchParams.keys()].sort()).toEqual(
    ["cynologistUserId", "cynologistName", "endAtUtc", "slotId", "startAtUtc"].sort(),
  );
  m.params = Object.fromEntries(url.searchParams) as Record<string, string>;
  expect(m.params).toEqual({
    cynologistUserId: "cynoA",
    slotId: expected.id,
    startAtUtc: expected.startAtUtc,
    endAtUtc: expected.endAtUtc,
    cynologistName: "Кинолог Один & друзья",
  });
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client: query }, createElement(BookingScreen)),
    ),
  );
  await flush();
  expect(node.textContent).toContain("Подтверждение записи");
  expect(node.textContent).toContain("Кинолог Один & друзья");
  expect(node.textContent).toContain(
    formatConsultationConfirmSlotMsk(expected.startAtUtc, expected.endAtUtc),
  );
  return href;
}
async function fillForm() {
  for (const label of Object.keys(fixture)) {
    const b = Array.from(node.querySelectorAll<HTMLButtonElement>("button[data-input]")).find(
      (x) => x.getAttribute("data-input") === label,
    );
    expect(b, `missing ${label}`).toBeDefined();
    await act(async () => b!.click());
  }
  const male = Array.from(node.querySelectorAll<HTMLButtonElement>("button[data-label]")).find(
    (x) => x.getAttribute("data-label") === "Мальчик",
  );
  expect(male).toBeDefined();
  await act(async () => male!.click());
  await flush();
}
async function bookOnce(times = 1) {
  const b = Array.from(node.querySelectorAll<HTMLButtonElement>("button[data-paper]")).find((x) =>
    x.textContent?.includes("Забронировать"),
  );
  expect(b).toBeDefined();
  await act(async () => {
    for (let i = 0; i < times; i++) b!.click();
  });
  await flush();
}
const userFixture = (id: string) => ({
  id,
  username: id.toLowerCase(),
  phone: null,
  email: null,
  role: "USER" as const,
});
async function actor(owner: string, epoch: string) {
  m.owner = owner;
  m.epoch = epoch;
  await act(async () =>
    useAuthStore.setState({
      user: owner ? userFixture(owner) : null,
      isAuthenticated: !!owner,
      isLoading: false,
    }),
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetBookingAttemptForTests();
  vi.clearAllMocks();
  m.disk.clear();
  m.readFault = false;
  m.writeFault = false;
  m.afterWriteFault = false;
  m.readbackFault = false;
  m.readCount = 0;
  m.writeBarrier = null;
  m.owner = "A";
  m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
  m.slotId = "slotA";
  m.params = null;
  useAuthStore.setState({ user: userFixture("A"), isAuthenticated: true, isLoading: false });
  m.calendar.mockReset().mockResolvedValue(calendarResponse());
  m.verify.mockReset().mockResolvedValue({ success: true });
  m.book.mockReset();
  m.my.mockReset().mockResolvedValue({ success: true, data: { items: [], nextCursor: null } });
  m.uuid
    .mockReset()
    .mockReturnValueOnce("e3519bbb-9e37-4eb2-bdd7-060268c5b66c")
    .mockReturnValueOnce("a5626a73-405d-496e-b458-2368987c4d21");
  query = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  query.clear();
  node.remove();
  resetBookingAttemptForTests();
});
describe("V89 actual calendar→booking-confirm routed slot identity and durable attempt boundary", () => {
  it("eligible FREE+GET verify ACK transfers exact trainer/slot/MSK times into actual confirmation without booking", async () => {
    await mountCalendar();
    await clickAvailable();
    expect(m.verify).toHaveBeenCalledExactlyOnceWith("cynoA", "slotA");
    await transitionFromCalendarToActualConfirm();
    expect(m.book).not.toHaveBeenCalled();
    expect(currentBookingAttempt("A", m.epoch, "cynoA", "slotA")).toBeNull();
    expect(m.disk.size).toBe(0);
  });
  it("selecting next MSK calendar day transfers second FREE slot and its precise UTC interval", async () => {
    m.calendar.mockResolvedValueOnce({
      success: true,
      data: [slot(), secondSlot()],
      dayOffDates: [],
      bookingEligibility: { canBook: true },
    });
    await mountCalendar();
    await vi.waitFor(() =>
      expect(node.querySelector('[aria-label^="Выбрать слот "]')).not.toBeNull(),
    );
    const secondKey = consultationMskDayKey(new Date(secondStartUtc));
    const firstKey = consultationMskDayKey(new Date(startAtUtc));
    // This fixture intentionally spans two consecutive MSK days. On the
    // 31st they belong to different visible calendar months, so navigate
    // to the following month before choosing the second FREE slot.
    if (secondKey.slice(0, 7) !== firstKey.slice(0, 7)) {
      const header = Array.from(node.querySelectorAll<HTMLDivElement>("div")).find(
        el => el.children.length === 3 &&
          el.children[0]?.textContent === "<" &&
          el.children[2]?.textContent === ">",
      );
      expect(header, "missing calendar month navigation").toBeDefined();
      await act(async () => (header!.children[2] as HTMLElement).click());
    }
    const secondDay = Number(secondKey.slice(-2));
    const secondDayCell = () => Array.from(node.querySelectorAll<HTMLDivElement>("div")).find(
      el => el.children.length === 2 &&
        el.children[0]?.textContent === String(secondDay) &&
        el.children[1]?.textContent === "1 св.",
    );
    await vi.waitFor(() => expect(secondDayCell(),
      "missing second selectable MSK day cell").toBeDefined());
    await act(async () => secondDayCell()!.click());
    await vi.waitFor(() =>
      expect(node.querySelector('[aria-label^="Выбрать слот "]')).not.toBeNull(),
    );
    await clickAvailable();
    expect(m.verify).toHaveBeenCalledExactlyOnceWith("cynoA", "slotB");
    await transitionFromCalendarToActualConfirm(secondSlot());
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(0);
    m.book.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
    await fillForm();
    await bookOnce();
    expect(m.book).toHaveBeenCalledOnce();
    const body = m.book.mock.calls[0][0] as { slotId: string; idempotencyKey: string };
    expect(body.slotId).toBe("slotB");
    expect(currentBookingAttempt("A", m.epoch, "cynoA", "slotB")?.body).toBe(body);
    expect([...m.disk.values()].map((v) => JSON.parse(v))).toEqual([
      expect.objectContaining({
        ownerId: "A",
        authEpoch: m.epoch,
        idempotencyKey: body.idempotencyKey,
        state: "UNKNOWN",
      }),
    ]);
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("calendar doubletap, confirm doubletap preserve one frozen intent using exact transferred slot and durable UNKNOWN", async () => {
    const verify = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(verify.promise);
    await mountCalendar();
    await clickAvailable(2);
    expect(m.verify).toHaveBeenCalledTimes(1);
    expect(m.push).not.toHaveBeenCalled();
    await act(async () => verify.resolve({ success: true }));
    await flush();
    await transitionFromCalendarToActualConfirm();
    const post = deferred<{ success: boolean; code?: string }>();
    m.book.mockReturnValueOnce(post.promise);
    await fillForm();
    await bookOnce(2);
    expect(m.book).toHaveBeenCalledOnce();
    const body = m.book.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      slotId: "slotA",
      idempotencyKey: "e3519bbb-9e37-4eb2-bdd7-060268c5b66c",
      clientOwnerName: "Анна",
      petName: "Бим",
      clientPhone: "+79991234567",
    });
    expect(Object.isFrozen(body)).toBe(true);
    expect(m.verify).toHaveBeenCalledWith("cynoA", "slotA");
    const disk = [...m.disk.values()];
    expect(disk).toHaveLength(1);
    const tombstone = JSON.parse(disk[0]);
    expect(tombstone).toMatchObject({
      ownerId: "A",
      authEpoch: m.epoch,
      idempotencyKey: body.idempotencyKey,
      state: "UNKNOWN",
    });
    expect(JSON.stringify(tombstone)).not.toMatch(/slotA|cynoA|Анна|Бим|clientPhone|petName/);
    await act(async () => post.resolve({ success: false, code: "REQUEST_TIMEOUT" }));
    await flush();
    expect(node.textContent).toContain("Результат отправки записи не подтверждён");
    await bookOnce();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("confirmed calendar URL and booking submit reverify known TAKEN never write durable or POST", async () => {
    await mountCalendar();
    await clickAvailable();
    await transitionFromCalendarToActualConfirm();
    await fillForm();
    m.verify.mockResolvedValueOnce({ success: false, code: "CONSULTATION_SLOT_TAKEN" });
    await bookOnce();
    expect(m.verify).toHaveBeenCalledWith("cynoA", "slotA");
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(0);
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledWith("Слот занят", expect.any(String));
  });
  it("positive booking ACK from transferred slot creates exact CONFIRMED owner/epoch durable marker", async () => {
    await mountCalendar();
    await clickAvailable();
    await transitionFromCalendarToActualConfirm();
    m.book.mockResolvedValueOnce({
      success: true,
      data: { kind: "created", booking: { id: "booking-confirmed" } },
    });
    await fillForm();
    await bookOnce(2);
    expect(m.book).toHaveBeenCalledOnce();
    const body = m.book.mock.calls[0][0] as { slotId: string; idempotencyKey: string };
    expect(body.slotId).toBe("slotA");
    const persisted = [...m.disk.values()].map((value) => JSON.parse(value));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      ownerId: "A",
      authEpoch: m.epoch,
      idempotencyKey: body.idempotencyKey,
      state: "CONFIRMED",
    });
    expect(Object.keys(persisted[0]).sort()).toEqual([
      "authEpoch",
      "createdAt",
      "idempotencyKey",
      "ownerId",
      "state",
      "version",
    ]);
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("/(main)/(tabs)/consultations?view=mine");
  });
  it("A→B→A new epoch while calendar verification pending cannot hand off to stale confirmation", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mountCalendar();
    await clickAvailable();
    await actor("B", "B-E1");
    await actor("A", "A-E2");
    await act(async () => d.resolve({ success: true }));
    expect(m.push).not.toHaveBeenCalled();
    expect(m.book).not.toHaveBeenCalled();
  });
  it("trainer A→B→A props while verification pending do not leak previous trainer or slot", async () => {
    const d = deferred<{ success: boolean }>();
    m.verify.mockReturnValueOnce(d.promise);
    await mountCalendar();
    await clickAvailable();
    await mountCalendar("trainer-B");
    await mountCalendar("cynoA");
    await act(async () => d.resolve({ success: true }));
    expect(m.push).not.toHaveBeenCalled();
    expect(m.book).not.toHaveBeenCalled();
  });
  it("known TAKEN verify stops before confirmation and before intent/durable write", async () => {
    m.verify.mockResolvedValueOnce({ success: false, code: "CONSULTATION_SLOT_TAKEN" });
    await mountCalendar();
    await clickAvailable();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(0);
    expect(m.alert).toHaveBeenCalledWith("Слот занят", expect.any(String));
  });
  it("UNKNOWN verify cannot navigate, submit booking or auto reverify in this calendar session", async () => {
    m.verify.mockRejectedValueOnce(new Error("Bearer secret signed URL"));
    await mountCalendar();
    await clickAvailable();
    await clickAvailable();
    expect(m.verify).toHaveBeenCalledTimes(1);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(0);
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("Bearer secret signed URL");
  });
  it("free slot cannot bypass verified actor on guest calendar", async () => {
    await actor("", "");
    await mountCalendar();
    expect(m.calendar).not.toHaveBeenCalled();
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.book).not.toHaveBeenCalled();
  });
  it("confirmed calendar handoff then owner epoch change before booking blocks any POST and cannot steal prior intent", async () => {
    await mountCalendar();
    await clickAvailable();
    await transitionFromCalendarToActualConfirm();
    await fillForm();
    await actor("B", "B-E1");
    await actor("A", "A-E2");
    await bookOnce();
    expect(m.book).not.toHaveBeenCalled();
  });
});
