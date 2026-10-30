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
      { onClick: p.onPress as (() => void) | undefined },
      p.children as React.ReactNode,
    );
  return {
    Alert: { alert: (...a: unknown[]) => m.alert(...a) },
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
    Text: ({ children, ...rest }: { children: React.ReactNode }) =>
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
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => React.createElement("button", { "data-label": label, onClick: onPress, disabled }, label),
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
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    cynologistUserId: "cynoA",
    slotId: m.slotId,
    startAtUtc: "2026-10-19T09:00:00Z",
    endAtUtc: "2026-10-19T09:30:00Z",
    cynologistName: "Кинолог",
  }),
  useRouter: () => ({ replace: m.replace, push: m.push, back: m.back }),
}));
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create<{ user: { id: string } | null }>(() => ({ user: { id: "A" } })) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch, schemaVersion: 2 }),
  },
}));
vi.mock("@/shared/lib/api", () => ({
  consultationsApi: {
    verifySlotFree: (...a: unknown[]) => m.verify(...a),
    book: (...a: unknown[]) => m.book(...a),
    myBookings: (...a: unknown[]) => m.my(...a),
  },
  isSubscriptionRequiredCode: () => false,
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
let root: Root, node: HTMLDivElement, query: QueryClient;
function deferred<T>() {
  let resolve!: (value: T) => void;
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
async function mount() {
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client: query }, createElement(BookingScreen)),
    ),
  );
  await flush();
}
async function fill() {
  for (const label of Object.keys(fixture)) {
    const button = Array.from(node.querySelectorAll("button[data-input]")).find(
      (x) => x.getAttribute("data-input") === label,
    );
    expect(button, `missing ${label}`).not.toBeUndefined();
    await act(async () => {
      (button as HTMLButtonElement).click();
    });
  }
  const boy = Array.from(node.querySelectorAll("button[data-label]")).find(
    (x) => x.getAttribute("data-label") === "Мальчик",
  );
  expect(boy).not.toBeUndefined();
  await act(async () => {
    (boy as HTMLButtonElement).click();
  });
  await flush();
}
async function clickBook(times = 1) {
  const button = Array.from(node.querySelectorAll("button[data-paper]")).find((x) =>
    x.textContent?.includes("Забронировать"),
  ) as HTMLButtonElement;
  expect(button).toBeTruthy();
  await act(async () => {
    for (let i = 0; i < times; i++) button.click();
    await Promise.resolve();
  });
  await flush();
}
async function remount() {
  await act(async () => root.unmount());
  root = createRoot(node);
  await mount();
}
const unknown = "Результат отправки записи не подтверждён";
describe("real booking-confirm form → verify → JSON POST / lost ACK / session lifecycle", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetBookingAttemptForTests();
    m.disk.clear();
    m.readFault = false;
    m.writeFault = false;
    m.afterWriteFault = false;
    m.readbackFault = false;
    m.readCount = 0;
    m.writeBarrier = null;
    vi.clearAllMocks();
    m.owner = "A";
    m.slotId = "slotA";
    m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
    useAuthStore.setState({ user: { id: "A" } as never });
    m.uuid.mockReset();
    m.uuid
      .mockReturnValueOnce("e3519bbb-9e37-4eb2-bdd7-060268c5b66c")
      .mockReturnValueOnce("a5626a73-405d-496e-b458-2368987c4d21");
    m.verify.mockResolvedValue({ success: true });
    m.my.mockResolvedValue({ success: true, data: { items: [], nextCursor: null } });
    query = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
    await mount();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    query.clear();
    node.remove();
  });
  it("double tap sends exactly one frozen JSON snapshot with UUIDv4, lost ACK remains unknown after remount, no automatic POST", async () => {
    const book = deferred<{ success: boolean; code?: string }>();
    m.book.mockReturnValue(book.promise);
    await fill();
    await clickBook(2);
    expect(m.book).toHaveBeenCalledTimes(1);
    const body = m.book.mock.calls[0][0];
    expect(body).toMatchObject({
      slotId: "slotA",
      idempotencyKey: "e3519bbb-9e37-4eb2-bdd7-060268c5b66c",
      clientOwnerName: "Анна",
      clientPhone: "+79991234567",
      petName: "Бим",
    });
    expect(Object.isFrozen(body)).toBe(true);
    await act(async () => book.resolve({ success: false, code: "REQUEST_TIMEOUT" }));
    await flush();
    expect(node.textContent).toContain(unknown);
    expect(node.textContent).toContain("Отсутствие записи");
    expect(m.replace).not.toHaveBeenCalled();
    await remount();
    expect(node.textContent).toContain(unknown);
    expect(m.uuid).toHaveBeenCalledTimes(1);
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.my).not.toHaveBeenCalled();
    const check = Array.from(node.querySelectorAll("button")).find(
      (x) => x.textContent === "Проверить мои консультации",
    );
    await act(async () => {
      (check as HTMLButtonElement).click();
    });
    expect(m.push).toHaveBeenCalledWith("/consultations/mine");
  });
  it("late ACK after unmount and A→B never navigates nor invalidates cache; B starts a new scoped UUID", async () => {
    const result = deferred<{ success: boolean; data?: unknown }>();
    m.book
      .mockImplementationOnce(() => result.promise)
      .mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    const invalidate = vi.spyOn(query, "invalidateQueries");
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(node);
    m.owner = "B";
    m.epoch = "c2648ff7-5b3a-4c81-9bde-5721889a8e2a";
    useAuthStore.setState({ user: { id: "B" } as never });
    await mount();
    await act(async () =>
      result.resolve({ success: true, data: { kind: "created", booking: { id: "bookingA" } } }),
    );
    await flush();
    expect(m.replace).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(node.textContent).not.toContain(unknown);
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(2);
    expect(m.book.mock.calls[1][0].idempotencyKey).not.toBe(m.book.mock.calls[0][0].idempotencyKey);
  });
  it("same owner fresh authEpoch fences pending POST and unknown is not assigned to E2", async () => {
    const post = deferred<{ success: boolean; data?: unknown }>();
    m.book.mockReturnValue(post.promise);
    await fill();
    await clickBook();
    m.epoch = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
    useAuthStore.setState({ user: { id: "A" } as never });
    await mount();
    await act(async () =>
      post.resolve({ success: true, data: { kind: "created", booking: { id: "b1" } } }),
    );
    await flush();
    expect(m.replace).not.toHaveBeenCalled();
    expect(node.textContent).not.toContain(unknown);
  });
  it("server 404 after POST is not proof of missing booking and never triggers a second POST", async () => {
    m.book.mockResolvedValue({ success: false, code: "CONSULTATION_NOT_FOUND", error: "404" });
    await fill();
    await clickBook();
    expect(node.textContent).toContain(unknown);
    expect(node.textContent).toContain("не доказывает");
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("unknown slotA blocks booking another slot of A/E1; owner-scoped warning survives remount", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    m.slotId = "slotB";
    await remount();
    expect(node.textContent).toContain("Предыдущая запись ещё не подтверждена");
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.uuid).toHaveBeenCalledTimes(1);
  });
  it("captured requestGuard fences JSON POST before 401 replay if profile or epoch changes", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    const guard = m.book.mock.calls[0][1] as () => boolean;
    expect(guard()).toBe(true);
    m.epoch = "ed798a44-5c37-4eb8-86c3-59d3121bbaab";
    expect(guard()).toBe(false);
  });
  it("cold-process restart restores UNKNOWN in A/E1 without in-memory intent, never silently rebooks", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    const entry = [...m.disk.entries()].find(([k]) => k.includes("booking-tombstone-v1:"));
    expect(entry).toBeDefined();
    const record = JSON.parse(entry![1]);
    expect(record).toMatchObject({
      ownerId: "A",
      authEpoch: m.epoch,
      idempotencyKey: "e3519bbb-9e37-4eb2-bdd7-060268c5b66c",
      state: "UNKNOWN",
    });
    expect(Object.keys(record).sort()).toEqual([
      "authEpoch",
      "createdAt",
      "idempotencyKey",
      "ownerId",
      "state",
      "version",
    ]);
    expect(entry![1]).not.toMatch(
      /Анна|Бим|799912|petName|clientPhone|clientProblem|slotId|refreshToken|accessToken/,
    );
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).toContain("Обнаружена сохранённая неподтверждённая попытка записи");
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.uuid).toHaveBeenCalledTimes(1);
  });
  it("AsyncStorage write fault blocks POST and shows manual local-check recovery only", async () => {
    m.writeFault = true;
    await fill();
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    expect(node.textContent).toContain("Не удалось проверить локальное состояние бронирования");
    expect(m.disk.size).toBe(0);
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    m.writeFault = false;
    const retry = Array.from(node.querySelectorAll("button")).find(
      (x) => x.textContent === "Проверить локальную запись",
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    await act(async () => retry.click());
    await flush();
    expect(node.textContent).not.toContain("Не удалось проверить локальное состояние бронирования");
  });
  it("persisted bytes followed by lost storage ACK/readback failure block POST; cold restart shows UNKNOWN", async () => {
    m.afterWriteFault = true;
    await fill();
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(1);
    resetBookingAttemptForTests();
    m.afterWriteFault = false;
    await remount();
    expect(node.textContent).toContain("Обнаружена сохранённая неподтверждённая попытка записи");
    await fill();
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
  });
  it("readback fault after setItem prevents POST and must never mark local save as success", async () => {
    m.readbackFault = true;
    await fill();
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(1);
    expect(node.textContent).toContain("Не удалось проверить локальное состояние бронирования");
    m.readbackFault = false;
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).toContain("Обнаружена сохранённая неподтверждённая попытка записи");
  });
  it("read fault during cold restart fails closed, recovers only by explicit read; does not POST", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    resetBookingAttemptForTests();
    m.readFault = true;
    await remount();
    expect(node.textContent).toContain("Не удалось проверить локальное состояние бронирования");
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    m.readFault = false;
    const retry = Array.from(node.querySelectorAll("button")).find(
      (x) => x.textContent === "Проверить локальную запись",
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    await act(async () => retry.click());
    await flush();
    expect(node.textContent).toContain("Обнаружена сохранённая неподтверждённая попытка записи");
    expect(m.book).toHaveBeenCalledTimes(1);
  });
  it("interrupted AsyncStorage persist while unmount+owner epoch switch cannot start any booking POST", async () => {
    let release!: () => void;
    m.writeBarrier = new Promise<void>((r) => {
      release = r;
    });
    await fill();
    await clickBook();
    expect(m.writeEntered).toHaveBeenCalledTimes(1);
    expect(m.book).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(node);
    m.epoch = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
    useAuthStore.setState({ user: { id: "A" } as never });
    await act(async () => release());
    await flush();
    expect(m.book).not.toHaveBeenCalled();
    const oldKey = [...m.disk.keys()].find((k) => k.includes("booking-tombstone-v1:A:51e35071"));
    expect(oldKey).toBeDefined();
    m.writeBarrier = null;
    resetBookingAttemptForTests();
    await mount();
    expect(node.textContent).not.toContain(
      "Обнаружена сохранённая неподтверждённая попытка записи",
    );
    expect(m.disk.size).toBe(1);
    expect(m.book).not.toHaveBeenCalled();
  });
  it("E1 tombstone remains quarantined on A/E2: no E1 read or user-facing attribution, no migration", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    expect(m.disk.size).toBe(1);
    const oldKey = [...m.disk.keys()][0];
    const old = m.disk.get(oldKey);
    resetBookingAttemptForTests();
    m.epoch = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
    useAuthStore.setState({ user: { id: "A" } as never });
    await remount();
    expect(node.textContent).not.toContain(
      "Обнаружена сохранённая неподтверждённая попытка записи",
    );
    expect(m.disk.get(oldKey)).toBe(old);
    expect(m.book).toHaveBeenCalledTimes(1);
  });
  it("24-hour TTL expiration only changes warning, never treats missing receipt as absence", async () => {
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    const saved = JSON.parse([...m.disk.values()][0]);
    vi.spyOn(Date, "now").mockReturnValue(saved.createdAt + 25 * 3600_000);
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).toContain("Прошло более 24 часов");
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
  it("affirmative server ACK alone turns persisted UNKNOWN into CONFIRMED without clearing E1 bytes", async () => {
    m.book.mockResolvedValue({
      success: true,
      data: { kind: "created", booking: { id: "bookingA" } },
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.replace).toHaveBeenCalledTimes(1);
    const record = JSON.parse([...m.disk.values()][0]);
    expect(record.state).toBe("CONFIRMED");
    expect(record.idempotencyKey).toBe("e3519bbb-9e37-4eb2-bdd7-060268c5b66c");
    expect(Object.keys(record).sort()).toEqual([
      "authEpoch",
      "createdAt",
      "idempotencyKey",
      "ownerId",
      "state",
      "version",
    ]);
  });
  it("positive created ACK → navigate → cold screen reopen with CONFIRMED marker, not UNKNOWN", async () => {
    m.book.mockResolvedValueOnce({
      success: true,
      data: { kind: "created", booking: { id: "bookA" } },
    });
    await fill();
    await clickBook();
    expect(m.replace).toHaveBeenCalledWith("/(main)/(tabs)/consultations?view=mine");
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("CONFIRMED");
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).not.toContain("Найдена неподтверждённая");
    expect(node.textContent).not.toContain("сохранённая неподтверждённая");
    expect(m.book).toHaveBeenCalledTimes(1);
  });
  it.each(["SUBSCRIPTION_REQUIRED", "CONSULTATION_BOOKING_NOT_INCLUDED"])(
    "definite PRE-COMMIT %s is durably REJECTED, no automatic retry; explicit next action uses fresh key",
    async (code) => {
      m.book
        .mockResolvedValueOnce({ success: false, code, error: "Недоступно" })
        .mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
      await fill();
      await clickBook();
      expect(JSON.parse([...m.disk.values()][0]).state).toBe("REJECTED");
      expect(node.textContent).toContain("Предыдущий запрос отклонён до создания брони");
      expect(m.book).toHaveBeenCalledTimes(1);
      await flush();
      expect(m.book).toHaveBeenCalledTimes(1);
      await clickBook();
      expect(m.book).toHaveBeenCalledTimes(2);
      expect(m.book.mock.calls[1][0].idempotencyKey).not.toBe(
        m.book.mock.calls[0][0].idempotencyKey,
      );
      expect(JSON.parse([...m.disk.values()][0]).state).toBe("UNKNOWN");
    },
  );
  it.each([
    "CONSULTATION_NOT_FOUND",
    "CONSULTATION_IDEMPOTENCY_CONFLICT",
    "CONSULTATION_SLOT_TAKEN",
    "REQUEST_TIMEOUT",
    "SUBSCRIPTION_RATE_LIMIT",
  ])(
    "POST %s is NOT safe rejection: remains UNKNOWN even after manual empty my-list/readback",
    async (code) => {
      m.book.mockResolvedValue({ success: false, code });
      await fill();
      await clickBook();
      expect(JSON.parse([...m.disk.values()][0]).state).toBe("UNKNOWN");
      await m.my();
      expect((await m.my()).data.items).toEqual([]);
      resetBookingAttemptForTests();
      await remount();
      expect(node.textContent).toContain("сохранённая неподтверждённая");
      await fill();
      await clickBook();
      expect(m.book).toHaveBeenCalledTimes(1);
    },
  );
  it("storage failure writing CONFIRMED: server ACK known, no navigation; manual LOCAL retry confirms without another POST", async () => {
    m.book.mockImplementationOnce(async () => {
      m.writeFault = true;
      return { success: true, data: { kind: "created", booking: { id: "bookA" } } };
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("UNKNOWN");
    expect(m.replace).not.toHaveBeenCalled();
    expect(node.textContent).toContain(
      "Сервер подтвердил бронирование, но локальная отметка не подтверждена",
    );
    m.writeFault = false;
    const retry = Array.from(node.querySelectorAll("button")).find(
      (x) => x.textContent === "Сохранить подтверждение",
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    await act(async () => retry.click());
    await flush();
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("CONFIRMED");
    expect(m.book).toHaveBeenCalledTimes(1);
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).not.toContain("сохранённая неподтверждённая");
  });
  it("write committed but storage ACK lost while recording CONFIRMED: local retry reads already-confirmed marker", async () => {
    m.book.mockImplementationOnce(async () => {
      m.afterWriteFault = true;
      return { success: true, data: { kind: "idempotent_replay", booking: { id: "bookA" } } };
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("CONFIRMED");
    expect(m.replace).not.toHaveBeenCalled();
    m.afterWriteFault = false;
    const retry = Array.from(node.querySelectorAll("button")).find(
      (x) => x.textContent === "Сохранить подтверждение",
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    await act(async () => retry.click());
    await flush();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("CONFIRMED");
  });
  it("rejection storage failure keeps UNKNOWN (no new key); manual local readback/404 do not authorize retry", async () => {
    m.book.mockImplementationOnce(async () => {
      m.writeFault = true;
      return { success: false, code: "SUBSCRIPTION_REQUIRED" };
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("UNKNOWN");
    m.writeFault = false;
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).toContain("сохранённая неподтверждённая");
  });
  it("late successful ACK during owner/epoch switch cannot durably confirm E1 as E2 or navigate", async () => {
    const post = deferred<{ success: boolean; data?: unknown }>();
    m.book.mockReturnValue(post.promise);
    await fill();
    await clickBook();
    const oldKey = [...m.disk.keys()][0];
    m.epoch = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
    useAuthStore.setState({ user: { id: "A" } as never });
    await mount();
    await act(async () =>
      post.resolve({ success: true, data: { kind: "created", booking: { id: "bookA" } } }),
    );
    await flush();
    expect(m.replace).not.toHaveBeenCalled();
    expect(JSON.parse(m.disk.get(oldKey)!).state).toBe("UNKNOWN");
    expect(m.disk.size).toBe(1);
  });
  it("owner A/E1 → A/E2 while successful ACK's durable CONFIRMED write is suspended cannot navigate or attach E1 receipt", async () => {
    let release!: () => void;
    m.book.mockImplementationOnce(async () => {
      m.writeBarrier = new Promise<void>((r) => {
        release = r;
      });
      return { success: true, data: { kind: "created", booking: { id: "bookA" } } };
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(m.writeEntered).toHaveBeenCalledTimes(1);
    const e1Key = [...m.disk.keys()][0];
    m.epoch = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
    useAuthStore.setState({ user: { id: "A" } as never });
    await mount();
    await act(async () => release());
    await flush();
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(1);
    expect([...m.disk.keys()][0]).toBe(e1Key);
    expect(node.textContent).not.toContain(
      "Сервер подтвердил бронирование, но локальная отметка не подтверждена",
    );
  });
  it("definite rejection persisted but write ACK lost uses verified REJECTED readback, never repeats POST automatically", async () => {
    m.book.mockImplementationOnce(async () => {
      m.afterWriteFault = true;
      return { success: false, code: "SUBSCRIPTION_REQUIRED" };
    });
    await fill();
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
    expect(JSON.parse([...m.disk.values()][0]).state).toBe("REJECTED");
    expect(node.textContent).toContain("Предыдущий запрос отклонён до создания брони");
    m.afterWriteFault = false;
    resetBookingAttemptForTests();
    await remount();
    expect(node.textContent).toContain("Предыдущий запрос отклонён до создания брони");
    expect(m.book).toHaveBeenCalledTimes(1);
  });
  it("client-side invalid intake never creates a durable tombstone or sends booking POST", async () => {
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    expect(m.disk.size).toBe(0);
    expect(node.textContent).toContain("Заполните все обязательные поля");
  });
  it("preflight failure creates NO POST, releases lock for a deliberate retry", async () => {
    m.verify
      .mockResolvedValueOnce({
        success: false,
        code: "VERIFY_FAILED",
        error: "Слот временно недоступен",
      })
      .mockResolvedValue({ success: true });
    m.book.mockResolvedValue({ success: false, code: "REQUEST_TIMEOUT" });
    await fill();
    await clickBook();
    expect(m.book).not.toHaveBeenCalled();
    expect(node.textContent).toContain("Слот временно недоступен");
    await clickBook();
    expect(m.book).toHaveBeenCalledTimes(1);
  });
});
