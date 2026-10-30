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
  saveRevision: vi.fn(),
  publishPost: vi.fn(),
  editor: vi.fn(),
  createdPost: vi.fn(),
  editorData: null as unknown as FeedPostEditorDto,
  uuid: vi.fn(),
  typedText: "Тестовый комментарий",
  threadPostId: "post-A",
  invalidate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  enqueue: vi.fn(),
  publicationSnapshot: [] as unknown[],
  editRoute: "post-A" as string | undefined,
  pendingRows: [] as { id: string; status: "draft" | "pending" | "failed"; text: string; attachments: [] }[],
  pendingUpdatedAt: 1,
  pendingIsSuccess: true,
  pendingIsFetching: false,
  owner: "A",
  epoch: "E1",
  tracer: vi.fn(),
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
    getEditor: (...a: unknown[]) => m.editor(...a),
    createPost: (...a: unknown[]) => m.createdPost(...a),
    saveRevision: (...a: unknown[]) => m.saveRevision(...a),
    publishPost: (...a: unknown[]) => m.publishPost(...a),
  },
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
  feedEditCommentGuarded: (...a: unknown[]) => m.edit(...a),
  feedDeleteCommentGuarded: (...a: unknown[]) => m.deletion(...a),
  feedCreateCommentGuarded: (...a: unknown[]) => m.guardedCreate(...a),
  feedSaveRevisionGuarded: (...a: unknown[]) => m.saveRevision(...a),
  feedPublishPostGuarded: (...a: unknown[]) => m.publishPost(...a),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data:
      queryKey[0] === "feed-status"
        ? { enabled: true }
        : queryKey[1] === "editor"
          ? m.editorData
          : queryKey[1] === "pending"
            ? { items: m.pendingRows, nextCursor: null }
            : undefined,
    isPending: false,
    isError: false,
    isSuccess: queryKey[1] !== "pending" || m.pendingIsSuccess,
    isFetching: queryKey[1] === "pending" && m.pendingIsFetching,
    dataUpdatedAt: queryKey[1] === "pending" ? m.pendingUpdatedAt : 1,
    refetch: vi.fn(),
  }),
  useInfiniteQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data:
      queryKey[1] === "comments"
        ? { pages: [{ items: [comment({ postId: m.threadPostId })] }] }
        : null,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: m.push, replace: m.replace }),
  useLocalSearchParams: () => ({ edit: m.editRoute }),
  useFocusEffect: vi.fn(),
  Stack: Object.assign(() => null, { Screen: () => null }),
}));
vi.mock("@gafus/types", () => ({
  FEED_REACTIONS: [],
  FEED_LIMITS: { commentCharacters: 3000, postCharacters: 10000, maxAttachments: 10, maxVideos: 3 },
  countFeedCharacters: (value: string) => [...value].length,
  getFeedUploadedFilesPercent: () => null,
  formatFeedTime: () => "today",
  getFeedAuthorRoleBadge: () => null,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#452", text: "#000", textSecondary: "#777" },
  FONTS: { montserrat: "fixture", montserratMedium: "fixture" },
  SPACING: { sm: 1, md: 2 },
}));
vi.mock("@/shared/components", () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled: boolean;
  }) => React.createElement("button", { "aria-label": label, onClick: onPress, disabled }, label),
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
  mobileFeedPublications: {
    subscribe: () => () => undefined, getSnapshot: () => m.publicationSnapshot,
    enqueue: (...a: unknown[]) => m.enqueue(...a),
  },
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
import { FeedComposeScreen, FeedPublicationQueue } from "./screens";
import type { FeedCommentDto, FeedPostEditorDto } from "@gafus/types";
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
async function mount() {
  await act(async () => root.render(React.createElement(FeedComposeScreen)));
}
async function typeBody(value = "Редакция публикации") {
  m.typedText = value;
  await press("Редактировать комментарий");
}
async function save() {
  await press("Сохранить изменения");
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
  m.editRoute = "post-A";
  m.pendingRows = [];
  m.pendingUpdatedAt = 1;
  m.pendingIsSuccess = true;
  m.pendingIsFetching = false;
  m.publicationSnapshot = [];
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
  m.editorData = {
    id: "post-A",
    author: { id: "A", username: "owner", name: "Owner", avatarUrl: null },
    canEdit: true,
    canDelete: true,
    text: "Старая публикация",
    status: "published",
    createdAt: "2026-10-21T00:00:00.000Z",
    publishedAt: "2026-10-21T00:00:00.000Z",
    editedAt: null,
    editUntil: null,
    version: 2,
    attachments: [],
    reactions: [],
    myReaction: null,
    viewCount: 0,
    commentCount: 0,
    pendingRevision: null,
  } satisfies FeedPostEditorDto;
  m.saveRevision.mockReset().mockResolvedValue({
    ...m.editorData,
    version: 3,
    pendingRevision: {
      id: "rev-3",
      status: "draft",
      text: "Редакция публикации",
      attachmentIds: [],
      errorCode: null,
      errorMessage: null,
    },
  });
  m.publishPost.mockReset().mockResolvedValue({
    ...m.editorData,
    version: 3,
    pendingRevision: {
      id: "rev-3",
      status: "pending",
      text: "Редакция публикации",
      attachmentIds: [],
      errorCode: null,
      errorMessage: null,
    },
  });
  m.editor.mockReset().mockImplementation(async () => m.editorData);
  m.createdPost.mockReset();
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

describe("V86 actual FeedComposeScreen edit-only revision and publish existing flow", () => {
  it("foreign verified actor cannot write revision even if stale canEdit:true", async () => {
    await owner("B", "BE1");
    await mount();
    await typeBody();
    await save();
    expect(m.saveRevision).not.toHaveBeenCalled();
    expect(m.createdPost).not.toHaveBeenCalled();
  });
  it("guest or unverified actor cannot issue revision or publish", async () => {
    await mount();
    await typeBody();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await save();
    expect(m.saveRevision).not.toHaveBeenCalled();
  });
  it("duplicate save click sends one guarded revision for original id and expected version", async () => {
    const d = pending<unknown>();
    m.saveRevision.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    const el = host.querySelector<HTMLButtonElement>('[aria-label="Сохранить изменения"]');
    await act(async () => {
      el?.click();
      el?.click();
    });
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
    expect(m.saveRevision.mock.calls[0][0]).toBe("post-A");
    expect(m.saveRevision.mock.calls[0][1]).toMatchObject({
      expectedVersion: 2,
      text: "Редакция публикации",
      attachmentIds: [],
    });
    await act(async () => d.resolve({ ...m.editorData, version: 3 }));
  });
  it("wrong id or version revision ACK does not publish or navigate", async () => {
    m.saveRevision.mockResolvedValueOnce({ ...m.editorData, id: "other", version: 3 });
    await mount();
    await typeBody();
    await save();
    expect(m.publishPost).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("UNKNOWN revision failure never retries current-session or reveals provider URL", async () => {
    m.saveRevision.mockRejectedValueOnce(new Error("Bearer provider-raw-private-secret"));
    await mount();
    await typeBody();
    await save();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("provider-raw-private-secret");
    await save();
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
  });
  it("A->B->A after pending revision ignores old ACK and never publishes", async () => {
    const d = pending<unknown>();
    m.saveRevision.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await save();
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => d.resolve({ ...m.editorData, version: 3 }));
    expect(m.publishPost).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("accepted existing-post revision navigates directly to Moments, not post details", async () => {
    await mount();
    await typeBody();
    await save();
    expect(m.publishPost).toHaveBeenCalledTimes(1);
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("/(main)/(tabs)/feed");
    expect(m.push).not.toHaveBeenCalled();
  });
  it("accepted server pending edit revision still returns to Moments progress", async () => {
    m.publishPost.mockResolvedValueOnce({
      ...m.editorData, version: 3, status: "pending",
      pendingRevision: { id: "rev-3", status: "pending", text: "Редакция публикации",
        attachmentIds: [], errorCode: null, errorMessage: null },
    });
    await mount();
    await typeBody();
    await save();
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("/(main)/(tabs)/feed");
  });
  it("rejected failed-status publish ACK does not navigate or declare success", async () => {
    m.publishPost.mockResolvedValueOnce({ ...m.editorData, version: 3,
      status: "failed", pendingRevision: null });
    await mount();
    await typeBody();
    await save();
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
  });
  it("new Moment enqueues once and immediately shows feed progress, without intermediate screens", async () => {
    m.editRoute = undefined;
    await mount();
    await typeBody("Новый момент с текстом");
    await press("Опубликовать");
    expect(m.enqueue).toHaveBeenCalledTimes(1);
    expect(m.enqueue.mock.calls[0]?.[0]).toMatchObject({
      ownerId: "A", text: "Новый момент с текстом", files: [],
    });
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("/(main)/(tabs)/feed");
    expect(m.saveRevision).not.toHaveBeenCalled();
    expect(m.publishPost).not.toHaveBeenCalled();
  });
  it("new Moment enqueue failure stays in editor, without false-success navigation", async () => {
    m.editRoute = undefined;
    m.enqueue.mockImplementationOnce(() => { throw new Error("QUEUE_UNAVAILABLE"); });
    await mount();
    await typeBody("Публикация");
    await press("Опубликовать");
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("QUEUE_UNAVAILABLE");
  });
  it("old pending edit deep-link goes back to feed progress without changing server data", async () => {
    m.editorData = { ...m.editorData, status: "pending", canEdit: false };
    await mount();
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("/(main)/(tabs)/feed");
    expect(m.publishPost).not.toHaveBeenCalled();
    expect(m.saveRevision).not.toHaveBeenCalled();
  });
  it("recovered pending item cannot open editor, while draft and failed remain editable", async () => {
    m.pendingRows = [
      { id: "pending-1", status: "pending", text: "Обрабатываем фото", attachments: [] },
      { id: "draft-1", status: "draft", text: "Черновик", attachments: [] },
      { id: "failed-1", status: "failed", text: "Не обработано", attachments: [] },
    ];
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(host.textContent).toContain("Обрабатываем публикацию");
    expect(host.querySelectorAll('[aria-label="Продолжить незавершённую публикацию"]'))
      .toHaveLength(2);
    expect(host.textContent).toContain("Обрабатываем публикацию…");
    const buttons = Array.from(host.querySelectorAll<HTMLElement>(
      '[aria-label="Продолжить незавершённую публикацию"]'));
    await act(async () => buttons[0]?.click());
    expect(m.push).toHaveBeenCalledWith({
      pathname: "/(main)/feed/create", params: { edit: "draft-1" },
    });
    expect(m.push).not.toHaveBeenCalledWith({
      pathname: "/(main)/feed/create", params: { edit: "pending-1" },
    });
  });

  it("updates every feed sort after a successful pending-to-published Core snapshot", async () => {
    m.pendingRows = [{ id: "just-published", status: "pending", text: "Видео", attachments: [] }];
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(host.textContent).toContain("Обрабатываем публикацию");
    expect(m.invalidate).not.toHaveBeenCalled();
    m.pendingRows = [];
    m.pendingUpdatedAt += 1;
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(m.invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: ["feed", "posts", "A"],
    });
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(m.invalidate).toHaveBeenCalledTimes(1);
  });
  it("does not report completion on a failed or still-fetching server status check", async () => {
    m.pendingRows = [{ id: "pending", status: "pending", text: "Фото", attachments: [] }];
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    m.pendingRows = [];
    m.pendingUpdatedAt += 1;
    m.pendingIsSuccess = false;
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(m.invalidate).not.toHaveBeenCalled();
    m.pendingIsSuccess = true;
    m.pendingIsFetching = true;
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(m.invalidate).not.toHaveBeenCalled();
    m.pendingIsFetching = false;
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    expect(m.invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: ["feed", "posts", "A"],
    });
  });
  it("does not treat a different author's pending snapshot as this user's completion", async () => {
    m.pendingRows = [{ id: "A-job", status: "pending", text: "Фото", attachments: [] }];
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "A" })));
    m.pendingRows = [];
    m.pendingUpdatedAt += 1;
    await act(async () => root.render(React.createElement(FeedPublicationQueue, { ownerId: "B" })));
    expect(m.invalidate).not.toHaveBeenCalled();
  });

  it("successful revision+publish ACK keeps success despite failed feed-cache refresh", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache fault"));
    await mount();
    await typeBody();
    await save();
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
    expect(m.publishPost).toHaveBeenCalledTimes(1);
    expect(m.replace).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
  });
  it("publish uncertain after acknowledged revision prevents duplicate publish on Save", async () => {
    m.publishPost.mockRejectedValueOnce(new Error("network timeout"));
    await mount();
    await typeBody();
    await save();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await save();
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
    expect(m.publishPost).toHaveBeenCalledTimes(1);
  });
  it("wrong version from revision ACK is UNKNOWN and never invokes publish", async () => {
    m.saveRevision.mockResolvedValueOnce({
      ...m.editorData,
      version: 4,
      pendingRevision: {
        id: "rev-4",
        status: "draft",
        text: "Редакция публикации",
        attachmentIds: [],
        errorCode: null,
        errorMessage: null,
      },
    });
    await mount();
    await typeBody();
    await save();
    expect(m.publishPost).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await save();
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
  });
  it("publish ACK wrong post ID cannot navigate and blocks uncertain retry", async () => {
    m.publishPost.mockResolvedValueOnce({
      ...m.editorData,
      id: "other",
      version: 3,
      pendingRevision: {
        id: "rev-3",
        status: "pending",
        text: "Редакция публикации",
        attachmentIds: [],
        errorCode: null,
        errorMessage: null,
      },
    });
    await mount();
    await typeBody();
    await save();
    expect(m.saveRevision).toHaveBeenCalledTimes(1);
    expect(m.publishPost).toHaveBeenCalledTimes(1);
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await save();
    expect(m.publishPost).toHaveBeenCalledTimes(1);
  });
  it("publish ACK rejected failed revision status never masquerades as accepted", async () => {
    m.publishPost.mockResolvedValueOnce({
      ...m.editorData,
      version: 3,
      pendingRevision: {
        id: "rev-3",
        status: "failed",
        text: "Редакция публикации",
        attachmentIds: [],
        errorCode: null,
        errorMessage: null,
      },
    });
    await mount();
    await typeBody();
    await save();
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
  });
  it("A->B->A while accepted publish response pending quarantines old navigation and cache", async () => {
    const d = pending<unknown>();
    m.publishPost.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await save();
    const guard = m.publishPost.mock.calls[0][2] as () => boolean;
    await owner("B", "BE1");
    await owner("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ ...m.editorData, version: 3, pendingRevision: null }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("unmount while pending revision ACK does not start publishing", async () => {
    const d = pending<unknown>();
    m.saveRevision.mockReturnValueOnce(d.promise);
    await mount();
    await typeBody();
    await save();
    await act(async () => root.unmount());
    await act(async () =>
      d.resolve({
        ...m.editorData,
        version: 3,
        pendingRevision: {
          id: "rev-3",
          status: "draft",
          text: "Редакция публикации",
          attachmentIds: [],
          errorCode: null,
          errorMessage: null,
        },
      }),
    );
    expect(m.publishPost).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
