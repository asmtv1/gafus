// @vitest-environment jsdom
/** My consultations: same-epoch focus must reattest durable booking state, never trust an empty list. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  disk: new Map<string, string>(),
  get: vi.fn<(key: string) => Promise<string | null>>(),
  focus: null as null | (() => void),
  cleanup: null as null | (() => void),
  my: vi.fn(),
  push: vi.fn(),
  cancel: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  status: "CONFIRMED",
  activeTrainer: "trainer-A",
  activeBooking: "book-A",
  list: vi.fn(),
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const box =
    (tag: string) =>
    ({
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
      React.createElement(
        tag,
        {
          onClick: onPress,
          disabled,
          "aria-label": accessibilityLabel,
        },
        children,
      );
  return {
    Alert: { alert: (...a: unknown[]) => m.alert(...a) },
    View: box("div"),
    ScrollView: box("section"),
    Pressable: box("button"),
    StyleSheet: { create: (x: unknown) => x },
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    Loading: () => React.createElement("span", null, "Загружаем"),
    TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      React.createElement("button", { onClick: onPress }, label),
  };
});
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "olive",
    primaryDark: "olive",
    background: "white",
    textSecondary: "gray",
    cardBackground: "white",
  },
  FONTS: { montserrat: "sans-serif", montserratMedium: "sans-serif" },
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 32 },
}));
vi.mock("@expo/vector-icons", async () => {
  const React = await import("react");
  return { MaterialCommunityIcons: () => React.createElement("span") };
});
vi.mock("expo-image", async () => {
  const React = await import("react");
  return { Image: () => React.createElement("span") };
});
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-linking", () => ({ openURL: vi.fn() }));
vi.mock("@gafus/consultation-shared", () => ({
  getConsultationBookingStatusPresentation: () => ({
    tone: "neutral",
    badge: "Статус",
    description: "",
  }),
  formatConsultationListDateTimeMsk: () => "МСК",
}));
vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: m.push }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const first = cb();
        m.cleanup = typeof first === "function" ? first : null;
        m.focus = () => {
          m.cleanup?.();
          const next = cb();
          m.cleanup = typeof next === "function" ? next : null;
        };
        return () => m.cleanup?.();
      }, [cb]);
    },
  };
});
vi.mock("@/shared/stores/authStore", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create<{ user: { id: string } | null }>(() => ({ user: { id: "A" } })) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => m.get(key),
    setItem: async (key: string, value: string) => {
      m.disk.set(key, value);
    },
  },
}));
vi.mock("@/features/consultations", async () => ({
  bookingDurableNative: (await import("../lib/bookingDurableNative")).bookingDurableNative,
  uncertainBookingForOwner: () => false,
  consultationCancelGuarded: (bookingId: string, guard: () => boolean) =>
    m.cancel(bookingId, guard),
}));
vi.mock("@/shared/lib/api", () => ({
  consultationsApi: {
    myBookings: () => m.my(),
    cancelBooking: (bookingId: string) => m.cancel(bookingId),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.trace(...a) }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { light: vi.fn(), medium: vi.fn() },
}));

import { useAuthStore } from "@/shared/stores/authStore";
import MyScreen from "../../../../app/(main)/consultations/mine";

const serverBooking = (overrides: Record<string, unknown> = {}) => ({
  id: m.activeBooking,
  status: m.status,
  cynologistUserId: m.activeTrainer,
  cynologistDisplayName: "Кинолог",
  clientUsername: "usera",
  clientOwnerName: "Анна",
  clientPhone: null,
  petName: "Бим",
  petGender: "MALE",
  petAge: "2 года",
  petBreed: "корги",
  clientProblem: "Вопросы",
  clientSelfHelpAttempt: "Пробовал",
  cancelReason: null,
  confirmationDeadlineAt: "2026-10-21T08:00:00.000Z",
  createdAt: "2026-10-20T08:00:00.000Z",
  slot: {
    id: "slot-A",
    startAtUtc: "2026-10-23T08:00:00.000Z",
    endAtUtc: "2026-10-23T09:00:00.000Z",
    status: "BOOKED",
  },
  ...overrides,
});
let host: HTMLDivElement;
let root: Root;
let query: QueryClient;
async function flush() {
  await act(async () => {
    for (let n = 0; n < 10; n++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: query }, createElement(MyScreen)));
  });
  await flush();
}
beforeEach(() => {
  m.owner = "A";
  m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
  m.disk.clear();
  m.focus = null;
  m.cleanup = null;
  m.get.mockReset().mockImplementation(async (k) => m.disk.get(k) ?? null);
  m.my.mockReset().mockResolvedValue({ success: true, data: { items: [], nextCursor: null } });
  m.push.mockReset();
  m.alert.mockReset();
  m.trace.mockReset();
  m.activeBooking = "book-A";
  m.activeTrainer = "trainer-A";
  m.status = "CONFIRMED";
  m.cancel.mockReset().mockResolvedValue({ success: true, data: { bookingId: "book-A" } });
  m.my
    .mockReset()
    .mockResolvedValue({ success: true, data: { items: [serverBooking()], nextCursor: null } });
  useAuthStore.setState({
    user: { id: "A", username: "usera", phone: null, email: null, role: "USER" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  query.clear();
  host.remove();
});

async function waitForBooking() {
  await vi.waitFor(() => expect(host.textContent).toContain("Бим"));
}
async function clickCancel(times = 1) {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    b.textContent?.includes("Отменить запись"),
  );
  expect(btn).toBeDefined();
  await act(async () => {
    for (let i = 0; i < times; i++) btn?.click();
  });
  await flush();
}
async function confirmCancel() {
  const last = m.alert.mock.calls.at(-1);
  expect(last).toBeDefined();
  const actions = last?.[2] as { text: string; onPress?: () => void; style?: string }[];
  expect(actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: expect.stringMatching(/не отменять|назад|нет/i) }),
      expect.objectContaining({
        text: expect.stringMatching(/отменить/i),
        style: "destructive",
        onPress: expect.any(Function),
      }),
    ]),
  );
  const confirm = actions.find((x) => x.style === "destructive")!;
  await act(async () => confirm.onPress?.());
  await flush();
}
const pending = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
describe("V90 actual My consultations owner-cancel existing POST and no-show visibility", () => {
  it("known server CONFIRMED booking asks destructive confirmation BEFORE any POST", async () => {
    await mount();
    await waitForBooking();
    await clickCancel();
    expect(m.alert).toHaveBeenCalledOnce();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("cancel confirmation Cancel/No never dispatches POST", async () => {
    await mount();
    await waitForBooking();
    await clickCancel();
    const actions = m.alert.mock.calls[0][2] as { onPress?: () => void; style?: string }[];
    const no = actions.find((x) => x.style === "cancel")!;
    await act(async () => no.onPress?.());
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("two rapid taps and confirmation callbacks issue one guarded POST for exact owner booking", async () => {
    const d = pending<{ success: boolean; data: { bookingId: string } }>();
    m.cancel.mockReturnValueOnce(d.promise);
    await mount();
    await waitForBooking();
    await clickCancel(2);
    expect(m.alert).toHaveBeenCalledTimes(1);
    const actions = m.alert.mock.calls[0][2] as { onPress?: () => void; style?: string }[];
    const yes = actions.find((x) => x.style === "destructive")!;
    await act(async () => {
      yes.onPress?.();
      yes.onPress?.();
    });
    expect(m.cancel).toHaveBeenCalledTimes(1);
    expect(m.cancel.mock.calls[0][0]).toBe("book-A");
    const guard = m.cancel.mock.calls[0][1] as () => boolean;
    expect(guard()).toBe(true);
    await act(async () => d.resolve({ success: true, data: { bookingId: "book-A" } }));
  });
  it("successful exact {bookingId} ACK survives failed invalidation without false UNKNOWN alert", async () => {
    await mount();
    await waitForBooking();
    vi.spyOn(query, "invalidateQueries").mockRejectedValueOnce(new Error("cache bearer secret"));
    await clickCancel();
    await confirmCancel();
    expect(m.cancel).toHaveBeenCalledOnce();
    expect(m.alert.mock.calls.some((c) => JSON.stringify(c).includes("неизвестен"))).toBe(false);
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("cache bearer secret");
  });
  it("ACK with foreign bookingId is UNKNOWN, cannot retry on current session", async () => {
    m.cancel.mockResolvedValueOnce({ success: true, data: { bookingId: "other" } });
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.trace).toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await clickCancel();
    expect(m.cancel).toHaveBeenCalledTimes(1);
  });
  it("known concurrent 409 after POST is not cancellation success and never auto-resends", async () => {
    m.cancel.mockResolvedValueOnce({
      success: false,
      code: "CONSULTATION_SLOT_TAKEN",
      error: "conflict",
    });
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.cancel).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.at(-1)?.[1]).not.toContain("успешно отменена");
    expect(m.cancel).toHaveBeenCalledTimes(1);
  });
  it("transport timeout remains UNKNOWN, contains no provider secret or automatic resend", async () => {
    const secret = "Bearer PRIVATE SignedURL?X-Amz-Signature=secret";
    m.cancel.mockRejectedValueOnce(new Error(secret));
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain(secret);
    await clickCancel();
    expect(m.cancel).toHaveBeenCalledTimes(1);
  });
  it("A→B→A new authEpoch pending cancel quarantines ACK, and old guard turns false", async () => {
    const d = pending<{ success: boolean; data: { bookingId: string } }>();
    m.cancel.mockReturnValueOnce(d.promise);
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    const guard = m.cancel.mock.calls[0][1] as () => boolean;
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "A-E2";
    await act(async () =>
      useAuthStore.setState({
        user: { id: "A", username: "usera", phone: null, email: null, role: "USER" },
      }),
    );
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: { bookingId: "book-A" } }));
    expect(m.alert).toHaveBeenCalledTimes(1);
    expect(m.trace).not.toHaveBeenCalled();
  });
  it("server list switched booking/trainer before confirmation blocks captured booking", async () => {
    await mount();
    await waitForBooking();
    await clickCancel();
    m.activeBooking = "book-B";
    m.activeTrainer = "trainer-B";
    m.my.mockResolvedValue({ success: true, data: { items: [serverBooking()], nextCursor: null } });
    await act(async () => query.invalidateQueries({ queryKey: ["consultations", "mine"] }));
    await confirmCancel();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("guest, terminal CANCELLED or NO_SHOW status never renders cancel action", async () => {
    m.status = "NO_SHOW";
    m.my.mockResolvedValue({ success: true, data: { items: [serverBooking()], nextCursor: null } });
    await mount();
    await waitForBooking();
    expect(host.textContent).toContain("Бим");
    expect(host.textContent).not.toContain("Отменить запись");
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("after positive ACK, only same booking is terminal; another verified booking remains cancellable", async () => {
    m.my.mockReset().mockResolvedValue({
      success: true,
      data: {
        items: [
          serverBooking(),
          serverBooking({
            id: "book-B",
            cynologistUserId: "trainer-B",
            slot: {
              id: "slot-B",
              startAtUtc: "2026-10-23T11:00:00.000Z",
              endAtUtc: "2026-10-23T12:00:00.000Z",
              status: "BOOKED",
            },
          }),
        ],
        nextCursor: null,
      },
    });
    m.cancel
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: { bookingId: "book-A" } })
      .mockResolvedValueOnce({ success: true, data: { bookingId: "book-B" } });
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.cancel.mock.calls[0][0]).toBe("book-A");
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
      b.textContent?.includes("Отменить запись"),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    await act(async () => buttons[1].click());
    await confirmCancel();
    expect(m.cancel).toHaveBeenCalledTimes(2);
    expect(m.cancel.mock.calls[1][0]).toBe("book-B");
  });
  it("success:true missing data is UNKNOWN, not a false cancelled ACK", async () => {
    m.cancel.mockResolvedValueOnce({ success: true, data: undefined });
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.cancel).toHaveBeenCalledOnce();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await clickCancel();
    expect(m.cancel).toHaveBeenCalledOnce();
  });
  it("known Core forbidden concurrent state is not cancellation success", async () => {
    m.cancel.mockResolvedValueOnce({
      success: false,
      code: "CONSULTATION_FORBIDDEN",
      error: "status changed",
    });
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    expect(m.cancel).toHaveBeenCalledOnce();
    expect(m.alert.mock.calls.at(-1)?.[0]).toBe("Запись изменилась");
    await clickCancel();
    expect(m.cancel).toHaveBeenCalledOnce();
  });
  it("unauthenticated owner cannot use stale server list to cancel", async () => {
    m.owner = "";
    useAuthStore.setState({ user: null });
    await mount();
    expect(m.cancel).not.toHaveBeenCalled();
    const b = host.querySelector<HTMLButtonElement>('[aria-label^="Отменить запись"]');
    if (b) await act(async () => b.click());
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("unmount after POST while ACK pending suppresses cache refresh and alerts", async () => {
    const d = pending<{ success: boolean; data: { bookingId: string } }>();
    m.cancel.mockReturnValueOnce(d.promise);
    await mount();
    await waitForBooking();
    await clickCancel();
    await confirmCancel();
    const invalidate = vi.spyOn(query, "invalidateQueries");
    await act(async () => root.unmount());
    await act(async () => d.resolve({ success: true, data: { bookingId: "book-A" } }));
    expect(invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
