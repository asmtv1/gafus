// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  chatPending: false,
  chatError: false,
  trainer: false,
  userRole: "USER" as "USER" | "TRAINER",
  economy: true,
  queries: [] as unknown[][],
  refetch: vi.fn(),
  navigate: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner, role: m.userRole } : null,
    isAuthenticated: m.authed,
    isLoading: m.authLoading,
  });
  return {
    useAuthStore: Object.assign((f: (s: ReturnType<typeof state>) => unknown) => f(state()), {
      getState: state,
    }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...v: unknown[]) => m.track(...v) }));
vi.mock("@/shared/lib/api/gafus", () => ({ gafusApi: { status: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled: boolean }) => {
    m.queries.push([...queryKey, enabled]);
    const chat = queryKey[0] === "more-chat-role";
    return chat
      ? {
          data: { isAssignedTrainer: m.trainer },
          isPending: m.chatPending,
          isError: m.chatError,
          refetch: () => m.refetch(),
        }
      : {
          data: { enabled: { economy: m.economy } },
          isPending: false,
          isError: false,
          refetch: vi.fn(),
        };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ navigate: (...a: unknown[]) => m.navigate(...a) }),
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return { Loading: () => R.createElement("span", null, "Загрузка меню") };
});
vi.mock("@/shared/lib/tour-targets", async () => {
  const R = await import("react");
  return {
    TourTarget: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", cardBackground: "white", text: "black", borderLight: "gray" },
  FONTS: { montserrat: "a", montserratBold: "b" },
  SPACING: { md: 12, sm: 8, xl: 20 },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Alert: { alert: (...v: unknown[]) => m.alert(...v) },
    View: Box,
    ScrollView: Box,
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 },
    Pressable: ({
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
      R.createElement(
        "button",
        { "aria-label": accessibilityLabel, disabled, onClick: onPress },
        children,
      ),
  };
});
import MoreScreen from "../../../app/(main)/(tabs)/more";
let host: HTMLDivElement, root: Root;
async function render() {
  await act(async () => root.render(createElement(MoreScreen)));
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
async function press(label: string) {
  await act(async () => button(label)?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.authLoading = false;
  m.chatPending = false;
  m.chatError = false;
  m.trainer = false;
  m.userRole = "USER";
  m.economy = true;
  m.queries = [];
  m.refetch.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V69 actual More menu actor cache/navigation mounted", () => {
  it("guest sees other menu entries but cannot open private chat or Gafus", async () => {
    m.authed = false;
    await render();
    expect(m.queries.every((q) => q[3] === false)).toBe(true);
    expect(button("Мои Гафусы")).toBeNull();
    expect(host.textContent).toContain("Требуется вход в аккаунт");
    await press("Сообщения");
    expect(m.navigate).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledOnce();
  });
  it("unverified authenticated actor waits without private GET", async () => {
    m.epoch = "";
    await render();
    expect(m.queries).toHaveLength(0);
    expect(host.textContent).toContain("Загрузка меню");
  });
  it("Gafus query remains scoped to session epoch; legacy role request absent", async () => {
    await render();
    expect(m.queries.some((q) => q[0] === "more-chat-role")).toBe(false);
    expect(m.queries).toContainEqual(["more-gafus-status", "A", "E1", true]);
  });
  it("A→B→A re-login cannot reuse old query key", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queries.at(-1)).toEqual(["more-gafus-status", "A", "E2", true]);
  });
  it("exposes staff consultation management in menu only to TRAINER", async () => {
    await render();
    expect(button("Заявки кинолога")).toBeNull();
    m.userRole = "TRAINER";
    await render();
    expect(button("Заявки кинолога")).not.toBeNull();
    await press("Заявки кинолога");
    expect(m.navigate).toHaveBeenCalledWith("/(main)/consultations/trainer");
    m.userRole = "USER";
    await press("Заявки кинолога");
    expect(m.navigate).toHaveBeenCalledTimes(1);
  });
  it("trainer opens Chat2, not legacy trainer dialogs", async () => {
    m.trainer = true;
    await render();
    await press("Сообщения");
    expect(m.navigate).toHaveBeenCalledWith("/(main)/(tabs)/messages");
  });
  it("ordinary user opens Chat2", async () => {
    await render();
    await press("Сообщения");
    expect(m.navigate).toHaveBeenCalledWith("/(main)/(tabs)/messages");
  });
  it("messenger entry does not read the retired Stream role endpoint", async () => {
    m.chatError = true;
    m.chatPending = true;
    await render();
    await press("Сообщения");
    expect(m.queries.some((q) => q[0] === "more-chat-role")).toBe(false);
    expect(m.navigate).toHaveBeenCalledWith("/(main)/(tabs)/messages");
  });
  it("hidden economy omits Gafus menu entry", async () => {
    m.economy = false;
    await render();
    expect(button("Мои Гафусы")).toBeNull();
  });
  it("non-chat mapping preserves albums/reminders links", async () => {
    await render();
    await press("Фотоальбомы");
    await press("Напоминания о тренировках");
    expect(m.navigate).toHaveBeenNthCalledWith(1, "/(main)/(tabs)/albums");
    expect(m.navigate).toHaveBeenNthCalledWith(2, "/(main)/(tabs)/reminders");
  });
  it("old actor cannot navigate after epoch changes but before rerender", async () => {
    await render();
    m.epoch = "E2";
    await press("Сообщения");
    await press("Питомцы");
    expect(m.navigate).not.toHaveBeenCalled();
  });
});
