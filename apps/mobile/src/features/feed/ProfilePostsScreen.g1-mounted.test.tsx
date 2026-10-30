// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  pending: false,
  failed: false,
  enabled: true,
  postsPending: false,
  postsFailed: false,
  pageFailed: false,
  posts: [] as { id: string }[],
  hasMore: false,
  fetching: false,
  keys: [] as unknown[][],
  statusRetry: vi.fn(),
  refetch: vi.fn(),
  next: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: false,
  });
  return {
    useAuthStore: Object.assign((f: (s: unknown) => unknown) => f(state()), { getState: state }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.trace(...a) }));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: { status: vi.fn(), listProfilePosts: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.keys.push(queryKey);
    return {
      data: m.failed || m.pending ? undefined : { enabled: m.enabled },
      isPending: m.pending,
      isError: m.failed,
      refetch: () => m.statusRetry(),
    };
  },
  useInfiniteQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled: boolean }) => {
    m.keys.push([...queryKey, enabled]);
    return {
      data: { pages: [{ items: m.posts, nextCursor: m.hasMore ? "cursor-next" : null }] },
      isPending: m.postsPending,
      isError: m.postsFailed,
      isFetchNextPageError: m.pageFailed,
      hasNextPage: m.hasMore,
      isFetchingNextPage: m.fetching,
      isRefetching: false,
      refetch: () => m.refetch(),
      fetchNextPage: () => m.next(),
    };
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/shared/config", () => ({
  COLORS: { text: "black", primary: "olive", cardBackground: "white" },
  FONTS: { montserrat: "a", montserratMedium: "b" },
  SPACING: { md: 12 },
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
vi.mock("./screens", async () => {
  const R = await import("react");
  return {
    FeedPostCard: ({ post }: { post: { id: string } }) => R.createElement("span", null, post.id),
  };
});
vi.mock("@shopify/flash-list", async () => {
  const R = await import("react");
  return {
    FlashList: ({
      onEndReached,
      onRefresh,
      ListEmptyComponent,
      ListFooterComponent,
      data,
      renderItem,
    }: {
      onEndReached: () => void;
      onRefresh: () => void;
      ListEmptyComponent: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
      data?: { id: string }[];
      renderItem?: ({ item }: { item: { id: string } }) => React.ReactNode;
    }) =>
      R.createElement(
        "div",
        null,
        R.createElement("button", { "data-label": "more", onClick: onEndReached }, "more"),
        R.createElement("button", { "data-label": "refresh", onClick: onRefresh }, "refresh"),
        data?.map((item) => R.createElement("div", { key: item.id }, renderItem?.({ item }))),
        data?.length ? null : ListEmptyComponent,
        ListFooterComponent,
      ),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    StyleSheet: { create: (v: unknown) => v },
    Pressable: ({
      children,
      accessibilityLabel,
      onPress,
    }: {
      children?: React.ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
    }) =>
      R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
  };
});
import { FeedProfilePostsScreen } from "./ProfilePostsScreen";
let host: HTMLDivElement, root: Root;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render(username = "trainer1") {
  await act(async () => root.render(createElement(FeedProfilePostsScreen, { username })));
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
async function press(label: string) {
  await act(async () => button(label)?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.pending = false;
  m.failed = false;
  m.enabled = true;
  m.postsPending = false;
  m.postsFailed = false;
  m.pageFailed = false;
  m.posts = [];
  m.hasMore = false;
  m.fetching = false;
  m.keys = [];
  m.statusRetry.mockResolvedValue(undefined);
  m.refetch.mockResolvedValue(undefined);
  m.next.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V60 mounted actual profile posts", () => {
  it("guest and blank username render safe messages with no private queries", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.keys).toHaveLength(0);
    m.authed = true;
    await render("");
    expect(host.textContent).toContain("Профиль не найден");
    expect(m.keys).toHaveLength(0);
  });
  it("A→B→A with new epoch isolates both status and profile keys", async () => {
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.keys.at(-2)).toEqual(["feed", "profile-availability", "A", "E2"]);
    expect(m.keys.at(-1)?.slice(0, 5)).toEqual(["feed", "profile", "A", "E2", "trainer1"]);
  });
  it("status loading is not disabled and does not render list", async () => {
    m.pending = true;
    await render();
    expect(host.textContent).not.toContain("пока недоступен");
    expect(button("more")).toBeNull();
  });
  it("status error is distinct from server disabled and can retry", async () => {
    m.failed = true;
    m.statusRetry.mockRejectedValueOnce(Error("PRIVATE_STATUS"));
    await render();
    expect(host.textContent).toContain("Не удалось проверить доступность");
    expect(host.textContent).not.toContain("пока недоступен");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Повторить проверку доступа"]')
        ?.click(),
    );
    expect(m.statusRetry).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_STATUS");
  });
  it("explicitly disabled section does not render posts", async () => {
    m.enabled = false;
    await render();
    expect(host.textContent).toContain("пока недоступен");
    expect(button("more")).toBeNull();
  });
  it("failed list query displays neutral retry", async () => {
    m.postsFailed = true;
    m.refetch.mockRejectedValueOnce(Error("PRIVATE_POSTS"));
    await render();
    expect(host.textContent).toContain("Не удалось загрузить публикации");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку публикаций"]')
        ?.click(),
    );
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_POSTS");
  });
  it("rapid end reached invokes only one page request", async () => {
    m.hasMore = true;
    const gate = deferred<void>();
    m.next.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      button("more")?.click();
      button("more")?.click();
    });
    expect(m.next).toHaveBeenCalledOnce();
    await act(async () => gate.resolve(undefined));
  });
  it("page failure shows neutral message and allows later retry", async () => {
    m.hasMore = true;
    m.next.mockRejectedValueOnce(Error("PRIVATE_PAGE"));
    await render();
    await press("more");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_PAGE");
    await press("more");
    expect(m.next).toHaveBeenCalledTimes(2);
  });
  it("page2 failure retains profile post cards and permits only explicit same-page retry", async () => {
    m.posts = [{ id: "existing-post" }];
    m.hasMore = true;
    m.postsFailed = true;
    m.pageFailed = true;
    await render();
    expect(host.textContent).toContain("existing-post");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Не удалось загрузить публикации.");
    expect(host.textContent).not.toContain("Публикаций пока нет.");

    await press("more");
    await press("more");
    expect(m.next).not.toHaveBeenCalled();

    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Повторить следующую страницу"]')
        ?.click(),
    );
    expect(m.next).toHaveBeenCalledOnce();
    m.postsFailed = false;
    m.pageFailed = false;
    m.posts = [{ id: "existing-post" }, { id: "new-post" }];
    await render();
    expect(host.textContent).toContain("existing-post");
    expect(host.textContent).toContain("new-post");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
  });

  it("old epoch page failure cannot report into new owner view", async () => {
    m.hasMore = true;
    const gate = deferred<void>();
    m.next.mockReturnValueOnce(gate.promise);
    await render();
    await press("more");
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => gate.reject(Error("PRIVATE_LATE")));
    expect(m.trace).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
  });
  it("pull-to-refresh uses synchronous single-flight", async () => {
    const gate = deferred<void>();
    m.refetch.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      button("refresh")?.click();
      button("refresh")?.click();
    });
    expect(m.refetch).toHaveBeenCalledOnce();
    await act(async () => gate.resolve(undefined));
  });
});
