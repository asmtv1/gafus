// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authenticated: true,
  pending: false,
  readError: false,
  visible: true,
  data: { enabled: true, useCity: true, usePets: true, useBehavior: true, exploration: true },
  queries: [] as { queryKey: readonly unknown[]; enabled?: boolean }[],
  set: vi.fn(),
  reset: vi.fn(),
  get: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
  remove: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authenticated ? { id: m.owner } : null,
    isAuthenticated: m.authenticated,
    isLoading: false,
  });
  return {
    useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(state()), {
      getState: state,
    }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.authenticated ? { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: {
    getPersonalization: (...args: unknown[]) => m.get(...args),
    setPersonalization: (...args: unknown[]) => m.set(...args),
    resetPersonalization: (...args: unknown[]) => m.reset(...args),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "olive",
    text: "black",
    cardBackground: "white",
    borderLight: "gray",
    textSecondary: "gray",
  },
  FONTS: { montserrat: "sans-serif" },
}));
vi.mock("@/shared/components", () => ({
  Loading: () => "Загрузка…",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => m.invalidate(...args),
    removeQueries: (...args: unknown[]) => m.remove(...args),
  }),
  useQuery: (args: { queryKey: readonly unknown[]; enabled?: boolean }) => {
    m.queries.push(args);
    return {
      data: m.pending || m.readError ? undefined : m.data,
      isPending: m.pending,
      isError: m.readError,
      refetch: (...params: unknown[]) => m.refetch(...params),
    };
  },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Container = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
    StyleSheet: { create: (x: unknown) => x, absoluteFill: {}, hairlineWidth: 1 },
    View: Container,
    Text: Container,
    Modal: ({ children, visible }: { children?: React.ReactNode; visible: boolean }) =>
      visible ? R.createElement("div", { "data-testid": "modal" }, children) : null,
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
      disabled?: boolean;
    }) =>
      R.createElement(
        "button",
        {
          "aria-label": accessibilityLabel,
          onClick: onPress,
          disabled,
        },
        children,
      ),
    Switch: ({
      accessibilityLabel,
      value,
      disabled,
      onValueChange,
    }: {
      accessibilityLabel?: string;
      value: boolean;
      disabled?: boolean;
      onValueChange: (value: boolean) => void;
    }) =>
      R.createElement(
        "button",
        {
          "aria-label": accessibilityLabel,
          disabled,
          onClick: () => onValueChange(!value),
        },
        String(value),
      ),
  };
});
import { FeedSmartPreferences } from "./FeedSmartPreferences";

let host: HTMLDivElement;
let root: Root;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const btn = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.includes(label),
  );
async function render() {
  await act(async () =>
    root.render(
      createElement(FeedSmartPreferences, {
        visible: m.visible,
        onClose: m.close,
      }),
    ),
  );
}
async function click(label: string) {
  await act(async () => btn(label)?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authenticated = true;
  m.pending = false;
  m.readError = false;
  m.visible = true;
  m.data = { enabled: true, useCity: true, usePets: true, useBehavior: true, exploration: true };
  m.queries.length = 0;
  m.invalidate.mockResolvedValue(undefined);
  m.refetch.mockResolvedValue({ isError: false });
  m.set.mockResolvedValue({ ...m.data });
  m.reset.mockResolvedValue({ reset: true, resetAt: "2026-10-21T08:00:00Z" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 Mobile Moments smart recommendations actual mounted G1", () => {
  it("guest does not render private settings or issue mutation", async () => {
    m.authenticated = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.queries).toHaveLength(0);
    await click("Сбросить рекомендации");
    expect(m.reset).not.toHaveBeenCalled();
  });
  it("GET query is isolated by principal and verified auth epoch", async () => {
    await render();
    expect(m.queries.at(-1)).toMatchObject({
      queryKey: ["feed", "personalization", "A", "E1"],
      enabled: true,
    });
    m.epoch = "E2";
    await render();
    expect(m.queries.at(-1)).toMatchObject({
      queryKey: ["feed", "personalization", "A", "E2"],
      enabled: true,
    });
  });
  it("closed modal does not start GET, unknown loading never shows enabled form", async () => {
    m.visible = false;
    m.pending = true;
    await render();
    expect(m.queries.at(-1)?.enabled).toBe(false);
    expect(host.textContent).not.toContain("Мой город");
    m.visible = true;
    await render();
    expect(host.textContent).toContain("Загрузка");
    expect(btn("Мой город")).toBeUndefined();
  });
  it("failed GET offers read-only retry without false empty settings", async () => {
    m.readError = true;
    await render();
    expect(host.textContent).toContain("Не удалось загрузить настройки");
    await click("Повторить загрузку");
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(m.set).not.toHaveBeenCalled();
  });
  it("one PATCH on rapid doubletap; valid positive result triggers private refresh", async () => {
    const d = deferred<typeof m.data>();
    m.set.mockReturnValueOnce(d.promise);
    await render();
    await act(async () => {
      btn("Мой город")?.click();
      btn("Мой город")?.click();
    });
    expect(m.set).toHaveBeenCalledOnce();
    expect(m.set).toHaveBeenCalledWith({ useCity: false });
    await act(async () => d.resolve({ ...m.data, useCity: false }));
    expect(host.textContent).toContain("Настройка сохранена");
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["feed-status", "A"] });
  });
  it("503 private error is redacted and unknown mutation cannot resend", async () => {
    m.set.mockRejectedValueOnce(new Error("Bearer SECRET signed S3 URL"));
    await render();
    await click("Мой город");
    expect(host.textContent).toContain("Результат изменения неизвестен");
    expect(host.textContent).not.toContain("SECRET");
    await click("Мой город");
    expect(m.set).toHaveBeenCalledOnce();
    expect(m.trace).toHaveBeenCalledWith(
      expect.objectContaining({ message: "FEED_PREF_MUTATION_UNKNOWN" }),
      expect.anything(),
    );
  });
  it("mismatched 200 response is UNKNOWN and not falsely saved", async () => {
    await render();
    await click("Мой город");
    expect(m.set).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Результат изменения неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("successful write remains ACK even if query invalidation throws", async () => {
    m.set.mockResolvedValueOnce({ ...m.data, useCity: false });
    m.invalidate.mockRejectedValueOnce(new Error("offline"));
    await render();
    await click("Мой город");
    expect(host.textContent).toContain("Изменение сохранено");
    expect(host.textContent).not.toContain("Результат изменения неизвестен");
  });
  it("stale A/E1 mutation resolution after same-owner epoch switch has no cache side effect", async () => {
    const d = deferred<typeof m.data>();
    m.set.mockReturnValueOnce(d.promise);
    await render();
    await act(async () => btn("Мой город")?.click());
    m.epoch = "E2";
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => d.resolve({ ...m.data, useCity: false }));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("reset confirmation double callback makes one POST, only reset:true acknowledges", async () => {
    const d = deferred<{ reset: boolean; resetAt: string }>();
    m.reset.mockReturnValueOnce(d.promise);
    await render();
    await click("Сбросить рекомендации");
    expect(m.alert).toHaveBeenCalledOnce();
    const actions = m.alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      actions[1]?.onPress?.();
      actions[1]?.onPress?.();
    });
    expect(m.reset).toHaveBeenCalledOnce();
    await act(async () => d.resolve({ reset: true, resetAt: "2026-10-21T08:00:00Z" }));
    expect(host.textContent).toContain("Рекомендации сброшены");
  });
  it("reset 503 remains UNKNOWN and never exposes private provider diagnostics", async () => {
    m.reset.mockRejectedValueOnce(new Error("private backend S3 URL Bearer TOKEN"));
    await render();
    await click("Сбросить рекомендации");
    const actions = m.alert.mock.calls[0][2] as { onPress?: () => void }[];
    await act(async () => actions[1]?.onPress?.());
    expect(m.reset).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Результат изменения неизвестен");
    expect(host.textContent).not.toContain("TOKEN");
    await click("Сбросить рекомендации");
    expect(m.reset).toHaveBeenCalledOnce();
  });
  it("late PATCH after unmount does not touch private cache", async () => {
    const d = deferred<typeof m.data>();
    m.set.mockReturnValueOnce(d.promise);
    await render();
    await act(async () => btn("Мой город")?.click());
    await act(async () => root.unmount());
    await act(async () => d.resolve({ ...m.data, useCity: false }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("reset alert captured under old session cannot mutate in next epoch", async () => {
    await render();
    await click("Сбросить рекомендации");
    const actions = m.alert.mock.calls[0][2] as { onPress?: () => void }[];
    m.epoch = "E2";
    await act(async () => actions[1]?.onPress?.());
    expect(m.reset).not.toHaveBeenCalled();
  });
});
