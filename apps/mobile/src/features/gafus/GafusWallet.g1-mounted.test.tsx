// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  statusPending: false,
  historyPending: false,
  statusError: false,
  historyError: false,
  balance: 3,
  economy: true,
  base: [] as {
    id: string;
    kind: string;
    rewardKind: null;
    delta: number;
    balanceAfter: number;
    createdAt: string;
    sourceEntityType: null;
    sourceEntityId: null;
    targetKey: null;
  }[],
  cursor: "after-base" as string | null,
  queryKeys: [] as unknown[][],
  historyPage: vi.fn(),
  statusRefetch: vi.fn(),
  historyRefetch: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: m.authLoading,
  });
  return {
    useAuthStore: Object.assign((sel: (s: ReturnType<typeof state>) => unknown) => sel(state()), {
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
vi.mock("@/shared/lib/api/gafus", () => ({
  gafusApi: { status: vi.fn(), history: (...v: unknown[]) => m.historyPage(...v) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    const status = queryKey[0] === "gafus-status";
    return status
      ? {
          data:
            m.statusPending || m.statusError
              ? undefined
              : {
                  wallet: { balance: m.balance },
                  activity: { earned: 0, limit: 3, remaining: 2 },
                  rules: { courseStepCost: 1, miniGuideCost: 1, accessDurationSeconds: 604800 },
                  enabled: { economy: m.economy },
                },
          isPending: m.statusPending,
          isError: m.statusError,
          isRefetching: false,
          refetch: () => m.statusRefetch(),
        }
      : {
          data:
            m.historyPending || m.historyError
              ? undefined
              : { items: m.base, nextCursor: m.cursor },
          isPending: m.historyPending,
          isError: m.historyError,
          isRefetching: false,
          refetch: () => m.historyRefetch(),
        };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: (...v: unknown[]) => m.push(...v), back: () => m.back() }),
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      R.createElement("button", { onClick: onPress }, "Назад"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return { Loading: () => R.createElement("div", null, "Загружаем Гафусы") };
});
vi.mock("@/shared/config", () => ({
  COLORS: { background: "white", text: "black" },
  SPACING: { md: 12, sm: 8 },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({
    children,
    refreshControl,
  }: {
    children?: React.ReactNode;
    refreshControl?: React.ReactNode;
  }) => R.createElement("div", null, refreshControl, children);
  return {
    View: Box,
    ScrollView: Box,
    Text: ({
      children,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      accessibilityLabel?: string;
    }) => R.createElement("span", { "aria-label": accessibilityLabel }, children),
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement(
        "button",
        { "aria-label": "Обновить историю Гафусов", onClick: onRefresh },
        "refresh",
      ),
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
        { "aria-label": accessibilityLabel, onClick: onPress, disabled },
        children,
      ),
    StyleSheet: { create: (x: unknown) => x },
  };
});
import Wallet from "../../../app/(main)/gafus";
let host: HTMLDivElement, root: Root;
const entry = (id: string, delta: number = 1) => ({
  id,
  kind: "EARN",
  rewardKind: null,
  delta,
  balanceAfter: 3,
  createdAt: "2026-10-20T10:00:00Z",
  sourceEntityType: null,
  sourceEntityId: null,
  targetKey: null,
});
const page = (items: ReturnType<typeof entry>[], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});
const gate = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(Wallet)));
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
  m.statusPending = false;
  m.historyPending = false;
  m.statusError = false;
  m.historyError = false;
  m.balance = 3;
  m.economy = true;
  m.base = [entry("row-base")];
  m.cursor = "after-base";
  m.queryKeys = [];
  m.historyPage.mockResolvedValue(page([entry("row-next")]));
  m.statusRefetch.mockResolvedValue({ isError: false });
  m.historyRefetch.mockResolvedValue({ isError: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V71 actual Gafus wallet session and cursor mounted", () => {
  it("guest gets login prompt with no private wallet queries", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.queryKeys).toHaveLength(0);
  });
  it("unverified authenticated actor does not read wallet", async () => {
    m.epoch = "";
    await render();
    expect(host.textContent).toContain("Загружаем Гафусы");
    expect(m.queryKeys).toHaveLength(0);
  });
  it("A→B→A epoch scopes wallet status and history queries", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queryKeys.at(-2)).toEqual(["gafus-status", "A", "E2"]);
    expect(m.queryKeys.at(-1)).toEqual(["gafus-history", "A", "E2"]);
  });
  it("loading/error and successful empty state are separate", async () => {
    m.statusPending = true;
    await render();
    expect(host.textContent).toContain("Загружаем Гафусы");
    m.statusPending = false;
    m.historyError = true;
    await render();
    expect(host.textContent).toContain("Не удалось загрузить Гафусы");
    m.historyError = false;
    m.base = [];
    m.cursor = null;
    await render();
    expect(host.textContent).toContain("Пока нет операций");
  });
  it("server disabled economy hides guide entry", async () => {
    m.economy = false;
    await render();
    expect(button("Смотреть мини-гайды")).toBeNull();
    expect(host.textContent).toContain("пока не включена");
  });
  it("guide route is guarded against stale session", async () => {
    await render();
    m.epoch = "E2";
    await press("Смотреть мини-гайды");
    expect(m.push).not.toHaveBeenCalled();
  });
  it("rapid double pagination requests only one next page", async () => {
    const pending = gate<ReturnType<typeof page>>();
    m.historyPage.mockReturnValueOnce(pending.promise);
    await render();
    await act(async () => {
      button("Показать ещё операции")?.click();
      button("Показать ещё операции")?.click();
    });
    expect(m.historyPage).toHaveBeenCalledExactlyOnceWith("after-base");
    await act(async () => pending.resolve(page([entry("row-next")])));
    expect(host.textContent).toContain("Операция");
    expect(button("Показать ещё операции")).toBeNull();
  });
  it("duplicate page rows do not repeat initial history entries", async () => {
    m.historyPage.mockResolvedValueOnce(page([entry("row-base"), entry("row-next")]));
    await render();
    await press("Показать ещё операции");
    expect(host.querySelectorAll("[data-transaction-row]")).toHaveLength(0);
    expect(host.textContent?.match(/Операция/g)?.length).toBe(2);
  });
  it("page failure preserves existing rows, neutral notice, retry cursor", async () => {
    m.historyPage.mockRejectedValueOnce(Error("PRIVATE_PAGE_STACK"));
    await render();
    await press("Показать ещё операции");
    expect(host.textContent).toContain("Не удалось загрузить следующие операции");
    expect(host.textContent).toContain("История операций");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_PAGE_STACK");
    await press("Показать ещё операции");
    expect(m.historyPage).toHaveBeenCalledTimes(2);
  });
  it("cursor returned unchanged prevents infinite same-cursor loads", async () => {
    m.historyPage.mockResolvedValueOnce(page([entry("row-next")], "after-base"));
    await render();
    await press("Показать ещё операции");
    expect(button("Показать ещё операции")).toBeNull();
  });
  it("refetch single-flight keeps pages until both results are successful", async () => {
    m.historyPage.mockResolvedValueOnce(page([entry("row-next")]));
    await render();
    await press("Показать ещё операции");
    const pending = gate<{ isError: boolean }>();
    m.statusRefetch.mockReturnValueOnce(pending.promise);
    await act(async () => {
      button("Обновить историю Гафусов")?.click();
      button("Обновить историю Гафусов")?.click();
    });
    expect(m.statusRefetch).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ isError: true }));
    expect(host.textContent).toContain("Не удалось обновить Гафусы");
    expect(host.textContent).toContain("История операций");
  });
  it("late A page after B and new A epoch cannot change new wallet", async () => {
    const pending = gate<ReturnType<typeof page>>();
    m.historyPage.mockReturnValueOnce(pending.promise);
    await render();
    await press("Показать ещё операции");
    m.owner = "B";
    m.epoch = "B1";
    m.balance = 88;
    await render();
    m.owner = "A";
    m.epoch = "E2";
    m.balance = 5;
    await render();
    await act(async () => pending.resolve(page([entry("PRIVATE_OLD_A")])));
    expect(host.querySelector('[aria-label="Баланс: 5 Гафусов"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_OLD_A");
  });
});
