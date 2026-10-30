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
  pageError: false,
  more: false,
  fetching: false,
  hiddenItems: [{ id: "author-1", username: "trainer1", name: "Кинолог 1" }],
  bookmarked: [] as { id: string }[],
  queryArgs: [] as unknown[][],
  write: vi.fn(),
  refetch: vi.fn(),
  next: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
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
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: {
    listBookmarks: vi.fn(),
    listHiddenAuthors: vi.fn(),
    setAuthorPreference: (...args: unknown[]) => m.write(...args),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...args: unknown[]) => m.invalidate(...args) }),
  useInfiniteQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled: boolean }) => {
    m.queryArgs.push([...queryKey, enabled]);
    const hidden = queryKey[1] === "hidden-authors";
    return {
      data:
        m.pending || (m.error && !m.pageError)
          ? undefined
          : { pages: [{ items: hidden ? m.hiddenItems : m.bookmarked, nextCursor: null }] },
      isPending: enabled && m.pending,
      isError: enabled && m.error,
      isFetchNextPageError: enabled && m.pageError,
      hasNextPage: enabled && m.more,
      isFetchingNextPage: enabled && m.fetching,
      refetch: () => m.refetch(),
      fetchNextPage: () => m.next(),
    };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: (v: unknown) => m.push(v), back: vi.fn() }),
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black" },
  FONTS: { montserrat: "a", montserratMedium: "b" },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    AppBackButton: () => null,
    Loading: () => null,
    MascotSpinner: () => null,
    TexturedSafeAreaView: Box,
  };
});
vi.mock("./screens", () => ({ FeedPostCard: () => null }));
vi.mock("./FeedSectionShortcuts", () => ({ FeedSectionShortcuts: () => null }));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
    ScrollView: Box,
    View: Box,
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
        { "aria-label": accessibilityLabel, disabled, onClick: onPress },
        children,
      ),
    StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 },
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
import { FeedPersonalScreen } from "./FeedPersonalScreen";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render(hidden = true) {
  await act(async () => root.render(createElement(FeedPersonalScreen, { hidden })));
}
const author = () =>
  host.querySelector<HTMLButtonElement>(
    'button[aria-label="Показывать автора Кинолог 1 в Моментах"]',
  );
async function show() {
  await act(async () => author()?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.pending = false;
  m.error = false;
  m.pageError = false;
  m.more = false;
  m.fetching = false;
  m.hiddenItems = [{ id: "author-1", username: "trainer1", name: "Кинолог 1" }];
  m.bookmarked = [];
  m.queryArgs = [];
  m.write.mockResolvedValue(undefined);
  m.refetch.mockResolvedValue(undefined);
  m.next.mockResolvedValue(undefined);
  m.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V59 mounted actual FeedPersonal saved/hidden", () => {
  it("guest cannot query or display private authors", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.queryArgs).toHaveLength(0);
    expect(host.textContent).not.toContain("Кинолог 1");
  });
  it("query cache is bound to owner+epoch, including re-login A", async () => {
    await render();
    expect(m.queryArgs.at(-1)?.slice(0, 4)).toEqual(["feed", "hidden-authors", "A", "E1"]);
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.queryArgs.at(-1)?.slice(0, 4)).toEqual(["feed", "hidden-authors", "A", "E2"]);
    await render(false);
    expect(m.queryArgs.at(-2)?.slice(0, 4)).toEqual(["feed", "saved", "A", "E2"]);
  });
  it("doubletap sends one mutation, only ACK refreshes cache", async () => {
    const gate = deferred<void>();
    m.write.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      author()?.click();
      author()?.click();
    });
    expect(m.write).toHaveBeenCalledExactlyOnceWith("author-1", { hidden: false });
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => gate.resolve(undefined));
    expect(m.invalidate).toHaveBeenCalledOnce();
    expect(author()?.disabled).toBe(true);
    await show();
    expect(m.write).toHaveBeenCalledOnce();
  });
  it("cache failure after ACK is not unknown and cannot repeat acknowledged mutation", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE_STACK"));
    await render();
    await show();
    expect(host.textContent).toContain("Изменение сохранено");
    expect(m.alert).not.toHaveBeenCalled();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_CACHE_STACK");
    await show();
    expect(m.write).toHaveBeenCalledOnce();
  });
  it("unknown mutation quarantines and never exposes raw backend exception", async () => {
    m.write.mockRejectedValueOnce(Error("PRIVATE_WRITE_STACK"));
    await render();
    await show();
    await show();
    expect(m.write).toHaveBeenCalledOnce();
    expect(author()?.disabled).toBe(true);
    expect(m.alert).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("PRIVATE_WRITE_STACK");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_WRITE_STACK");
  });
  it("late ACK after owner A→B→A with new epoch cannot modify private cache", async () => {
    const gate = deferred<void>();
    m.write.mockReturnValueOnce(gate.promise);
    await render();
    await show();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => gate.resolve(undefined));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
    expect(author()?.disabled).toBe(false);
  });
  it("stale profile press cannot navigate", async () => {
    await render();
    m.epoch = "E2";
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Профиль Кинолог 1"]')?.click(),
    );
    expect(m.push).not.toHaveBeenCalled();
  });
  it("failed hidden-author next page keeps loaded authors and provides page retry", async () => {
    m.error = true;
    m.pageError = true;
    m.more = true;
    await render();
    expect(host.textContent).toContain("Кинолог 1");
    expect(host.textContent).not.toContain("Не удалось загрузить. Повторить");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Скрытых авторов пока нет.");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Повторить страницу"]')?.click(),
    );
    expect(m.next).toHaveBeenCalledOnce();
    m.error = false;
    m.pageError = false;
    await render();
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).toContain("Кинолог 1");
  });

  it("next page singleflight and stale outcome must not display error", async () => {
    const gate = deferred<void>();
    m.next.mockReturnValueOnce(gate.promise);
    m.more = true;
    await render();
    await act(async () => {
      const b = host.querySelector<HTMLButtonElement>('button[aria-label="Показать ещё"]');
      b?.click();
      b?.click();
    });
    expect(m.next).toHaveBeenCalledOnce();
    m.epoch = "E2";
    await act(async () => gate.reject(Error("PRIVATE_PAGE")));
    expect(m.trace).not.toHaveBeenCalled();
  });
  it("retry failure telemetry is fixed and later retry still works", async () => {
    m.error = true;
    m.refetch.mockRejectedValueOnce(Error("PRIVATE_LIST_ERROR"));
    await render();
    const retry = () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку"]')?.click();
    await act(async () => retry());
    expect(m.trace).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_LIST_ERROR");
    await act(async () => retry());
    expect(m.refetch).toHaveBeenCalledTimes(2);
  });
});
