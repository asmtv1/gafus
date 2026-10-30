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
  canBook: true,
  items: [] as {
    id: string;
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: null;
    slotDurationMin: number;
    about: null;
  }[],
  queryKeys: [] as unknown[][],
  focus: null as null | (() => void),
  refetch: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  track: vi.fn(),
  haptic: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: false,
  });
  return {
    useAuthStore: Object.assign((s: (x: unknown) => unknown) => s(state()), { getState: state }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    return {
      data: m.pending
        ? undefined
        : {
            items: m.items,
            bookingEligibility: { canBook: m.canBook, message: "Ограничен доступ к записи" },
          },
      isPending: m.pending,
      isLoading: m.pending,
      isError: m.error,
      error: m.error ? Error("PRIVATE_API_EXCEPTION") : null,
      refetch: m.refetch,
    };
  },
}));
vi.mock("expo-router", async () => {
  const R = await import("react");
  return {
    useRouter: () => ({ push: (...v: unknown[]) => m.push(...v) }),
    useFocusEffect: (fn: () => void) => {
      R.useEffect(() => {
        m.focus = fn;
        fn();
        return () => {
          m.focus = null;
        };
      }, [fn]);
    },
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    ScrollView: Box,
    StyleSheet: { create: (s: unknown) => s },
    Alert: { alert: (...v: unknown[]) => m.alert(...v) },
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@gafus/consultation-shared", () => ({ cynologistDisplayInitials: () => "К" }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black", textSecondary: "gray" },
  FONTS: { montserrat: "a", montserratBold: "b", montserratMedium: "c" },
  SPACING: { md: 12, sm: 6, xs: 3, lg: 18, xxl: 24 },
}));
vi.mock("@/shared/lib/tour-targets", async () => {
  const R = await import("react");
  return {
    TourTarget: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    Loading: () => R.createElement("span", null, "Загружаем каталог кинологов"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel ?? label },
        label,
      ),
  };
});
vi.mock("@/shared/lib/api", () => ({ consultationsApi: { listCynologists: vi.fn() } }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { medium: () => m.haptic(), light: () => m.haptic() },
}));
vi.mock("@/shared/lib/utils/resolveImageUrl", () => ({ resolveImageUrl: () => null }));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...v: unknown[]) => m.track(...v) }));
import Catalog from "./ConsultationsCynologistsListScreen";
let root: Root, host: HTMLDivElement;
const trainer = (userId = "trainer-1", username = "trainer1") => ({
  id: `card-${userId}`,
  userId,
  username,
  displayName: "Кинолог Один",
  avatarUrl: null,
  slotDurationMin: 30,
  about: null,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(Catalog)));
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
  m.pending = false;
  m.error = false;
  m.canBook = true;
  m.items = [trainer()];
  m.focus = null;
  m.queryKeys = [];
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
describe("AG3 V63 actual Mobile consultation catalog mounted", () => {
  it("unauthenticated actor cannot mount private catalog/query", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.queryKeys).toHaveLength(0);
  });
  it("A→B→A epoch keys private catalog and resets component", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queryKeys.at(-1)).toEqual(["consultations", "cynologists", "A", "E2"]);
  });
  it("pending list only renders loading not empty or stale cards", async () => {
    m.pending = true;
    await render();
    expect(host.textContent).toContain("Загружаем каталог");
    expect(host.textContent).not.toContain("Кинолог Один");
    expect(host.textContent).not.toContain("Пока нет доступных");
  });
  it("empty accepted list shows neutral empty state", async () => {
    m.items = [];
    await render();
    expect(host.textContent).toContain("Пока нет доступных кинологов");
  });
  it("query error hides stale cards, shows retry and never leaks backend exception", async () => {
    m.error = true;
    await render();
    expect(host.textContent).toContain("Не удалось загрузить список кинологов");
    expect(host.textContent).not.toContain("Кинолог Один");
    expect(host.textContent).not.toContain("PRIVATE_API_EXCEPTION");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_API_EXCEPTION");
    await press("Повторить загрузку");
    expect(m.refetch).toHaveBeenCalledOnce();
  });
  it("initial mount skips redundant focus refetch; later focus single-flight", async () => {
    await render();
    expect(m.refetch).not.toHaveBeenCalled();
    const gate = deferred<void>();
    m.refetch.mockReturnValueOnce(gate.promise);
    await act(async () => {
      m.focus?.();
      m.focus?.();
    });
    expect(m.refetch).toHaveBeenCalledOnce();
    await act(async () => gate.resolve(undefined));
  });
  it("booking eligibility denies time selection without blocking profile navigation", async () => {
    m.canBook = false;
    await render();
    expect(button("Выбрать время у кинолога Кинолог Один")?.disabled).toBe(true);
    await press("Выбрать время у кинолога Кинолог Один");
    expect(m.push).not.toHaveBeenCalled();
    await press("Подробнее о кинологе Кинолог Один");
    expect(m.push).toHaveBeenCalledOnce();
  });
  it("booking positive eligibility navigates using existing encoded route", async () => {
    await render();
    await press("Выбрать время у кинолога Кинолог Один");
    expect(m.push).toHaveBeenCalledOnce();
    expect(String(m.push.mock.calls[0][0])).toContain("/consultations/trainer-1?");
  });
  it("stale actor cannot open booking or profile even before rerender", async () => {
    await render();
    m.epoch = "E2";
    await press("Выбрать время у кинолога Кинолог Один");
    await press("Подробнее о кинологе Кинолог Один");
    expect(m.push).not.toHaveBeenCalled();
  });
  it("focus refresh rejection is sanitized and another focus remains possible", async () => {
    await render();
    m.refetch.mockRejectedValueOnce(Error("PRIVATE_FOCUS_SERVER"));
    await act(async () => m.focus?.());
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_FOCUS_SERVER");
    await act(async () => m.focus?.());
    expect(m.refetch).toHaveBeenCalledTimes(2);
  });
});
