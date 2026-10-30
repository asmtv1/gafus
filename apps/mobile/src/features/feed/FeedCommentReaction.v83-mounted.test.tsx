// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  alert: vi.fn(),
  deletion: vi.fn(),
  edit: vi.fn(),
  reaction: vi.fn(),
  guardedReaction: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  owner: "A",
  epoch: "E1",
  tracer: vi.fn(),
  replyItems: [] as unknown[],
  replyError: false,
  replyPageError: false,
  replyHasMore: false,
  replyFetching: false,
  replyNext: vi.fn(async (_cursor: string): Promise<void> => undefined),
  replyRefetch: vi.fn(async () => undefined),
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const node = (tag: string) => (p: Record<string, unknown>) =>
    R.createElement(
      tag,
      {
        onClick: p.onPress,
        disabled: p.disabled,
        "aria-label": p.accessibilityLabel,
      },
      p.children as React.ReactNode,
    );
  return {
    Alert: { alert: m.alert },
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    ActivityIndicator: node("div"),
    KeyboardAvoidingView: node("div"),
    Modal: node("div"),
    Platform: { OS: "android" },
    Pressable: node("div"),
    ScrollView: node("div"),
    StyleSheet: { create: (v: unknown) => v, absoluteFill: {}, hairlineWidth: 1 },
    Text: node("span"),
    TextInput: (p: Record<string, unknown>) =>
      React.createElement(
        "button",
        {
          "aria-label": p.accessibilityLabel ?? "Редактировать комментарий",
          onClick: () => (p.onChangeText as (value: string) => void)?.("Изменённый текст"),
        },
        "Изменить текст",
      ),
    View: node("div"),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{
      user: { id: string } | null;
      isAuthenticated: boolean;
      isLoading: boolean;
    }>(() => ({ user: { id: "A" }, isAuthenticated: true, isLoading: false })),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.epoch ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: {
    deletePost: (...a: unknown[]) => m.deletion(...a),
    editComment: (...a: unknown[]) => m.edit(...a),
    deleteComment: (...a: unknown[]) => m.deletion(...a),
    setCommentReaction: (...a: unknown[]) => m.reaction(...a),
    removeCommentReaction: (...a: unknown[]) => m.reaction(...a),
  },
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
  feedEditCommentGuarded: (...a: unknown[]) => m.edit(...a),
  feedDeleteCommentGuarded: (...a: unknown[]) => m.deletion(...a),
  feedCommentReactionGuarded: (...a: unknown[]) => m.guardedReaction(...a),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useQuery: vi.fn(),
  useInfiniteQuery: () => ({
    data: { pages: [{ items: m.replyItems, nextCursor: "cursor-page2" }] },
    isPending: false,
    isError: m.replyError,
    isFetchNextPageError: m.replyPageError,
    hasNextPage: m.replyHasMore,
    isFetchingNextPage: m.replyFetching,
    refetch: () => m.replyRefetch(),
    fetchNextPage: () => m.replyNext("cursor-page2"),
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: m.push, replace: m.replace }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: vi.fn(),
  Stack: () => null,
}));
vi.mock("@gafus/types", () => ({
  FEED_REACTIONS: ["❤️", "😂", "🐶", "🔥", "👍"],
  FEED_LIMITS: { commentCharacters: 3000 },
  countFeedCharacters: (value: string) => [...value].length,
  formatFeedTime: () => "today",
  getFeedAuthorRoleBadge: () => null,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#452", text: "#000", textSecondary: "#777" },
  FONTS: { montserrat: "fixture", montserratMedium: "fixture" },
  SPACING: { sm: 1, md: 2 },
}));
vi.mock("@/shared/components", () => ({
  Button: () => null,
  AppBackButton: () => null,
  Loading: () => null,
  MascotSpinner: () => null,
  TexturedSafeAreaView: () => null,
}));
vi.mock("@gafus/core-client/feed/publication-client", () => ({
  publicationPhaseLabel: () => "mock",
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/components/media/CdnImage", () => ({ CdnImage: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("./publication", () => ({
  mobileFeedPublications: { subscribe: () => () => undefined, getSnapshot: () => [] },
}));
vi.mock("./uploads", () => ({
  pickFeedMedia: vi.fn(),
  pickFeedPollOptionPhoto: vi.fn(),
  uploadPickedFeedMedia: vi.fn(),
  checkFeedPickedMedia: vi.fn(),
}));
vi.mock("./FeedVideo", () => ({ FeedVideo: () => null, stopFeedVideoOutsidePosts: vi.fn() }));
vi.mock("./telemetry", () => ({ mobileFeedTelemetry: vi.fn() }));
vi.mock("./FeedMediaViewer", () => ({ FeedMediaViewer: () => null }));
vi.mock("./feedMediaLayout", () => ({ getFeedPreviewHeight: () => 300 }));
vi.mock("./GafusReactionProgress", () => ({ GafusReactionProgress: () => null }));
vi.mock("./FeedAlbumPicker", () => ({ FeedAlbumPicker: () => null }));
vi.mock("./FeedCarouselDots", () => ({ FeedCarouselDots: () => null }));
vi.mock("./FeedPublicationProgress", () => ({ FeedPublicationProgress: () => null }));
vi.mock("./FeedPollCard", () => ({ FeedPollCard: () => null }));
vi.mock("./FeedPollComposer", () => ({ FeedPollComposer: () => null }));
vi.mock("./FeedSortControl", () => ({ FeedSortControl: () => null }));
vi.mock("./FeedSmartPreferences", () => ({ FeedSmartPreferences: () => null }));
vi.mock("./SortableMediaStrip", () => ({ SortableMediaStrip: () => null }));
vi.mock("./composeToolIconData", () => ({ composeToolIconUri: () => "mock" }));
vi.mock("./bookmarkArtwork", () => ({ BOOKMARK_ARTWORK_URI: "data:mock" }));
vi.mock("./momentsHeaderArtwork", () => ({ MOMENTS_HEADER_URI: "data:mock" }));
vi.mock("./FeedPostActions", async () => {
  const R = await import("react");
  return {
    FeedPostActions: ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) =>
      R.createElement(
        "div",
        {},
        R.createElement(
          "button",
          {
            "aria-label": "Owner edit action",
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation();
              onEdit();
            },
          },
          "Редактировать",
        ),
        R.createElement(
          "button",
          {
            "aria-label": "Owner delete action",
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation();
              onDelete();
            },
          },
          "Удалить",
        ),
      ),
    FeedReportButton: () => null,
  };
});
import { useAuthStore } from "@/shared/stores";
import { CommentRow } from "./screens";
import type { FeedCommentDto } from "@gafus/types";
const userFixture = (id: string) => ({
  id,
  username: id.toLowerCase(),
  email: null,
  phone: null,
  role: "USER" as const,
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const comment = (change: Partial<FeedCommentDto> = {}): FeedCommentDto => ({
  id: "comment-A",
  postId: "post-A",
  author: { id: "A", name: "Owner", username: "owner", avatarUrl: null },
  text: "Старый комментарий",
  createdAt: "2026-10-21T00:00:00.000Z",
  editedAt: null,
  editUntil: "2026-10-22T00:00:00.000Z",
  rootId: null,
  replyToId: null,
  replyToName: null,
  deleted: false,
  replyCount: 0,
  reactions: [],
  myReaction: null,
  canEdit: true,
  canDelete: true,
  ...change,
});
async function mount(change: Partial<FeedCommentDto> = {}, contextPostId = "post-A") {
  await act(async () =>
    root.render(
      React.createElement(CommentRow, {
        item: comment(change),
        postId: contextPostId,
        onReply: vi.fn(),
      }),
    ),
  );
}
async function press(label: string) {
  const el =
    host.querySelector<HTMLElement>(`[aria-label="${label}"]`) ??
    Array.from(host.querySelectorAll<HTMLElement>("div,button")).find(
      (e) => e.textContent === label && e.getAttribute("aria-label") === null,
    );
  expect(el).not.toBeNull();
  await act(async () => el?.click());
}
function pending<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function owner(id: string, epoch: string) {
  m.owner = id;
  m.epoch = epoch;
  await act(async () => useAuthStore.setState({ user: userFixture(id), isAuthenticated: true }));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.deletion.mockReset().mockResolvedValue({ id: "comment-A" });
  m.edit.mockReset().mockResolvedValue(comment());
  m.reaction.mockReset().mockResolvedValue(comment({ myReaction: "❤️" }));
  m.guardedReaction.mockReset().mockResolvedValue(comment({ myReaction: "❤️" }));
  m.invalidate.mockResolvedValue(undefined);
  m.replyItems = [];
  m.replyError = false;
  m.replyPageError = false;
  m.replyHasMore = false;
  m.replyFetching = false;
  m.replyNext.mockReset().mockResolvedValue(undefined);
  m.replyRefetch.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ user: userFixture("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove();
});

const withHeart = (): Partial<FeedCommentDto> => ({
  reactions: [{ emoji: "❤️", count: 1 }],
  myReaction: null,
});
const withMine = (): Partial<FeedCommentDto> => ({
  reactions: [{ emoji: "❤️", count: 1 }],
  myReaction: "❤️",
});
async function pressHeart() {
  await press("Реакция ❤️, 1");
}
describe("AG3 V83 real CommentRow reaction set/remove", () => {
  it("guest cannot send comment reaction while row remains publicly visible", async () => {
    await mount(withHeart());
    await act(async () => useAuthStore.setState({ isAuthenticated: false, user: null }));
    await pressHeart();
    expect(m.guardedReaction).not.toHaveBeenCalled();
    expect(m.reaction).not.toHaveBeenCalled();
  });
  it("foreign authenticated reader may react to another owner's comment", async () => {
    await owner("B", "BE1");
    await mount({
      ...withHeart(),
      author: { id: "A", name: "Owner", username: "owner", avatarUrl: null },
    });
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledExactlyOnceWith(
      "comment-A",
      "❤️",
      expect.any(Function),
    );
    expect((m.guardedReaction.mock.calls[0][2] as () => boolean)()).toBe(true);
  });
  it("invalid parent postId context never sends any PUT/DELETE reaction", async () => {
    await mount(withHeart(), "other-post");
    await pressHeart();
    expect(m.guardedReaction).not.toHaveBeenCalled();
  });
  it("same-turn rapid duplicate reaction tap issues one guarded PUT with exact id", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(withHeart());
    const el = host.querySelector<HTMLElement>('[aria-label="Реакция ❤️, 1"]');
    await act(async () => {
      el?.click();
      el?.click();
    });
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
    expect(m.guardedReaction.mock.calls[0].slice(0, 2)).toEqual(["comment-A", "❤️"]);
    await act(async () => d.resolve(comment({ ...withMine() })));
  });
  it("positive exact ACK survives cache failure, explicit second tap performs guarded DELETE", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache offline"));
    await mount(withHeart());
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
    m.guardedReaction.mockResolvedValueOnce(comment({ ...withHeart() }));
    await pressHeart();
    expect(m.guardedReaction.mock.calls[1].slice(0, 2)).toEqual(["comment-A", null]);
  });
  it("UNKNOWN provider failure hides sensitive fields and disallows repeat mutation", async () => {
    const secret = "Bearer hidden-private-token https://signed/s3?token=private";
    m.guardedReaction.mockRejectedValueOnce(new Error(secret));
    await mount(withHeart());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
  });
  it("malformed ACK wrong comment or postId cannot claim reaction success", async () => {
    m.guardedReaction.mockResolvedValueOnce(comment({ id: "other-comment", myReaction: "❤️" }));
    await mount(withHeart());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("A->B->A while reaction pending drops stale ACK and cache effects", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(withHeart());
    await pressHeart();
    const guard = m.guardedReaction.mock.calls[0][2] as () => boolean;
    await owner("B", "BE1");
    await owner("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => d.resolve(comment({ ...withMine() })));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("nested text page2 failure retains cached reply and retries only next cursor once", async () => {
    m.replyItems = [
      comment({ id: "reply-1", rootId: "comment-A", replyCount: 0, text: "Уже загруженный ответ" }),
    ];
    m.replyError = true;
    m.replyPageError = true;
    m.replyHasMore = true;
    await mount({ replyCount: 4 });
    await press("Ответы · 4");
    expect(host.textContent).toContain("Уже загруженный ответ");
    expect(host.textContent).not.toContain("Не удалось загрузить все ответы");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу ответов");
    expect(host.querySelector('[aria-label="Повторить страницу ответов ветки"]')).not.toBeNull();
    expect(m.replyRefetch).not.toHaveBeenCalled();

    const gate = pending<void>();
    m.replyNext.mockReturnValueOnce(gate.promise);
    const retry = host.querySelector<HTMLElement>(
      '[aria-label="Повторить страницу ответов ветки"]',
    );
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    expect(m.replyNext).toHaveBeenCalledExactlyOnceWith("cursor-page2");
    expect(m.replyRefetch).not.toHaveBeenCalled();
    await act(async () => gate.resolve(undefined));

    m.replyPageError = false;
    m.replyError = false;
    m.replyHasMore = false;
    m.replyItems = [
      ...m.replyItems,
      comment({
        id: "reply-2",
        rootId: "comment-A",
        replyCount: 0,
        text: "Следующий ответ",
      }),
    ];
    await mount({ replyCount: 4 });
    expect(host.textContent).toContain("Уже загруженный ответ");
    expect(host.textContent).toContain("Следующий ответ");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу ответов");
  });

  it("nested first-page error offers refetch without requesting a next page", async () => {
    m.replyError = true;
    m.replyPageError = false;
    m.replyHasMore = false;
    await mount({ replyCount: 3 });
    await press("Ответы · 3");
    await press("Повторить загрузку ответов");
    expect(m.replyRefetch).toHaveBeenCalledOnce();
    expect(m.replyNext).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу ответов");
  });

  it("nested old actor page completion cannot release new actor page flight", async () => {
    m.replyItems = [
      comment({ id: "reply-1", rootId: "comment-A", replyCount: 0, text: "Сохранённый ответ" }),
    ];
    m.replyError = true;
    m.replyPageError = true;
    m.replyHasMore = true;
    const oldFlight = pending<void>();
    const newFlight = pending<void>();
    m.replyNext.mockReturnValueOnce(oldFlight.promise).mockReturnValueOnce(newFlight.promise);
    await mount({ replyCount: 4 });
    await press("Ответы · 4");
    const retry = () =>
      host.querySelector<HTMLElement>('[aria-label="Повторить страницу ответов ветки"]');
    await act(async () => retry()?.click());
    expect(m.replyNext).toHaveBeenCalledTimes(1);
    await owner("B", "BE1");
    await mount({ replyCount: 4 });
    await press("Ответы · 4");
    await act(async () => retry()?.click());
    expect(m.replyNext).toHaveBeenCalledTimes(2);
    await act(async () => oldFlight.resolve(undefined));
    await act(async () => {
      retry()?.click();
      retry()?.click();
    });
    expect(m.replyNext).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Сохранённый ответ");
    await act(async () => newFlight.resolve(undefined));
  });

  it("unmount while reaction pending rejects stale UI effects", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(withHeart());
    await pressHeart();
    await act(async () => root.unmount());
    await act(async () => d.resolve(comment({ ...withMine() })));
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
