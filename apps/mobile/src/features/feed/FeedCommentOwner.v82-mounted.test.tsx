// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  alert: vi.fn(),
  deletion: vi.fn(),
  edit: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
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
  },
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
  feedEditCommentGuarded: (...a: unknown[]) => m.edit(...a),
  feedDeleteCommentGuarded: (...a: unknown[]) => m.deletion(...a),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useQuery: vi.fn(),
  useInfiniteQuery: () => ({
    data: null,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
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
async function openMenu() {
  await press("Действия с комментарием");
}
function menuChoice(label: string) {
  const options = m.alert.mock.calls.find((c) => c[0] === "Комментарий")?.[2] as
    | { text: string; onPress?: () => void }[]
    | undefined;
  const choice = options?.find((x) => x.text === label);
  expect(choice).toBeDefined();
  return choice?.onPress;
}
function deleteConfirmButton(label: string) {
  const options = m.alert.mock.calls.find((c) => c[0] === "Удалить комментарий?")?.[2] as
    | { text: string; onPress?: () => void }[]
    | undefined;
  const choice = options?.find((x) => x.text === label);
  expect(choice).toBeDefined();
  return choice?.onPress;
}
async function choose(label: string) {
  await act(async () => menuChoice(label)?.());
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

describe("V82 actual CommentRow owner edit/delete initial RED", () => {
  it("guest and foreign user cannot expose owner edit/delete even with stale DTO flags", async () => {
    await mount();
    await owner("B", "BE1");
    await openMenu();
    expect(m.alert.mock.calls.find((c) => c[0] === "Комментарий")).toBeUndefined();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await openMenu();
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("owner comment from another postId context cannot mutate or open owner menu", async () => {
    await mount({}, "wrong-post");
    await openMenu();
    expect(m.alert.mock.calls.find((c) => c[0] === "Комментарий")).toBeUndefined();
  });
  it("double menu and double delete confirm send exactly one guarded DELETE", async () => {
    const p = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(p.promise);
    await mount();
    const btn = host.querySelector<HTMLElement>('[aria-label="Действия с комментарием"]');
    await act(async () => {
      btn?.click();
      btn?.click();
    });
    expect(m.alert.mock.calls.filter((c) => c[0] === "Комментарий")).toHaveLength(1);
    await choose("Удалить");
    const confirm = deleteConfirmButton("Удалить");
    await act(async () => {
      confirm?.();
      confirm?.();
    });
    expect(m.deletion).toHaveBeenCalledTimes(1);
    expect(m.deletion.mock.calls[0][0]).toBe("comment-A");
    expect(typeof m.deletion.mock.calls[0][1]).toBe("function");
    await act(async () => p.resolve({ id: "comment-A" }));
  });
  it("delete cancellation and stale captured confirmation cannot later DELETE", async () => {
    await mount();
    await openMenu();
    await choose("Удалить");
    const old = deleteConfirmButton("Удалить");
    await act(async () => deleteConfirmButton("Отмена")?.());
    await act(async () => old?.());
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("confirmed DELETE exact id ACK survives cache fault; no false failure or second DELETE", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache-fault"));
    await mount();
    await openMenu();
    await choose("Удалить");
    await act(async () => deleteConfirmButton("Удалить")?.());
    expect(m.deletion).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
    await openMenu();
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
  it("wrong id ACK or timeout stays UNKNOWN, no repeat or provider private-error leak", async () => {
    m.deletion.mockRejectedValueOnce(new Error("Bearer private-token signed-url"));
    await mount();
    await openMenu();
    await choose("Удалить");
    await act(async () => deleteConfirmButton("Удалить")?.());
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("private-token");
    await openMenu();
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
  it("actor A->B->A before confirm refuses stale DELETE", async () => {
    await mount();
    await openMenu();
    await choose("Удалить");
    const old = deleteConfirmButton("Удалить");
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => old?.());
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("actor A->B->A while DELETE pending prevents old cache mutation or alert", async () => {
    const p = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(p.promise);
    await mount();
    await openMenu();
    await choose("Удалить");
    await act(async () => deleteConfirmButton("Удалить")?.());
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => p.resolve({ id: "comment-A" }));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("mounted editor validates owner and fixed exact comment id, ACK, cache failure", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache-fault"));
    await mount();
    await openMenu();
    await choose("Изменить");
    const editor = host.querySelector<HTMLInputElement>('[aria-label="Редактировать комментарий"]');
    expect(editor).not.toBeNull();
    await act(async () => editor?.click());
    await press("Сохранить");
    expect(m.edit).toHaveBeenCalledTimes(1);
    expect(m.edit.mock.calls[0][0]).toBe("comment-A");
    expect(m.edit.mock.calls[0][1]).toEqual({ text: "Изменённый текст" });
    expect(typeof m.edit.mock.calls[0][2]).toBe("function");
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
  });
  it("edit A->B->A pending ACK does not close new actor editor or invalidate", async () => {
    const p = pending<FeedCommentDto>();
    m.edit.mockReturnValueOnce(p.promise);
    await mount();
    await openMenu();
    await choose("Изменить");
    await press("Сохранить");
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => p.resolve(comment()));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("unmount during pending delete ACK does not invalidate or show old completion", async () => {
    const p = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(p.promise);
    await mount();
    await openMenu();
    await choose("Удалить");
    await act(async () => deleteConfirmButton("Удалить")?.());
    if (root) await act(async () => root.unmount());
    await act(async () => p.resolve({ id: "comment-A" }));
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it("forged canEdit/canDelete false never offers owner mutations", async () => {
    await mount({ canEdit: false, canDelete: false });
    await openMenu();
    expect(m.alert.mock.calls.find((c) => c[0] === "Комментарий")).toBeUndefined();
    expect(m.edit).not.toHaveBeenCalled();
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("wrong commentId DELETE ACK is UNKNOWN, no feed invalidation or retry", async () => {
    m.deletion.mockResolvedValueOnce({ id: "different-comment" });
    await mount();
    await openMenu();
    await choose("Удалить");
    await act(async () => deleteConfirmButton("Удалить")?.());
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
    await openMenu();
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
  it("duplicate edit save in one batch dispatches only one guarded PATCH", async () => {
    const p = pending<FeedCommentDto>();
    m.edit.mockReturnValueOnce(p.promise);
    await mount();
    await openMenu();
    await choose("Изменить");
    const save = Array.from(host.querySelectorAll<HTMLElement>("div,button")).find(
      (e) => e.textContent === "Сохранить" && e.getAttribute("aria-label") === null,
    );
    expect(save).toBeDefined();
    await act(async () => {
      save?.click();
      save?.click();
    });
    expect(m.edit).toHaveBeenCalledTimes(1);
    expect(m.edit.mock.calls[0][0]).toBe("comment-A");
    await act(async () => p.resolve(comment()));
  });
  it("negative edit response exposes no provider secrets and does not retry", async () => {
    const secret = "Bearer secret-media ?X-Amz-Signature=private";
    m.edit.mockRejectedValueOnce(new Error(secret));
    await mount();
    await openMenu();
    await choose("Изменить");
    await press("Сохранить");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await press("Сохранить");
    expect(m.edit).toHaveBeenCalledTimes(1);
  });
  it("malformed edit ACK wrong postId cannot close editor or invalidate feed", async () => {
    m.edit.mockResolvedValueOnce(comment({ postId: "post-B" }));
    await mount();
    await openMenu();
    await choose("Изменить");
    await press("Сохранить");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.edit).toHaveBeenCalledTimes(1);
  });
  it("cancelled or stale A->B->A edit menu callback cannot open editor", async () => {
    await mount();
    await openMenu();
    const old = menuChoice("Изменить");
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => old?.());
    expect(host.textContent).not.toContain("Сохранить");
    expect(m.edit).not.toHaveBeenCalled();
  });
  it("unmount during pending edit prevents late ACK/cache/error effects", async () => {
    const p = pending<FeedCommentDto>();
    m.edit.mockReturnValueOnce(p.promise);
    await mount();
    await openMenu();
    await choose("Изменить");
    await press("Сохранить");
    await act(async () => root.unmount());
    await act(async () => p.resolve(comment()));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
    root = createRoot(host);
  });
});
