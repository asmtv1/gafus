// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  pending: false,
  failed: false,
  guides: [] as {
    courseId: string;
    title: string;
    description: string;
    imageUrl: string;
    unlocked: boolean;
    accessSource: string;
    expiresAt: null;
    canPurchase: boolean;
    price: number;
  }[],
  queryKeys: [] as unknown[][],
  ids: 0,
  unlock: vi.fn(),
  guide: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
  trace: vi.fn(),
  track: vi.fn(),
  back: vi.fn(),
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
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => m.track(...args) }));
vi.mock("@/shared/lib/api/gafus", () => ({
  gafusApi: {
    miniGuides: vi.fn(),
    unlock: (...args: unknown[]) => m.unlock(...args),
    guide: (...args: unknown[]) => m.guide(...args),
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `synthetic-id-${++m.ids}` }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...args: unknown[]) => m.invalidate(...args) }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    return {
      data: m.failed || m.pending ? undefined : m.guides,
      isPending: m.pending,
      isError: m.failed,
      refetch: () => m.refetch(),
    };
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: () => m.back() }) }));
vi.mock("react-native-webview", async () => {
  const R = await import("react");
  return {
    default: ({ source }: { source: { html: string } }) =>
      R.createElement("div", { "data-guide-html": source.html }, "Содержимое гайда"),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return { Loading: () => R.createElement("div", null, "Загружаем мини-гайды") };
});
vi.mock("@/shared/config", () => ({
  COLORS: { background: "white", text: "black" },
  SPACING: { md: 12 },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    ScrollView: Box,
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    StyleSheet: { create: (x: unknown) => x },
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
import MiniGuidesScreen from "../../../app/(main)/gafus-guides";
const sample = (id = "guide-1", unlocked = false, canPurchase = true) => ({
  courseId: id,
  title: `Гайд ${id}`,
  description: "Для тренировки",
  imageUrl: "",
  unlocked,
  accessSource: unlocked ? "GAFUS" : "NONE",
  expiresAt: null,
  canPurchase,
  price: 1,
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
let root: Root, host: HTMLDivElement;
async function render() {
  await act(async () => root.render(createElement(MiniGuidesScreen)));
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
  m.pending = false;
  m.failed = false;
  m.ids = 0;
  m.guides = [sample()];
  m.queryKeys = [];
  m.unlock.mockResolvedValue({
    spent: 1,
    balance: 2,
    accessSource: "GAFUS",
    expiresAt: null,
    replay: false,
  });
  m.guide.mockResolvedValue({ courseId: "guide-1", guideContent: "<p>SYNTHETIC</p>" });
  m.invalidate.mockResolvedValue(undefined);
  m.refetch.mockResolvedValue({ isError: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V70 actual mini-guides in-process unlock and reader", () => {
  it("guest never mounts private mini-guide query", async () => {
    m.authed = false;
    await render();
    expect(m.queryKeys).toHaveLength(0);
    expect(host.textContent).toContain("войдите в аккаунт");
  });
  it("unverified authenticated actor waits without private query", async () => {
    m.epoch = "";
    await render();
    expect(m.queryKeys).toHaveLength(0);
    expect(host.textContent).toContain("Загружаем мини-гайды");
  });
  it("A→B→A epoch isolates guide list query", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queryKeys.at(-1)).toEqual(["gafus-mini-guides", "A", "E2"]);
  });
  it("pending, empty and failed catalogue are distinct; retry single-flight", async () => {
    m.pending = true;
    await render();
    expect(host.textContent).toContain("Загружаем мини-гайды");
    m.pending = false;
    m.guides = [];
    await render();
    expect(host.textContent).toContain("пока не опубликованы");
    m.failed = true;
    const gate = deferred<{ isError: boolean }>();
    m.refetch.mockReturnValueOnce(gate.promise);
    await render();
    expect(host.textContent).toContain("Не удалось получить каталог");
    await act(async () => {
      button("Повторить загрузку мини-гайдов")?.click();
      button("Повторить загрузку мини-гайдов")?.click();
    });
    expect(m.refetch).toHaveBeenCalledOnce();
    await act(async () => gate.resolve({ isError: false }));
  });
  it("double-tap on locked guide sends one idempotency-keyed unlock before read", async () => {
    const gate = deferred<{ spent: number }>();
    m.unlock.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      button("Открыть мини-гайд Гайд guide-1")?.click();
      button("Открыть мини-гайд Гайд guide-1")?.click();
    });
    expect(m.unlock).toHaveBeenCalledExactlyOnceWith({
      clientRequestId: "synthetic-id-1",
      target: { type: "MINI_GUIDE", courseId: "guide-1" },
    });
    expect(m.guide).not.toHaveBeenCalled();
    await act(async () => gate.resolve({ spent: 1 }));
    expect(m.guide).toHaveBeenCalledExactlyOnceWith("guide-1");
    expect(host.querySelector("[data-guide-html]")).not.toBeNull();
  });
  it("ambiguous unlock blocks same course retry and keeps backend error private", async () => {
    m.unlock.mockRejectedValueOnce(Error("PRIVATE_UNLOCK_STACK"));
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(host.textContent).toContain("Результат открытия неизвестен");
    expect(button("Открыть мини-гайд Гайд guide-1")?.disabled).toBe(true);
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(m.guide).not.toHaveBeenCalled();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_UNLOCK_STACK");
  });
  it("positive unlock then failed read never charges again on reader retry", async () => {
    m.guide.mockRejectedValueOnce(Error("PRIVATE_GUIDE_READ"));
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Доступ подтверждён");
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(m.guide).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-guide-html]")).not.toBeNull();
  });
  it("already-unlocked guide reads without payment", async () => {
    m.guides = [sample("guide-1", true)];
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).not.toHaveBeenCalled();
    expect(m.guide).toHaveBeenCalledOnce();
  });
  it("positive unlock then failed cache invalidation preserves opened reader", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE"));
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(host.querySelector("[data-guide-html]")).not.toBeNull();
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_CACHE");
  });
  it("late A unlock ACK after B and new A epoch cannot open reader", async () => {
    const gate = deferred<{ spent: number }>();
    m.unlock.mockReturnValueOnce(gate.promise);
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => gate.resolve({ spent: 1 }));
    expect(m.guide).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.querySelector("[data-guide-html]")).toBeNull();
  });
  it("back to list and reopening confirmed guide does not unlock again", async () => {
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    await press("К мини-гайдам");
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(m.guide).toHaveBeenCalledTimes(2);
  });
  it("unavailable locked guide never calls paid mutation", async () => {
    m.guides = [sample("guide-1", false, false)];
    await render();
    expect(button("Открыть мини-гайд Гайд guide-1")?.disabled).toBe(true);
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).not.toHaveBeenCalled();
  });
  it("empty returned guide content is handled as neutral error", async () => {
    m.guides = [sample("guide-1", true)];
    m.guide.mockResolvedValueOnce({ guideContent: "" });
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(host.textContent).toContain("Материал мини-гайда пока недоступен");
    expect(host.querySelector("[data-guide-html]")).toBeNull();
  });
  it("post-ack analytics throw still opens content without recharge", async () => {
    m.track.mockImplementationOnce(() => {
      throw Error("PRIVATE_ANALYTICS");
    });
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(host.querySelector("[data-guide-html]")).not.toBeNull();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_ANALYTICS");
  });
  it("sync cache failure after unlock ACK still opens reader", async () => {
    m.invalidate.mockImplementationOnce(() => {
      throw Error("PRIVATE_SYNC_CACHE");
    });
    m.refetch.mockImplementationOnce(() => {
      throw Error("PRIVATE_SYNC_REFETCH");
    });
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(host.querySelector("[data-guide-html]")).not.toBeNull();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_SYNC_CACHE");
  });
  it("analytics callback switching actor prevents old guide GET", async () => {
    m.track.mockImplementationOnce(() => {
      m.owner = "B";
      m.epoch = "B1";
    });
    await render();
    await press("Открыть мини-гайд Гайд guide-1");
    expect(m.unlock).toHaveBeenCalledOnce();
    expect(m.guide).not.toHaveBeenCalled();
    expect(host.querySelector("[data-guide-html]")).toBeNull();
  });
});
