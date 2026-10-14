// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setReaction: vi.fn(async () => undefined),
  removeReaction: vi.fn(async () => undefined),
  pollOption: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
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
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
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
  useQuery: vi.fn(),
  useInfiniteQuery: vi.fn(),
}));
vi.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "event-1" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
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
vi.mock("@gafus/core/services/feed/publication-client", () => ({
  publicationPhaseLabel: () => "",
}));
vi.mock("@/shared/components", () => ({
  AppBackButton: () => null,
  Loading: () => null,
  MascotSpinner: () => null,
  TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: () => null,
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
    (selector: (value: { user: { id: string } }) => unknown) => selector({ user: { id: "u" } }),
    { getState: () => ({ user: { id: "u" } }) },
  ),
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: {
    setPostReaction: mocks.setReaction,
    removePostReaction: mocks.removeReaction,
  },
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
vi.mock("./FeedVideo", () => ({ stopFeedVideoOutsidePosts: vi.fn() }));
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
    getSnapshot: () => [],
  },
}));
vi.mock("./telemetry", () => ({
  mobileFeedTelemetry: () => ({ enqueueOutcome: vi.fn(), flush: vi.fn() }),
}));
vi.mock("./uploads", () => ({}));

import { FeedPostCard } from "./screens";
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
  mocks.pollOption.mockClear();
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
      await act(async () => root.render(
        <FeedPostCard post={{ ...post, author: { ...post.author, role: publicRole } }} />,
      ));
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
    expect(mocks.removeReaction).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
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
