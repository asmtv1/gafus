// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  alert: vi.fn(),
  deletion: vi.fn(),
  reaction: vi.fn(),
  guardedReaction: vi.fn(),
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
        onClick: (event: React.MouseEvent) =>
          (p.onPress as ((event: React.MouseEvent) => void) | undefined)?.(event),
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
    TextInput: node("div"),
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
    setPostReaction: (...a: unknown[]) => m.reaction(...a),
    removePostReaction: (...a: unknown[]) => m.reaction(...a),
  },
  feedPostReactionGuarded: (...a: unknown[]) => m.guardedReaction(...a),
  feedDeletePostGuarded: (...a: unknown[]) => m.deletion(...a),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
  useQuery: vi.fn(),
  useInfiniteQuery: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: m.push, replace: m.replace }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: vi.fn(),
  Stack: () => null,
}));
vi.mock("@gafus/types", () => ({
  FEED_REACTIONS: ["❤️", "😂", "🐶", "🔥", "👍"],
  FEED_LIMITS: {},
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
import { FeedPostCard } from "./screens";
import type { FeedPostDto } from "@gafus/types";
const userFixture = (id: string) => ({
  id,
  username: id.toLowerCase(),
  email: null,
  phone: null,
  role: "USER" as const,
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const post = (): FeedPostDto => ({
  id: "p-A",
  author: { id: "A", name: "Owner", username: "owner", avatarUrl: null },
  canDelete: true,
  canEdit: true,
  attachments: [],
  reactions: [],
  myReaction: null,
  commentCount: 0,
  viewCount: 0,
  text: "Test",
  createdAt: "2026-10-21T00:00:00.000Z",
  publishedAt: "2026-10-21T00:00:00.000Z",
  editedAt: null,
  editUntil: null,
  status: "published",
  version: 1,
});
async function mount(change: Partial<FeedPostDto> = {}, detailed = false) {
  await act(async () =>
    root.render(React.createElement(FeedPostCard, { post: { ...post(), ...change }, detailed })),
  );
}
async function press(label: string) {
  const el = host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
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
  m.deletion.mockResolvedValue({ id: "p-A" });
  m.reaction.mockReset().mockResolvedValue({ ...post(), myReaction: "❤️" });
  m.guardedReaction.mockReset().mockResolvedValue({ ...post(), myReaction: "❤️" });
  m.invalidate.mockResolvedValue(undefined);
  useAuthStore.setState({ user: userFixture("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const reactedPost = (mine: "❤️" | null = null): Partial<FeedPostDto> => ({
  reactions: [{ emoji: "❤️", count: 1 }],
  myReaction: mine,
});
async function pressHeart() {
  await press("Реакция ❤️, 1");
}
describe("AG3 V84 actual FeedPostCard native reaction PUT/DELETE", () => {
  it("guest cannot issue mutation, but public post remains visible", async () => {
    await mount(reactedPost());
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await pressHeart();
    expect(m.guardedReaction).not.toHaveBeenCalled();
    expect(m.reaction).not.toHaveBeenCalled();
  });
  it("foreign authenticated reader may react to author post, preserving existing access", async () => {
    await owner("B", "BE1");
    await mount({
      ...reactedPost(),
      author: { id: "A", name: "Owner", username: "owner", avatarUrl: null },
    });
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledExactlyOnceWith("p-A", "❤️", expect.any(Function));
    expect((m.guardedReaction.mock.calls[0][2] as () => boolean)()).toBe(true);
  });
  it("doubletap in one React batch sends one guarded PUT with current postId", async () => {
    const d = pending<FeedPostDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(reactedPost());
    const btn = host.querySelector<HTMLElement>('[aria-label="Реакция ❤️, 1"]');
    await act(async () => {
      btn?.click();
      btn?.click();
    });
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
    expect(m.guardedReaction.mock.calls[0].slice(0, 2)).toEqual(["p-A", "❤️"]);
    await act(async () => d.resolve({ ...post(), ...reactedPost("❤️") }));
  });
  it("positive strict ACK survives cache invalidate failure and subsequent explicit tap DELETE", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache synthetic fault"));
    await mount(reactedPost());
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
    m.guardedReaction.mockResolvedValueOnce({ ...post(), ...reactedPost(null) });
    await pressHeart();
    expect(m.guardedReaction.mock.calls[1].slice(0, 2)).toEqual(["p-A", null]);
  });
  it("malformed ACK with mismatched id or myReaction is UNKNOWN without replay", async () => {
    m.guardedReaction.mockResolvedValueOnce({ ...post(), id: "wrong", myReaction: "❤️" });
    await mount(reactedPost());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
  });
  it("matching post ID but mismatched reaction ACK is UNKNOWN, not success", async () => {
    m.guardedReaction.mockResolvedValueOnce({ ...post(), ...reactedPost(null) });
    await mount(reactedPost());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
  });
  it("deleted post status in reaction ACK is rejected without cache update", async () => {
    m.guardedReaction.mockResolvedValueOnce({ ...post(), ...reactedPost("❤️"), status: "deleted" });
    await mount(reactedPost());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("explicit initial selected reaction tap removes via existing guarded DELETE", async () => {
    m.guardedReaction.mockResolvedValueOnce({ ...post(), ...reactedPost(null) });
    await mount(reactedPost("❤️"));
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledExactlyOnceWith("p-A", null, expect.any(Function));
    expect(m.alert.mock.calls.some((c) => String(c[1] ?? "").includes("неизвестен"))).toBe(false);
  });
  it("unknown network result never reveals provider secrets or causes retry", async () => {
    const secret = "Bearer signed-private-s3-url?token=private";
    m.guardedReaction.mockRejectedValueOnce(new Error(secret));
    await mount(reactedPost());
    await pressHeart();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await pressHeart();
    expect(m.guardedReaction).toHaveBeenCalledTimes(1);
  });
  it("old A->B->A epoch pending ACK cannot refresh cache or produce side effects", async () => {
    const d = pending<FeedPostDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(reactedPost());
    await pressHeart();
    const guard = m.guardedReaction.mock.calls[0][2] as () => boolean;
    await owner("B", "BE1");
    await owner("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ ...post(), ...reactedPost("❤️") }));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("stale response after logout does not affect cache or popup", async () => {
    const d = pending<FeedPostDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(reactedPost());
    await pressHeart();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await act(async () => d.resolve({ ...post(), ...reactedPost("❤️") }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("unmount before ACK quarantines late network result", async () => {
    const d = pending<FeedPostDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(reactedPost());
    await pressHeart();
    await act(async () => root.unmount());
    await act(async () => d.resolve({ ...post(), ...reactedPost("❤️") }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("post A->B->A after pending request does not apply A ACK to post B or new A", async () => {
    const d = pending<FeedPostDto>();
    m.guardedReaction.mockReturnValueOnce(d.promise);
    await mount(reactedPost());
    await pressHeart();
    const guard = m.guardedReaction.mock.calls[0][2] as () => boolean;
    await mount({ ...reactedPost(), id: "p-B" });
    await mount(reactedPost());
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ ...post(), ...reactedPost("❤️") }));
    expect(m.invalidate).not.toHaveBeenCalled();
  });
});
