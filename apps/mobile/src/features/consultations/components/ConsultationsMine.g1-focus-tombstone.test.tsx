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
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const box =
    (tag: string) =>
    ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement(tag, { onClick: onPress }, children);
  return {
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
}));
vi.mock("@/shared/lib/api", () => ({
  consultationsApi: {
    myBookings: () => m.my(),
    cancelBooking: vi.fn(),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { light: vi.fn(), medium: vi.fn() },
}));

import { useAuthStore } from "@/shared/stores/authStore";
import MyScreen from "../../../../app/(main)/consultations/mine";

const key = () => `gafus-consultation-booking-tombstone-v1:A:${m.epoch}`;
const record = (state: "UNKNOWN" | "CONFIRMED") =>
  JSON.stringify({
    version: 1,
    ownerId: "A",
    authEpoch: m.epoch,
    idempotencyKey: "9d5a28a9-a00e-4bb8-a3b3-e99318d7c4fb",
    state,
    createdAt: Date.now() - 1000,
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
async function focus() {
  await act(async () => {
    m.focus?.();
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

describe("My consultations durable focus and unknown safety", () => {
  it("refreshes UNKNOWN to CONFIRMED on re-focus without remount or booking POST", async () => {
    m.disk.set(key(), record("UNKNOWN"));
    await mount();
    expect(host.textContent).toContain("Сервер мог создать бронь");
    m.disk.set(key(), record("CONFIRMED"));
    await focus();
    expect(host.textContent).not.toContain("Сервер мог создать бронь");
  });
  it("notices new UNKNOWN on re-focus even when list is empty", async () => {
    m.disk.set(key(), record("CONFIRMED"));
    await mount();
    expect(host.textContent).not.toContain("Сервер мог создать бронь");
    m.disk.set(key(), record("UNKNOWN"));
    await focus();
    expect(host.textContent).toContain("Сервер мог создать бронь");
  });
  it("does not present an unchecked empty state while local tombstone read is pending", async () => {
    let release!: (value: string | null) => void;
    m.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await mount();
    expect(host.textContent).toContain("Проверяем локальное состояние записи");
    expect(host.textContent).not.toContain("Найти кинолога");
    await act(async () => release(record("UNKNOWN")));
    await flush();
    expect(host.textContent).toContain("Сервер мог создать бронь");
  });
  it("keeps booking CTA closed after AsyncStorage read fault", async () => {
    m.get.mockRejectedValueOnce(Error("disk unavailable"));
    await mount();
    expect(host.textContent).toContain("Не удалось проверить локальное состояние записи");
    expect(host.textContent).not.toContain("Найти кинолога");
  });
  it("ignores late UNKNOWN read from an earlier focus after newer CONFIRMED", async () => {
    let releaseOld!: (v: string | null) => void;
    m.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        }),
    );
    m.disk.set(key(), record("CONFIRMED"));
    await mount();
    await focus();
    expect(host.textContent).not.toContain("Сервер мог создать бронь");
    await act(async () => releaseOld(record("UNKNOWN")));
    await flush();
    expect(host.textContent).not.toContain("Сервер мог создать бронь");
    expect(host.textContent).toContain("Найти кинолога");
  });
});
