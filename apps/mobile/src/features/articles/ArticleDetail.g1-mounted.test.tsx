// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  slug: "lesson-1",
  loading: false,
  fetching: false,
  error: false,
  article: null as null | {
    id: string;
    slug: string;
    title: string;
    createdAt: string;
    contentType: "TEXT";
    content: string;
    videoUrl: string | null;
    imageUrls: string[];
    hasAccess: boolean;
    visibility: "PUBLIC" | "PAID";
    description: string;
    isLiked: boolean;
  },
  keys: [] as unknown[][],
  articleQueryOptions: [] as Record<string, unknown>[],
  refetch: vi.fn(),
  back: vi.fn(),
  trace: vi.fn(),
  views: vi.fn(),
  likes: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
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
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-article-request-123" }));
vi.mock("@/shared/lib/api/gafus", () => ({ gafusApi: { status: vi.fn(), unlock: vi.fn() } }));
vi.mock("expo-router", () => {
  return {
    useRouter: () => ({ back: () => m.back() }),
    useLocalSearchParams: () => ({ slug: m.slug }),
    Stack: { Screen: () => null },
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; gcTime?: number; staleTime?: number;
    retry?: boolean; enabled?: boolean }) => {
    const { queryKey } = options;
    m.keys.push(queryKey);
    if (queryKey[0] === "article") {
      m.articleQueryOptions.push(options);
      return {
        data: m.loading || m.error ? undefined : { success: true, data: m.article },
        isLoading: m.loading,
        isFetching: m.fetching,
        error: m.error ? Error("PRIVATE_ARTICLE_GET_STACK") : null,
        refetch: () => m.refetch(),
      };
    }
    return { data: undefined, isFetching: false, refetch: vi.fn() };
  },
}));
vi.mock("@/shared/lib/api", () => ({
  articlesApi: { getBySlug: (...v: unknown[]) => m.get(...v),
    incrementView: (...v: unknown[]) => m.views(...v),
    toggleLike: (...v: unknown[]) => m.likes(...v) },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/articles/wrapArticleHtml", () => ({
  wrapArticleHtml: vi.fn(),
  ARTICLE_HEIGHT_MSG: "HEIGHT",
  ARTICLE_READY_MSG: "READY",
  ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS: "",
}));
vi.mock("@/shared/lib/utils/resolveImageUrl", () => ({
  resolveImageUrl: (url: string) => url.startsWith("https://") ? url : null,
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/features/app-subscription", () => ({
  getRewardedAccessPrompt: () => ({}),
  openAppSubscriptionPaywall: vi.fn(),
  RewardedAccessGate: () => null,
}));
vi.mock("@/features/rewarded-ads", () => ({
  openTargetWithRewardedAd: vi.fn(),
  rewardedAdsApi: { getStatus: vi.fn() },
}));
vi.mock("expo-image", async () => {
  const R = await import("react");
  return { Image: ({source}:{source?:{uri?:string}}) =>
    R.createElement("div", {"data-testid":"article-image", "data-src":source?.uri}) };
});
vi.mock("react-native-webview", async () => {
  const R = await import("react");
  return { WebView: ({source}:{source?:{uri?:string,html?:string}}) =>
    R.createElement("div", {"data-testid":"article-webview",
      "data-src":source?.uri, "data-html":source?.html}) };
});
vi.mock("@/features/articles/ArticleMarkdown", async () => {
  const R = await import("react");
  return { default: ({children}:{children?:React.ReactNode}) =>
    R.createElement("span", {"data-testid":"article-markdown"},children) };
});
vi.mock("@/shared/config", () => ({
  COLORS: { text: "black", textSecondary: "gray", primary: "olive", background: "white" },
  FONTS: { montserrat: "a", montserratBold: "b" },
  SPACING: { md: 12, lg: 20 },
  BORDER_RADIUS: { md: 8 },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      R.createElement("button", { "data-id": "back", onClick: onPress }, "Назад"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: () => R.createElement("div", null, "Загрузка статьи..."),
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void;
      disabled?: boolean }) =>
      R.createElement("button", { "aria-label": label, onClick: onPress, disabled }, label),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return { View: Box, ScrollView: Box, Pressable: Box, StyleSheet: { create: (v: unknown) => v } };
});
import ArticleDetail from "../../../app/(main)/articles/[slug]";
let host: HTMLDivElement, root: Root;
async function render() {
  await act(async () => root.render(createElement(ArticleDetail)));
}
const retry = async () =>
  act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку статьи"]')
      ?.click(),
  );
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.authLoading = false;
  m.slug = "lesson-1";
  m.loading = false;
  m.fetching = false;
  m.error = false;
  m.article = null;
  m.keys = [];
  m.articleQueryOptions = [];
  m.refetch.mockResolvedValue(undefined);
  m.views.mockResolvedValue({success:true});
  m.likes.mockResolvedValue({ success:true, data:{isLiked:true} });
  m.get.mockResolvedValue({ success:true, data:m.article });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V66 actual article detail safe read mounted", () => {
  it("guest article remains public and uses guest key", async () => {
    m.authed = false;
    m.loading = true;
    await render();
    expect(m.keys[0]).toEqual(["article", "guest", "public", "lesson-1"]);
    expect(host.textContent).toContain("Загрузка статьи");
  });
  it("authenticated but unverified actor has no private query", async () => {
    m.epoch = "";
    await render();
    expect(host.textContent).toContain("Загрузка статьи");
    expect(m.keys).toHaveLength(0);
  });
  it("empty or missing slug ends in not found not infinite spinner", async () => {
    m.slug = "";
    await render();
    expect(host.textContent).toContain("Статья не найдена");
    expect(m.keys).toHaveLength(0);
  });
  it("A→B→A re-login uses distinct private query and no stale content", async () => {
    m.loading = true;
    await render();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(m.keys.filter((k) => k[0] === "article").at(-1)).toEqual([
      "article",
      "A",
      "E2",
      "lesson-1",
    ]);
  });
  it("error hides server raw data, offers retry", async () => {
    m.error = true;
    await render();
    expect(host.textContent).toContain("Не удалось загрузить статью");
    expect(host.textContent).not.toContain("PRIVATE_ARTICLE_GET_STACK");
    await retry();
    expect(m.refetch).toHaveBeenCalledOnce();
  });
  it("successful empty article is not infinite loading", async () => {
    await render();
    expect(host.textContent).toContain("Статья не найдена");
    expect(host.textContent).not.toContain("Загрузка статьи");
  });
  it("stale actor cannot retry old GET", async () => {
    m.error = true;
    await render();
    m.epoch = "E2";
    await retry();
    expect(m.refetch).not.toHaveBeenCalled();
  });
  it("retry rejection logs fixed code without remote stack", async () => {
    m.error = true;
    m.refetch.mockRejectedValueOnce(Error("PRIVATE_NETWORK_STACK"));
    await render();
    await retry();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_NETWORK_STACK");
  });
  const entitled = () => ({
    id: "article-1", slug: "lesson-1", title: "Paid topic", createdAt: "2026-10-25T00:00:00Z",
    contentType: "TEXT" as const, content: "PRIVATE_PAID_ARTICLE_CONTENT",
    videoUrl: "https://media.example/private-paid-video", imageUrls: ["https://media.example/private-paid-photo"],
    hasAccess: true, visibility: "PAID" as const, description: "Public teaser",
    isLiked: false,
  });
  it("old owner GET resolved after A→B epoch change is rejected before query cache", async () => {
    m.article=entitled();
    await render();
    const fn=m.articleQueryOptions[0].queryFn as () => Promise<unknown>;
    let complete!: (value: unknown) => void;
    m.get.mockReturnValueOnce(new Promise(resolve => { complete=resolve; }));
    expect(m.views).toHaveBeenCalledTimes(1); // Existing successful mount's one-shot view.
    const pending=fn();
    expect(m.get).toHaveBeenCalledOnce();
    m.epoch="B1";m.owner="B";
    complete({success:true,data:entitled()});
    await expect(pending).rejects.toThrow("ARTICLE_ACTOR_CHANGED");
    expect(m.views).toHaveBeenCalledTimes(1); // No view for the late foreign GET.

  });
  it("old owner query cannot start a new GET after logout", async () => {
    m.article=entitled();
    await render();
    const fn=m.articleQueryOptions[0].queryFn as () => Promise<unknown>;
    m.authLoading=true;
    await expect(fn()).rejects.toThrow("ARTICLE_ACTOR_CHANGED");
    expect(m.get).not.toHaveBeenCalled();
  });
  it("paid article GET uses zero-cache, fresh entitlement and no automatic retry", async () => {
    m.article = entitled();
    await render();
    expect(m.articleQueryOptions[0]).toMatchObject({
      queryKey: ["article", "A", "E1", "lesson-1"],
      staleTime: 0, gcTime: 0, retry: false, enabled: true,
    });
  });
  it("does not display stale paid article text/media while entitlement GET revalidates", async () => {
    m.article = entitled();m.fetching = true;
    await render();
    expect(host.textContent).toContain("Загрузка статьи");
    expect(host.textContent).not.toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    expect(host.querySelector('[data-testid="article-image"]')).toBeNull();
    expect(host.querySelector('[data-testid="article-webview"]')).toBeNull();
    expect(m.views).not.toHaveBeenCalled();
  });
  it("locked PAID article hides video/photos even when server DTO mistakenly contains URLs", async () => {
    m.article={...entitled(),hasAccess:false,content:"PRIVATE_PAID_ARTICLE_CONTENT"};
    await render();
    expect(host.querySelector('[data-testid="article-image"]')).toBeNull();
    expect(host.querySelector('[data-testid="article-webview"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    expect(host.textContent).toContain("Public teaser");
  });
  it("entitled article renders text and HTTPS media when fresh access is valid", async () => {
    m.article = entitled();
    await render();
    expect(host.textContent).toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    expect(host.querySelector('[data-testid="article-image"]')?.getAttribute("data-src"))
      .toBe("https://media.example/private-paid-photo");
    expect(host.querySelector('[data-testid="article-webview"]')?.getAttribute("data-src"))
      .toBe("https://media.example/private-paid-video");
  });
  it("auth transition hides entitled private content before new binding is established", async () => {
    m.article=entitled();
    await render();
    expect(host.textContent).toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    m.authLoading=true;
    await render();
    expect(host.textContent).not.toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    expect(host.querySelector('[data-testid="article-image"]')).toBeNull();
    expect(host.querySelector('[data-testid="article-webview"]')).toBeNull();
  });
  it("sends one owner-bound view POST only after fresh article read; refetch never duplicates", async () => {
    m.article=entitled();
    await render();
    expect(m.views).toHaveBeenCalledTimes(1);
    expect(m.views.mock.calls[0][0]).toBe("lesson-1");
    expect(typeof m.views.mock.calls[0][1]).toBe("function");
    await render();
    await render();
    expect(m.views).toHaveBeenCalledTimes(1);
    m.fetching=true;
    await render();
    m.fetching=false;
    await render();
    expect(m.views).toHaveBeenCalledTimes(1);
  });
  it("a lost view ACK never retries or reveals private remote telemetry", async () => {
    m.article=entitled();
    m.views.mockRejectedValue(Error("REMOTE_SQL_PRIVATE_DETAILS"));
    await render();
    await act(async()=>Promise.resolve());
    await render();
    expect(m.views).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("REMOTE_SQL_PRIVATE_DETAILS");
  });
  it("locked article shows no like action and sends no like POST", async () => {
    m.article={...entitled(),hasAccess:false,content:"PRIVATE_SERVER_BODY"};
    await render();
    expect(host.querySelector('[aria-label="Нравится"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_SERVER_BODY");
    expect(m.likes).not.toHaveBeenCalled();
  });
  it("owner like performs one toggle and verifies ACK against fresh GET", async () => {
    m.article=entitled();
    m.likes.mockResolvedValue({success:true,data:{isLiked:true}});
    m.refetch.mockImplementation(async()=>({isError:false,data:{success:true,data:{
      ...entitled(),isLiked:true,
    }}}));
    await render();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(m.likes).toHaveBeenCalledTimes(1);
    expect(m.likes.mock.calls[0][0]).toBe("article-1");
    expect(typeof m.likes.mock.calls[0][1]).toBe("function");
    expect(m.refetch).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("не подтверждён");
  });
  it("after confirmed like and fresh owner GET, unlike is a distinct verified POST", async () => {
    m.article=entitled();
    m.likes.mockResolvedValueOnce({success:true,data:{isLiked:true}})
      .mockResolvedValueOnce({success:true,data:{isLiked:false}});
    m.refetch.mockImplementationOnce(async()=>({isError:false,data:{success:true,data:{
      ...entitled(),isLiked:true,
    }}})).mockImplementationOnce(async()=>({isError:false,data:{success:true,data:{
      ...entitled(),isLiked:false,
    }}}));
    await render();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(m.likes).toHaveBeenCalledTimes(1);
    m.article={...entitled(),isLiked:true};
    await render();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Убрать лайк"]')?.click());
    expect(m.likes).toHaveBeenCalledTimes(2);
    expect(m.refetch).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("не подтверждён");
  });
  it("a successful like ACK with inconsistent GET cannot be toggled again", async () => {
    m.article=entitled();
    m.likes.mockResolvedValueOnce({success:true,data:{isLiked:true}});
    m.refetch.mockResolvedValueOnce({isError:false,data:{success:true,data:{
      ...entitled(),isLiked:false,
    }}});
    await render();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(host.textContent).toContain("не подтверждён");
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(m.likes).toHaveBeenCalledTimes(1);
  });
  it("a lost like ACK blocks double tap and cannot leak error text", async () => {
    m.article=entitled();
    m.likes.mockRejectedValue(Error("PRIVATE_PROVIDER_LIKE_STACK"));
    await render();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(host.textContent).toContain("Повторная отправка заблокирована");
    expect(host.textContent).not.toContain("PRIVATE_PROVIDER_LIKE_STACK");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_PROVIDER_LIKE_STACK");
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.disabled).toBe(true);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Нравится"]')?.click());
    expect(m.likes).toHaveBeenCalledTimes(1);
  });
  it("no view or like POST after actor epoch changes before fresh read", async () => {
    m.article=entitled();m.fetching=true;
    await render();
    m.epoch="E2";
    m.loading=true; // New owner/epoch query key has no cached prior-principal response.
    m.fetching=false;
    await render();
    expect(host.textContent).not.toContain("PRIVATE_PAID_ARTICLE_CONTENT");
    expect(m.views).not.toHaveBeenCalled();
    expect(m.likes).not.toHaveBeenCalled();
  });
  it("changing slug obtains separate article key", async () => {
    m.loading = true;
    await render();
    m.slug = "lesson-2";
    await render();
    expect(m.keys.filter((k) => k[0] === "article").at(-1)).toEqual([
      "article",
      "A",
      "E1",
      "lesson-2",
    ]);
  });
});
