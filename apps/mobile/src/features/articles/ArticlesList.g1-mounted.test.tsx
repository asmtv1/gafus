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
  items: [] as {
    id: string;
    slug: string;
    title: string;
    updatedAt: string;
    visibility: string;
    hasAccess: boolean;
    isLiked: boolean;
    likeCount: number;
    viewCount: number;
    logoImg: null;
    imageUrls: string[];
  }[],
  keys: [] as unknown[][],
  queryOptions: [] as Record<string, unknown>[],
  get: vi.fn(),
  focus: null as null | (() => void),
  like: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  trace: vi.fn(),
  client: { invalidateQueries: (...v: unknown[]) => m.invalidate(...v) },
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: false,
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
vi.mock("@/shared/lib/api", () => ({
  articlesApi: { toggleLike: (...v: unknown[]) => m.like(...v),
    getAll: (...v: unknown[]) => m.get(...v) },
}));
vi.mock("@/shared/lib/api/articlesQuery", () => ({
  articlesQueryOptions: { queryKey: ["articles"], queryFn: vi.fn() },
}));
vi.mock("@/shared/lib/utils/mobileImageVariant", () => ({
  getArticleLogoVariantCandidates: () => [],
}));
vi.mock("@/shared/lib/utils/resolveImageUrl", () => ({ resolveImageUrl: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => m.client,
  useQuery: (opts: { queryKey: unknown[] }) => {
    const { queryKey } = opts;
    m.queryOptions.push(opts);
    m.keys.push(queryKey);
    return {
      data: m.pending || m.error ? undefined : { data: m.items },
      isPending: m.pending,
      isError: m.error,
      refetch: () => m.refetch(),
    };
  },
}));
vi.mock("expo-router", async () => {
  const R = await import("react");
  return {
    useRouter: () => ({ push: (...v: unknown[]) => m.push(...v) }),
    useFocusEffect: (fn: () => void) =>
      R.useEffect(() => {
        m.focus = fn;
        fn();
        return () => {
          m.focus = null;
        };
      }, [fn]),
  };
});
vi.mock("expo-image", () => ({
  Image: Object.assign(() => null, { prefetch: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "olive",
    primaryDark: "olive",
    text: "black",
    textSecondary: "gray",
    cardBackground: "white",
  },
  FONTS: { montserrat: "a", montserratBold: "b" },
  SPACING: { md: 12, sm: 8, xs: 4, xxl: 24 },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: () => R.createElement("span", null, "Загрузка статей..."),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: (e: React.MouseEvent) => void;
      disabled?: boolean;
    }) => R.createElement("button", { disabled, onClick: onPress }, label),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("@shopify/flash-list", async () => {
  const R = await import("react");
  return {
    FlashList: ({
      data,
      renderItem,
      ListEmptyComponent,
      ListHeaderComponent,
      refreshControl,
    }: {
      data: unknown[];
      renderItem: (x: { item: unknown }) => React.ReactNode;
      ListEmptyComponent: React.ReactNode;
      ListHeaderComponent: React.ReactNode;
      refreshControl: React.ReactNode;
    }) =>
      R.createElement(
        "div",
        null,
        ListHeaderComponent,
        refreshControl,
        ...data.map((item, i) => R.createElement("div", { key: i }, renderItem({ item }))),
        data.length ? null : ListEmptyComponent,
      ),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    StyleSheet: { create: (v: unknown) => v, absoluteFillObject: {} },
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement("button", { "data-id": "pull", onClick: onRefresh }, "pull"),
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: (e: React.MouseEvent) => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "div",
        {
          role: "button",
          "aria-label": accessibilityLabel,
          "aria-disabled": disabled,
          onClick: disabled ? undefined : onPress,
        },
        children,
      ),
    Alert: { alert: (...v: unknown[]) => m.alert(...v) },
  };
});
import ArticlesScreen from "../../../app/(main)/(tabs)/articles";
let host: HTMLDivElement, root: Root;
const fixture = () => ({
  id: "a1",
  slug: "slug-a1",
  title: "Полезная статья",
  updatedAt: "2026-10-20T10:00:00Z",
  visibility: "PUBLIC",
  hasAccess: true,
  isLiked: false,
  likeCount: 0,
  viewCount: 5,
  logoImg: null,
  imageUrls: [] as string[],
});
const barrier = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function mount() {
  await act(async () => root.render(createElement(ArticlesScreen)));
}
const tap = async (label: string) =>
  act(async () => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.click());
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.pending = false;
  m.error = false;
  m.items = [fixture()];
  m.keys = [];
  m.queryOptions=[];
  m.get.mockResolvedValue({success:true,data:[]});
  m.focus = null;
  m.like.mockResolvedValue({ success: true, data: { isLiked: true } });
  m.refetch.mockResolvedValue({ isError: false });
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
describe("AG3 V65 actual Mobile articles list source/mock", () => {
  it("guest reads public articles and cannot like", async () => {
    m.authed = false;
    await mount();
    expect(m.keys.at(-1)).toEqual(["articles", "list", "guest"]);
    expect(host.textContent).toContain("Полезная статья");
    await tap("Нравится");
    expect(m.like).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledOnce();
  });
  it("subscription-locked PUBLIC catalog cannot send like POST", async () => {
    m.items = [{...fixture(), visibility:"PUBLIC", hasAccess:false}];
    await mount();
    const like = host.querySelector<HTMLElement>('[aria-label="Нравится"]');
    expect(like?.getAttribute("aria-disabled")).toBe("true");
    await tap("Нравится");
    expect(m.like).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("list query uses zero-cache epoch owner fence before and after awaited GET", async () => {
    await mount();
    const options=m.queryOptions[0] as {
      queryFn:()=>Promise<unknown>, gcTime:number, staleTime:number, enabled:boolean,
    };
    expect(options).toMatchObject({
      queryKey:["articles","list","A:E1"],enabled:true,gcTime:0,staleTime:0,
    });
    let complete!:(v:unknown)=>void;
    m.get.mockReturnValueOnce(new Promise(resolve=>{complete=resolve;}));
    const pending=options.queryFn();
    expect(m.get).toHaveBeenCalledOnce();
    m.owner="B";m.epoch="B1";
    complete({success:true,data:[fixture()]});
    await expect(pending).rejects.toThrow("ARTICLES_ACTOR_CHANGED");
    expect(m.like).not.toHaveBeenCalled();
  });
  it("unverified actor does not mount private query", async () => {
    m.epoch = "";
    await mount();
    expect(m.keys).toHaveLength(0);
    expect(host.textContent).toContain("Загрузка статей");
  });
  it("A→B→A new epoch gets new query key", async () => {
    await mount();
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    expect(m.keys.at(-1)).toEqual(["articles", "list", "A:E2"]);
  });
  it("pending/error/empty are distinct, error neutral with retry", async () => {
    m.pending = true;
    await mount();
    expect(host.textContent).not.toContain("Полезная статья");
    m.pending = false;
    m.items = [];
    await mount();
    expect(host.textContent).toContain("Пока нет статей");
    m.error = true;
    await mount();
    expect(host.textContent).toContain("Не удалось загрузить статьи");
    await tap("Повторить загрузку статей");
    expect(m.refetch).toHaveBeenCalledOnce();
  });
  it("rapid pull refresh one flight, late failure drops on new epoch", async () => {
    const gate = barrier<{ isError: boolean }>();
    m.refetch.mockReturnValueOnce(gate.promise);
    await mount();
    await act(async () => {
      const b = host.querySelector<HTMLElement>('[data-id="pull"]');
      b?.click();
      b?.click();
    });
    expect(m.refetch).toHaveBeenCalledOnce();
    m.epoch = "E2";
    await mount();
    await act(async () => gate.resolve({ isError: true }));
    expect(host.textContent).not.toContain("Не удалось обновить статьи");
  });
  it("focus first mount no redundant invalidation, second scoped", async () => {
    await mount();
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => m.focus?.());
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["articles", "list", "A:E1"] });
  });
  it("old card cannot navigate into new session", async () => {
    await mount();
    m.epoch = "E2";
    await tap("Открыть статью «Полезная статья»");
    expect(m.push).not.toHaveBeenCalled();
  });
  it("doubletap like sends one POST until ACK", async () => {
    const gate = barrier<{ success: boolean; data: { isLiked: boolean } }>();
    m.like.mockReturnValueOnce(gate.promise);
    await mount();
    await act(async () => {
      const x = host.querySelector<HTMLElement>('[aria-label="Нравится"]');
      x?.click();
      x?.click();
    });
    expect(m.like).toHaveBeenCalledExactlyOnceWith("a1", expect.any(Function));
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => gate.resolve({ success: true, data: { isLiked: true } }));
    await tap("Нравится");
    expect(m.like).toHaveBeenCalledOnce();
  });
  it("success false is quarantined with no cache ACK", async () => {
    m.like.mockResolvedValueOnce({ success: false, error: "PRIVATE_ERROR" });
    await mount();
    await tap("Нравится");
    await tap("Нравится");
    expect(m.like).toHaveBeenCalledOnce();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат реакции неизвестен");
  });
  it("transport failure hides backend detail and blocks retry", async () => {
    m.like.mockRejectedValueOnce(Error("PRIVATE_STACK"));
    await mount();
    await tap("Нравится");
    await tap("Нравится");
    expect(m.like).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_STACK");
  });
  it("positive ACK plus cache failure never automatically retries like", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE"));
    await mount();
    await tap("Нравится");
    expect(host.textContent).toContain("Реакция сохранена");
    await tap("Нравится");
    expect(m.like).toHaveBeenCalledOnce();
  });
  it("A→B→A late ACK does not invalidate new actor", async () => {
    const gate = barrier<{ success: boolean; data: { isLiked: boolean } }>();
    m.like.mockReturnValueOnce(gate.promise);
    await mount();
    await tap("Нравится");
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    await act(async () => gate.resolve({ success: true, data: { isLiked: true } }));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
});
