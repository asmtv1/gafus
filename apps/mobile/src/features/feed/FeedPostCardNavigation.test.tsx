// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setReaction: vi.fn(async () => undefined),
  removeReaction: vi.fn(async () => undefined),
  guardedPostReaction: vi.fn(
    async (_postId: string, _reaction: string | null, _guard: () => boolean) => ({
      id: "post-1",
      status: "published",
      myReaction: null,
    }),
  ),
  pollOption: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
  feedItems: [] as unknown[],
  feedPending: false,
  feedError: false,
  feedPageError: false,
  feedMore: false,
  feedFetching: false,
  feedNext: vi.fn(async () => undefined),
  feedRefetch: vi.fn(async () => undefined),
  stableSnapshot: [] as unknown[],
  inlineVideo: [] as { postId: string; mediaId: string; width?: number; height?: number; visible: boolean }[],
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: (event: { stopPropagation: () => void }) => void;
    accessibilityLabel?: string;
    disabled?: boolean;
  }) => (
    <div
      role="button"
      aria-label={accessibilityLabel}
      data-disabled={disabled}
      onClick={(event) => {
        if (!disabled) onPress?.({ stopPropagation: () => event.stopPropagation() });
      }}
    >
      {children}
    </div>
  ),
  ScrollView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Modal: () => null,
  RefreshControl: () => null,
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  Platform: { OS: "ios", select: (styles: { ios?: unknown }) => styles.ios },
  Alert: { alert: vi.fn() },
  AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  useFocusEffect: vi.fn(),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
vi.mock("expo-image", () => ({
  Image: ({ source }: { source?: { uri?: string } }) => <img src={source?.uri} alt="" />,
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === "feed-status"
      ? { data: { enabled: true, smartEnabled: false }, isPending: false, isError: false }
      : { data: { items: [] }, isPending: false, isError: false },
  useInfiniteQuery: () => ({
    data: { pages: [{ items: mocks.feedItems, nextCursor: mocks.feedMore ? "page-2" : null }] },
    isPending: mocks.feedPending,
    isError: mocks.feedError,
    isFetchNextPageError: mocks.feedPageError,
    isFetchingNextPage: mocks.feedFetching,
    isRefetching: false,
    hasNextPage: mocks.feedMore,
    fetchNextPage: () => mocks.feedNext(),
    refetch: () => mocks.feedRefetch(),
  }),
}));
vi.mock("@shopify/flash-list", async () => {
  const R = await import("react");
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      onEndReached,
    }: {
      data: { id: string }[];
      renderItem: ({ item }: { item: { id: string } }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      onEndReached?: () => void;
    }) =>
      R.createElement(
        "div",
        null,
        ListHeaderComponent,
        R.createElement(
          "button",
          { "aria-label": "Автодогрузка Моментов", onClick: onEndReached },
          "Автодогрузка",
        ),
        data.map((item) => R.createElement("div", { key: item.id }, renderItem({ item }))),
        data.length ? null : ListEmptyComponent,
        ListFooterComponent,
      ),
  };
});
vi.mock("expo-crypto", () => ({ randomUUID: () => "event-1" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => "new"), setItem: vi.fn(async () => undefined) },
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 50, bottom: 20, left: 0, right: 0 }),
}));
vi.mock("@gafus/types", () => ({
  FEED_REACTIONS: ["❤️", "👍"],
  FEED_LIMITS: {},
  formatFeedTime: () => "сегодня",
  getFeedAuthorRoleBadge: (role: string | null | undefined) =>
    role === "ADMIN" ? "Администратор" : role === "TRAINER" ? "Кинолог" : null,
}));
vi.mock("@gafus/core-client/feed/publication-client", () => ({
  publicationPhaseLabel: () => "",
}));
vi.mock("@/shared/components", () => ({
  AppBackButton: () => null,
  Loading: () => null,
  MascotSpinner: () => null,
  TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    label,
    onPress,
    accessibilityLabel,
  }: {
    label: string;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => (
    <button aria-label={accessibilityLabel ?? label} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("@/shared/components/media/CdnImage", () => ({
  CdnImage: () => <div data-testid="image" />,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#123", cardBackground: "#faf", text: "#333" },
  FONTS: { montserrat: "sans-serif", montserratMedium: "sans-serif" },
  SPACING: { md: 16 },
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (
      selector: (value: {
        user: { id: string };
        isAuthenticated: boolean;
        isLoading: boolean;
      }) => unknown,
    ) => selector({ user: { id: "u" }, isAuthenticated: true, isLoading: false }),
    { getState: () => ({ user: { id: "u" }, isAuthenticated: true, isLoading: false }) },
  ),
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: {
    setPostReaction: mocks.setReaction,
    removePostReaction: mocks.removeReaction,
  },
  feedPostReactionGuarded: (postId: string, reaction: string | null, guard: () => boolean) =>
    mocks.guardedPostReaction(postId, reaction, guard),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: "u", authEpoch: "nav-epoch" }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
// Navigation isolation: owner-edit/delete behavior has its own V81 mounted suite.
vi.mock("./FeedPostOwnerActions", () => ({
  FeedPostOwnerActions: () => (
    <div data-testid="menu" onClick={(event) => event.stopPropagation()}>
      •••
    </div>
  ),
}));
vi.mock("./FeedPostActions", () => ({
  FeedPostActions: () => (
    <div data-testid="menu" onClick={(event) => event.stopPropagation()}>
      •••
    </div>
  ),
  FeedReportButton: () => null,
}));
vi.mock("./FeedPollCard", () => ({
  FeedPollCard: () => (
    <div data-testid="poll">
      <div
        data-testid="pollOption"
        onClick={(event) => {
          event.stopPropagation();
          mocks.pollOption();
        }}
      >
        Вариант ответа
      </div>
    </div>
  ),
}));
vi.mock("./FeedMediaViewer", () => ({ FeedMediaViewer: () => <div data-testid="viewer" /> }));
vi.mock("./FeedCarouselDots", () => ({ FeedCarouselDots: () => null }));
vi.mock("./FeedPublicationProgress", () => ({ FeedPublicationProgress: () => null }));
vi.mock("./FeedVideo", () => ({
  FeedVideo: (props: {
    postId: string; mediaId: string; width?: number; height?: number; visible: boolean;
  }) => {
    mocks.inlineVideo.push(props);
    return <button aria-label="Воспроизвести видео"
      onClick={event => event.stopPropagation()}>Воспроизвести видео</button>;
  },
  stopFeedVideoOutsidePosts: vi.fn(),
}));
vi.mock("./FeedPollComposer", () => ({ FeedPollComposer: () => null }));
vi.mock("./FeedAlbumPicker", () => ({ FeedAlbumPicker: () => null }));
vi.mock("./FeedSortControl", () => ({ FeedSortControl: () => null }));
vi.mock("./FeedSmartPreferences", () => ({ FeedSmartPreferences: () => null }));
vi.mock("./FeedSectionShortcuts", () => ({ FeedSectionShortcuts: () => null }));
vi.mock("./SortableMediaStrip", () => ({ SortableMediaStrip: () => null }));
vi.mock("./GafusReactionProgress", () => ({ GafusReactionProgress: () => null }));
vi.mock("./publication", () => ({
  mobileFeedPublications: {
    subscribe: vi.fn(() => vi.fn()),
    getSnapshot: () => mocks.stableSnapshot,
  },
}));
vi.mock("./telemetry", () => ({
  mobileFeedTelemetry: () => ({ enqueueOutcome: vi.fn(), flush: vi.fn() }),
}));
vi.mock("./uploads", () => ({}));

import { FeedPostCard, FeedScreen } from "./screens";
import type { FeedPostDto } from "@gafus/types";

const post = {
  id: "post-1",
  author: { id: "author-1", name: "Автор", username: "tester" },
  text: "Подпись к фотографии",
  attachments: [
    {
      id: "photo-1",
      status: "ready",
      kind: "photo",
      fullUrl: "https://example.test/photo.jpg",
      width: 600,
      height: 900,
    },
  ],
  reactions: [{ emoji: "❤️", count: 1 }],
  myReaction: "❤️",
  commentCount: 4,
  viewCount: 8,
  hasPoll: false,
  publishedAt: "2026-10-14T12:00:00Z",
} as unknown as FeedPostDto;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.push.mockClear();
  mocks.setReaction.mockClear();
  mocks.removeReaction.mockClear();
  mocks.guardedPostReaction.mockClear();
  mocks.pollOption.mockClear();
  mocks.inlineVideo = [];
  mocks.feedItems = [];
  mocks.feedPending = false;
  mocks.feedError = false;
  mocks.feedPageError = false;
  mocks.feedMore = false;
  mocks.feedFetching = false;
  mocks.feedNext.mockReset().mockResolvedValue(undefined);
  mocks.feedRefetch.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function tap(selector: string) {
  const element = host.querySelector(selector) as HTMLElement | null;
  expect(element, selector).not.toBeNull();
  await act(async () => element?.click());
}

describe("mobile Moments card navigation", () => {
  it("shows only administrator and dog trainer badges beside the author", async () => {
    for (const [role, label] of [
      ["ADMIN", "Администратор"],
      ["TRAINER", "Кинолог"],
      ["MODERATOR", null],
      ["PARTNER", null],
      ["USER", null],
      [undefined, null],
    ] as const) {
      const publicRole = role === "ADMIN" || role === "TRAINER" ? role : null;
      await act(async () =>
        root.render(
          <FeedPostCard post={{ ...post, author: { ...post.author, role: publicRole } }} />,
        ),
      );
      const author = host.querySelector('[aria-label="Профиль Автор"]');
      expect(author?.textContent).toContain("Автор");
      expect(author?.textContent?.includes("Администратор")).toBe(label === "Администратор");
      expect(author?.textContent?.includes("Кинолог")).toBe(label === "Кинолог");
    }
  });

  it("opens the same detail route from background, caption and comments", async () => {
    await act(async () => root.render(<FeedPostCard post={post} />));
    await tap('[aria-label="Комментарии: 4"]');
    const caption = Array.from(host.querySelectorAll("span")).find(
      (element) => element.textContent === "Подпись к фотографии",
    );
    expect(caption).toBeDefined();
    await act(async () => caption?.click());
    await tap('div[data-disabled="false"]'); // Blank background of the whole card.
    expect(mocks.push).toHaveBeenCalledTimes(3);
    for (const call of mocks.push.mock.calls) {
      expect(call[0]).toEqual({
        pathname: "/(main)/feed/[postId]",
        params: { postId: "post-1" },
      });
    }
  });

  it("leaves profile, reaction, photo and menu taps to their own controls", async () => {
    await act(async () => root.render(<FeedPostCard post={post} />));
    await tap('[aria-label="Профиль Автор"]');
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0].pathname).toBe("/profile/[username]");
    await tap('[aria-label="Открыть фото 1 на весь экран"]');
    expect(host.querySelector('[data-testid="viewer"]')).not.toBeNull();
    await tap('[aria-label="Реакция ❤️, 1"]');
    await tap('[data-testid="menu"]');
    expect(mocks.guardedPostReaction).toHaveBeenCalledExactlyOnceWith(
      "post-1",
      null,
      expect.any(Function),
    );
    expect((mocks.guardedPostReaction.mock.calls[0]?.[2] as () => boolean)()).toBe(true);
    expect(mocks.removeReaction).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("plays signed portrait MP4 inline instead of opening the fullscreen modal or post page", async () => {
    const video = { id: "video-portrait", status: "ready", kind: "video",
      posterUrl: "https://cdn.example.test/poster.webp",
      width: 720, height: 1280,
      mp4Urls: { 360: "https://cdn.example.test/video360.mp4" } };
    await act(async () => root.render(<FeedPostCard post={{
      ...post, attachments: [video],
    } as unknown as FeedPostDto} />));
    expect(host.querySelector('[aria-label="Воспроизвести видео"]')).not.toBeNull();
    expect(mocks.inlineVideo.at(-1)).toMatchObject({
      postId: "post-1", mediaId: "video-portrait",
      width: 720, height: 1280, visible: true,
    });
    expect(host.querySelector('[aria-label="Открыть видео 1 на весь экран"]')).toBeNull();
    await tap('[aria-label="Воспроизвести видео"]');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="viewer"]')).toBeNull();
  });

  it("preserves expand-text and poll controls without opening the detail route", async () => {
    const longPost = { ...post, text: "Длинная подпись ".repeat(14), hasPoll: true };
    await act(async () => root.render(<FeedPostCard post={longPost} />));
    await tap('[aria-label="Развернуть текст публикации"]');
    expect(host.querySelector('[aria-label="Свернуть текст публикации"]')).not.toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();

    await tap('[data-testid="poll"]');
    await tap('[data-testid="pollOption"]');
    expect(mocks.pollOption).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not reopen itself on the detailed screen", async () => {
    await act(async () => root.render(<FeedPostCard post={post} detailed />));
    await tap('[aria-label="Комментарии: 4"]');
    expect(mocks.push).toHaveBeenCalledTimes(1);
    await tap('[data-disabled="true"]');
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
});
describe("mounted main Moments Feed list page-2 read", () => {
  it("preserves loaded cards, blocks auto retry and explicitly retries failed next page", async () => {
    mocks.feedItems = [post];
    mocks.feedMore = true;
    mocks.feedError = true;
    mocks.feedPageError = true;
    await act(async () => root.render(<FeedScreen />));
    expect(host.textContent).toContain("Подпись к фотографии");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Здесь пока нет публикаций.");

    const automatic = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Автодогрузка Моментов"]',
    );
    await act(async () => {
      automatic?.click();
      automatic?.click();
    });
    expect(mocks.feedNext).not.toHaveBeenCalled();

    const retry = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Повторить страницу Моментов"]',
    );
    expect(retry).not.toBeNull();
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    expect(mocks.feedNext).toHaveBeenCalledOnce();

    mocks.feedError = false;
    mocks.feedPageError = false;
    mocks.feedItems = [post, { ...post, id: "post-2", text: "Вторая публикация" }];
    await act(async () => root.render(<FeedScreen />));
    expect(host.textContent).toContain("Подпись к фотографии");
    expect(host.textContent).toContain("Вторая публикация");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
  });

  it("first-page loading/error remain distinct from truly empty list", async () => {
    mocks.feedItems = [];
    mocks.feedError = true;
    mocks.feedPageError = false;
    await act(async () => root.render(<FeedScreen />));
    expect(host.textContent).not.toContain("Здесь пока нет публикаций.");
    expect(host.textContent).toContain("Повторить загрузку Моментов");
    mocks.feedError = false;
    await act(async () => root.render(<FeedScreen />));
    expect(host.textContent).toContain("Здесь пока нет публикаций.");
  });
});
