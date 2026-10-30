// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  pending: false,
  error: false,
  dashboard: {
    referralCode: "A#code",
    referrals: 2,
    earnedKopecks: 12300,
    reservedKopecks: 1000,
    availableKopecks: 10000,
    active: true,
  },
  queryKeys: [] as unknown[][],
  input: null as null | ((value: string) => void),
  fetch: vi.fn(),
  retry: vi.fn(),
  payout: vi.fn(),
  copy: vi.fn(),
  haptic: vi.fn(),
  invalidate: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: false,
  });
  return {
    useAuthStore: Object.assign(
      (selector: (s: ReturnType<typeof state>) => unknown) => selector(state()),
      { getState: state },
    ),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/api", () => ({
  partnersApi: {
    getDashboard: (...v: unknown[]) => m.fetch(...v),
    requestPayout: (...v: unknown[]) => m.payout(...v),
  },
}));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { success: () => m.haptic() } }));
vi.mock("expo-clipboard", () => ({ setStringAsync: (...v: unknown[]) => m.copy(...v) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...v: unknown[]) => m.invalidate(...v) }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    return {
      data: m.pending || m.error ? undefined : m.dashboard,
      isPending: m.pending,
      isError: m.error,
      refetch: () => m.retry(),
    };
  },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Loading: () => R.createElement("div", null, "Загружаем партнёрский кабинет"),
    PageHeader: ({ title }: { title: string }) => R.createElement("h2", null, title),
    TexturedSafeAreaView: Box,
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Card: Object.assign(Box, { Content: Box }),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => R.createElement("button", { "aria-label": label, onClick: onPress, disabled }, label),
    Input: ({
      label,
      value,
      onChangeText,
    }: {
      label: string;
      value: string;
      onChangeText: (v: string) => void;
    }) => {
      m.input = onChangeText;
      return R.createElement("input", { "aria-label": label, value, readOnly: true });
    },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Snackbar: ({ children, visible }: { children?: React.ReactNode; visible: boolean }) =>
      visible ? R.createElement("div", { role: "alert" }, children) : null,
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    ScrollView: Box,
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  };
});
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "white",
    primaryDark: "olive",
    text: "black",
    textSecondary: "gray",
    border: "gray",
  },
  SPACING: { md: 12, sm: 8, xs: 4, xl: 32 },
}));
import PartnerScreen from "../../../app/(main)/partner";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(PartnerScreen)));
}
async function input(value: string) {
  await act(async () => m.input?.(value));
}
const btn = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
async function press(label: string) {
  await act(async () => btn(label)?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.pending = false;
  m.error = false;
  m.dashboard = {
    referralCode: "A#code",
    referrals: 2,
    earnedKopecks: 12300,
    reservedKopecks: 1000,
    availableKopecks: 10000,
    active: true,
  };
  m.queryKeys = [];
  m.input = null;
  m.fetch.mockResolvedValue({ success: true, data: m.dashboard });
  m.retry.mockResolvedValue({ isError: false });
  m.copy.mockResolvedValue(undefined);
  m.haptic.mockResolvedValue(undefined);
  m.invalidate.mockResolvedValue(undefined);
  m.payout.mockResolvedValue({
    success: true,
    data: { id: "payout-1", status: "PENDING", amountKopecks: 5000 },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V72 actual PartnerScreen mounted source/mock", () => {
  it("guest cannot query or view private partner data", async () => {
    m.authed = false;
    await render();
    expect(m.queryKeys).toHaveLength(0);
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(host.textContent).not.toContain("A#code");
  });
  it("A→B→A new epoch isolates dashboard and resets amount", async () => {
    await render();
    await input("25.50");
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queryKeys.at(-1)).toEqual(["partner-dashboard", "A", "E2"]);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Сумма, ₽"]')?.value).toBe("");
  });
  it("pending dashboard not rendered as empty or stale financial data", async () => {
    m.pending = true;
    await render();
    expect(host.textContent).toContain("Загружаем партнёрский кабинет");
    expect(host.textContent).not.toContain("A#code");
    expect(btn("Запросить выплату")).toBeNull();
  });
  it("GET error is neutral, retry doubletap single-flight", async () => {
    m.error = true;
    const gate = deferred<{ isError: boolean }>();
    m.retry.mockReturnValueOnce(gate.promise);
    await render();
    expect(host.textContent).toContain("Не удалось загрузить кабинет партнёра");
    await act(async () => {
      btn("Повторить")?.click();
      btn("Повторить")?.click();
    });
    expect(m.retry).toHaveBeenCalledOnce();
    await act(async () => gate.resolve({ isError: false }));
  });
  it("clipboard link uses encoded referral code, only after ACK says copied", async () => {
    const gate = deferred<void>();
    m.copy.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => btn("Скопировать ссылку")?.click());
    expect(m.copy).toHaveBeenCalledExactlyOnceWith("https://gafus.ru/register?promoCode=A%23code");
    expect(host.textContent).not.toContain("Ссылка скопирована");
    await act(async () => gate.resolve(undefined));
    expect(host.textContent).toContain("Ссылка скопирована");
  });
  it("clipboard rejected error is sanitized and no false success", async () => {
    m.copy.mockRejectedValueOnce(Error("PRIVATE_CLIPBOARD_ERROR"));
    await render();
    await press("Скопировать ссылку");
    expect(host.textContent).toContain("Не удалось скопировать ссылку");
    expect(host.textContent).not.toContain("PRIVATE_CLIPBOARD_ERROR");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_CLIPBOARD_ERROR");
  });
  it("invalid precision/overflow/out-of-balance must never POST", async () => {
    await render();
    for (const value of ["0", "1.999", "-1", "1e3", "100.01", "99999999999999999999"]) {
      await input(value);
      await press("Запросить выплату");
    }
    expect(m.payout).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Укажите сумму");
  });
  it("inactive dashboard disables payout button", async () => {
    m.dashboard = { ...m.dashboard, active: false };
    await render();
    expect(btn("Запросить выплату")?.disabled).toBe(true);
    await input("20");
    await press("Запросить выплату");
    expect(m.payout).not.toHaveBeenCalled();
  });
  it("rapid doubletap payout sends one request, ACK precedes cache invalidate", async () => {
    const gate = deferred<{
      success: boolean;
      data: { id: string; status: string; amountKopecks: number };
    }>();
    m.payout.mockReturnValueOnce(gate.promise);
    await render();
    await input("50,00");
    await act(async () => {
      btn("Запросить выплату")?.click();
      btn("Запросить выплату")?.click();
    });
    expect(m.payout).toHaveBeenCalledExactlyOnceWith(5000);
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () =>
      gate.resolve({
        success: true,
        data: { id: "payout-1", status: "PENDING", amountKopecks: 5000 },
      }),
    );
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["partner-dashboard", "A", "E1"] });
    expect(host.textContent).toContain("Заявка на выплату принята");
    await input("50");
    await press("Запросить выплату");
    expect(m.payout).toHaveBeenCalledOnce();
  });
  it("success:false payout is UNKNOWN, no second POST or success UI", async () => {
    m.payout.mockResolvedValueOnce({ success: false, error: "PRIVATE_PAYOUT_ERROR" });
    await render();
    await input("10");
    await press("Запросить выплату");
    await press("Запросить выплату");
    expect(m.payout).toHaveBeenCalledOnce();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат заявки неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_PAYOUT_ERROR");
  });
  it("transport error quarantines payout and hides backend detail", async () => {
    m.payout.mockRejectedValueOnce(Error("PRIVATE_TRANSPORT_STACK"));
    await render();
    await input("25");
    await press("Запросить выплату");
    await press("Запросить выплату");
    expect(m.payout).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_TRANSPORT_STACK");
  });
  it("confirmed payout + cache failure stays confirmed without duplicate", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE_ERROR"));
    await render();
    await input("1");
    await press("Запросить выплату");
    expect(host.textContent).toContain("Заявка на выплату принята");
    expect(host.textContent).not.toContain("Результат заявки неизвестен");
    await press("Запросить выплату");
    expect(m.payout).toHaveBeenCalledOnce();
  });
  it("late A ACK after A→B→A epoch may not update or invalidate new session", async () => {
    const gate = deferred<{
      success: boolean;
      data: { id: string; status: string; amountKopecks: number };
    }>();
    m.payout.mockReturnValueOnce(gate.promise);
    await render();
    await input("10");
    await press("Запросить выплату");
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () =>
      gate.resolve({
        success: true,
        data: { id: "payout-a", status: "PENDING", amountKopecks: 1000 },
      }),
    );
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Заявка на выплату принята");
  });
});
