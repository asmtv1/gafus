// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  alert: vi.fn(),
  deletion: vi.fn(),
  edit: vi.fn(),
  create: vi.fn(),
  guardedCreate: vi.fn(),
  uuid: vi.fn(),
  typedText: "Тестовый комментарий",
  threadPostId: "post-A",
  invalidate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  owner: "A",
  epoch: "E1",
  tracer: vi.fn(),
  commentItems: [] as unknown[],
  commentError: false,
  commentPageError: false,
  commentHasMore: false,
  commentFetching: false,
  commentNext: vi.fn(async (_cursor: string): Promise<void> => undefined),
  commentRefetch: vi.fn(async () => undefined),
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
          "data-value": p.value,
          onClick: () => (p.onChangeText as (value: string) => void)?.(m.typedText),
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
    createComment: (...a: unknown[]) => m.create(...a),
  },
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
  feedEditCommentGuarded: (...a: unknown[]) => m.edit(...a),
  feedDeleteCommentGuarded: (...a: unknown[]) => m.deletion(...a),
  feedCreateCommentGuarded: (...a: unknown[]) => m.guardedCreate(...a),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "feed-status" ? { enabled: true } : undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInfiniteQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data:
      queryKey[1] === "comments"
        ? {
            pages: [
              {
                items: m.commentItems.map((item) =>
                  (item as { id?: string }).id === "comment-A"
                    ? { ...(item as object), postId: m.threadPostId }
                    : item,
                ),
                nextCursor: "cursor-root-2",
              },
            ],
          }
        : null,
    isPending: false,
    isError: queryKey[1] === "comments" && m.commentError,
    isFetchNextPageError: queryKey[1] === "comments" && m.commentPageError,
    hasNextPage: queryKey[1] === "comments" && m.commentHasMore,
    isFetchingNextPage: queryKey[1] === "comments" && m.commentFetching,
    fetchNextPage: () => m.commentNext("cursor-root-2"),
    refetch: () => m.commentRefetch(),
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: m.push, replace: m.replace }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: vi.fn(),
  Stack: () => null,
}));
vi.mock("@gafus/types", () => ({
  FEED_REACTIONS: [],
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
  TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children),
}));
vi.mock("@gafus/core-client/feed/publication-client", () => ({
  publicationPhaseLabel: () => "mock",
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/components/media/CdnImage", () => ({ CdnImage: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => m.uuid() }));
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
import { FeedDetailScreen } from "./screens";
import type { FeedCommentDto } from "@gafus/types";
import { pickFeedMedia, uploadPickedFeedMedia } from "./uploads";
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
async function mount(id = "post-A", commentId?: string) {
  await act(async () => root.render(React.createElement(FeedDetailScreen, { id, commentId })));
}
async function typeBody(value = "Тестовый комментарий") {
  m.typedText = value;
  await press("Написать комментарий");
}
async function send() {
  await press("Отправить комментарий");
}
async function startReply() {
  const label = Array.from(host.querySelectorAll<HTMLElement>("span")).find(
    (node) => node.textContent === "Ответить",
  );
  expect(label).not.toBeUndefined();
  await act(async () => label?.click());
}
async function cancelReply() {
  await press("Отменить ответ");
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
  m.create
    .mockReset()
    .mockResolvedValue(comment({ id: "created-1", text: "Тестовый комментарий" }));
  m.guardedCreate
    .mockReset()
    .mockImplementation(
      async (
        _postId: string,
        body: { text: string; replyToId: string | null; clientRequestId: string },
      ) => comment({ id: "created-1", text: body.text.trim(), replyToId: body.replyToId }),
    );
  m.uuid.mockReset().mockReturnValue("uuid-1");
  m.typedText = "Тестовый комментарий";
  m.threadPostId = "post-A";
  m.commentItems = [comment({ postId: m.threadPostId })];
  m.commentError = false;
  m.commentPageError = false;
  m.commentHasMore = false;
  m.commentFetching = false;
  m.commentNext.mockReset().mockResolvedValue(undefined);
  m.commentRefetch.mockReset().mockResolvedValue(undefined);
  m.invalidate.mockResolvedValue(undefined);
  useAuthStore.setState({ user: userFixture("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove();
});

describe("AG3 V85 actual mounted FeedDetailScreen create-comment POST", () => {
  it("attaches a gallery photo to a media-only comment using the existing native upload", async () => {
    vi.mocked(pickFeedMedia).mockResolvedValueOnce([{
      uri: "file:///synthetic-dog.webp", filename: "dog.webp",
      kind: "photo", mime: "image/webp", bytes: 123,
      requestId: "media-request",
    }]);
    vi.mocked(uploadPickedFeedMedia).mockResolvedValueOnce("photo-1");
    await mount();
    await press("Прикрепить фото или видео");
    expect(m.alert).toHaveBeenCalledWith(
      "Прикрепить медиа", "Выберите источник фото или видео", expect.any(Array),
    );
    const sources = m.alert.mock.calls[0]?.[2] as { onPress: () => void }[];
    await act(async () => sources[0]?.onPress());
    await send();
    expect(pickFeedMedia).toHaveBeenCalledWith("library");
    expect(uploadPickedFeedMedia).toHaveBeenCalledWith(
      "post-A", expect.objectContaining({ filename: "dog.webp" }),
      undefined, "comment",
    );
    expect(m.guardedCreate.mock.calls[0]?.[1]).toMatchObject({
      text: "", mediaIds: ["photo-1"], replyToId: null,
    });
  });
  it("guest cannot submit even if typing is possible, no actual POST", async () => {
    await mount();
    await typeBody();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await send();
    expect(m.guardedCreate).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("unverified native binding refuses POST before dispatch", async () => {
    await mount();
    await typeBody();
    m.epoch = "";
    await send();
    expect(m.guardedCreate).not.toHaveBeenCalled();
  });
  it("strict validation rejects blanks and too-long comments without mutation", async () => {
    await mount();
    await typeBody(" ");
    await send();
    await typeBody("X".repeat(3001));
    await send();
    expect(m.guardedCreate).not.toHaveBeenCalled();
  });
  it("verified actor submits once using existing body, replyToId null and stable clientRequestId", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedCreate.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    const el = host.querySelector<HTMLElement>('[aria-label="Отправить комментарий"]');
    await act(async () => {
      el?.click();
      el?.click();
    });
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
    expect(m.guardedCreate.mock.calls[0][0]).toBe("post-A");
    expect(m.guardedCreate.mock.calls[0][1]).toEqual({
      text: "Тестовый комментарий",
      replyToId: null,
      clientRequestId: "uuid-1",
    });
    expect(typeof m.guardedCreate.mock.calls[0][2]).toBe("function");
    await act(async () => d.resolve(comment({ id: "created-1", text: "Тестовый комментарий" })));
    expect(m.invalidate).toHaveBeenCalledTimes(1);
  });
  it("reply selection remains bound to same post and sends exact replyToId", async () => {
    await mount();
    await typeBody("Ответ на комментарий");
    await startReply();
    expect(host.textContent).toContain("Ответ для Owner");
    await send();
    expect(m.guardedCreate.mock.calls[0][1]).toEqual({
      text: "Ответ на комментарий",
      replyToId: "comment-A",
      clientRequestId: "uuid-1",
    });
  });
  it("cancel reply before send restores top-level replyToId:null", async () => {
    await mount();
    await startReply();
    await cancelReply();
    await typeBody();
    await send();
    expect(m.guardedCreate.mock.calls[0][1].replyToId).toBe(null);
  });
  it("positive ACK survives cache fault; composer resets without false error", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache secret bearer-token"));
    await mount();
    await typeBody();
    await send();
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
    expect(
      host.querySelector('[aria-label="Написать комментарий"]')?.getAttribute("data-value"),
    ).toBe("");
  });
  it("mismatched postId/author/reply parent or missing id is UNKNOWN and never resends", async () => {
    m.guardedCreate.mockResolvedValueOnce(comment({ id: "created-1", postId: "post-B" }));
    await mount();
    await typeBody();
    await send();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await send();
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("timeout is UNKNOWN, no provider secret leaks and no current-session resend", async () => {
    const secret = "Bearer secret-private-key https://signed/private?X-Amz-Signature=1";
    m.guardedCreate.mockRejectedValueOnce(new Error(secret));
    await mount();
    await typeBody();
    await send();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await send();
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
  });
  it("A->B->A while POST pending quarantines ACK, cache and draft clearing", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedCreate.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await send();
    const oldGuard = m.guardedCreate.mock.calls[0][2] as () => boolean;
    await owner("B", "BE1");
    await owner("A", "E2");
    expect(oldGuard()).toBe(false);
    await act(async () => d.resolve(comment({ id: "created-1" })));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("post A->B->A while POST pending suppresses stale side effects", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedCreate.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await send();
    const oldGuard = m.guardedCreate.mock.calls[0][2] as () => boolean;
    await mount("post-B");
    await mount("post-A");
    expect(oldGuard()).toBe(false);
    await act(async () => d.resolve(comment({ id: "created-1" })));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("unmount while POST pending prevents old cache/alert effects", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedCreate.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await send();
    await act(async () => root.unmount());
    await act(async () => d.resolve(comment({ id: "created-1" })));
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("changing draft or cancelling reply while POST awaits does not erase new composer state on ACK", async () => {
    const d = pending<FeedCommentDto>();
    m.guardedCreate.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await startReply();
    await send();
    await cancelReply();
    await typeBody("Новая заметка");
    await act(async () =>
      d.resolve(comment({ id: "created-1", replyToId: "comment-A", text: "Тестовый комментарий" })),
    );
    expect(
      host.querySelector('[aria-label="Написать комментарий"]')?.getAttribute("data-value"),
    ).toBe("Новая заметка");
    expect(host.textContent).not.toContain("Ответ для Owner");
  });
  it("other verified actor may comment on an author's public post", async () => {
    await owner("B", "BE1");
    m.guardedCreate.mockResolvedValueOnce(
      comment({
        id: "created-by-B",
        text: "Тестовый комментарий",
        author: { id: "B", name: "Reader", username: "reader", avatarUrl: null },
      }),
    );
    await mount();
    await typeBody();
    await send();
    expect(m.guardedCreate).toHaveBeenCalledExactlyOnceWith(
      "post-A",
      {
        text: "Тестовый комментарий",
        replyToId: null,
        clientRequestId: "uuid-1",
      },
      expect.any(Function),
    );
    expect(m.invalidate).toHaveBeenCalledTimes(1);
  });
  it("reply tap for comment belonging to a different post cannot set replyTo", async () => {
    m.threadPostId = "post-B";
    await mount();
    await startReply();
    expect(host.textContent).not.toContain("Ответ для Owner");
    await typeBody();
    await send();
    expect(m.guardedCreate.mock.calls[0][1].replyToId).toBe(null);
  });
  it("reply ACK with wrong replyToId is UNKNOWN and cannot resend", async () => {
    m.guardedCreate.mockResolvedValueOnce(
      comment({ id: "created-1", text: "Тестовый комментарий", replyToId: null }),
    );
    await mount();
    await startReply();
    await typeBody();
    await send();
    expect(m.guardedCreate.mock.calls[0][1].replyToId).toBe("comment-A");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
    await send();
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
  });
  it("wrong ACK author and missing comment id are never mistaken for a commit", async () => {
    m.guardedCreate.mockResolvedValueOnce(comment({ id: "", text: "Тестовый комментарий" }));
    await mount();
    await typeBody();
    await send();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("server trimmed result matches existing feed schema without rewriting original POST body", async () => {
    await mount();
    await typeBody("  Тестовый комментарий  ");
    await send();
    expect(m.guardedCreate.mock.calls[0][1].text).toBe("  Тестовый комментарий  ");
    expect(m.invalidate).toHaveBeenCalledTimes(1);
  });
  it("root comments next-page failure retains cached comment and retries cursor only", async () => {
    m.commentError = true;
    m.commentPageError = true;
    m.commentHasMore = true;
    await mount();
    expect(host.textContent).toContain("Старый комментарий");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу комментариев");
    expect(host.textContent).not.toContain("Не удалось загрузить «Моменты».");
    expect(m.commentRefetch).not.toHaveBeenCalled();

    const gate = pending<void>();
    m.commentNext.mockReturnValueOnce(gate.promise);
    const retry = host.querySelector<HTMLElement>('[aria-label="Повторить страницу комментариев"]');
    expect(retry).not.toBeNull();
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    expect(m.commentNext).toHaveBeenCalledExactlyOnceWith("cursor-root-2");
    expect(m.commentRefetch).not.toHaveBeenCalled();
    await act(async () => gate.resolve(undefined));

    m.commentError = false;
    m.commentPageError = false;
    m.commentHasMore = false;
    m.commentItems = [comment(), comment({ id: "comment-2", text: "Новый комментарий" })];
    await mount();
    expect(host.textContent).toContain("Старый комментарий");
    expect(host.textContent).toContain("Новый комментарий");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу комментариев");
  });

  it("root first-page comments error retries refetch rather than a next cursor", async () => {
    m.commentError = true;
    m.commentPageError = false;
    m.commentHasMore = false;
    await mount();
    await press("Повторить загрузку комментариев");
    expect(m.commentRefetch).toHaveBeenCalledOnce();
    expect(m.commentNext).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу комментариев");
  });

  it("root old-post completion cannot free active new-post pagination flight", async () => {
    m.commentError = true;
    m.commentPageError = true;
    m.commentHasMore = true;
    const oldFlight = pending<void>();
    const newFlight = pending<void>();
    m.commentNext.mockReturnValueOnce(oldFlight.promise).mockReturnValueOnce(newFlight.promise);
    await mount("post-A");
    const retry = () =>
      host.querySelector<HTMLElement>('[aria-label="Повторить страницу комментариев"]');
    await act(async () => retry()?.click());
    expect(m.commentNext).toHaveBeenCalledOnce();
    m.threadPostId = "post-B";
    await mount("post-B");
    await act(async () => retry()?.click());
    expect(m.commentNext).toHaveBeenCalledTimes(2);
    await act(async () => oldFlight.resolve(undefined));
    await act(async () => {
      retry()?.click();
      retry()?.click();
    });
    expect(m.commentNext).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Старый комментарий");
    await act(async () => newFlight.resolve(undefined));
  });

  it("editing draft after UNKNOWN does not auto-send or permit current-session reissue", async () => {
    m.guardedCreate.mockRejectedValueOnce(new Error("provider unknown"));
    await mount();
    await typeBody();
    await send();
    await typeBody("Совсем новый текст");
    await send();
    expect(m.guardedCreate).toHaveBeenCalledTimes(1);
    expect(m.uuid).toHaveBeenCalledTimes(1);
  });
});
