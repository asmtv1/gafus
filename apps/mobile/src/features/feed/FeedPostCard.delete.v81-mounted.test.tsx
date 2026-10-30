// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  alert: vi.fn(),
  deletion: vi.fn(),
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
  feedApi: { deletePost: (...a: unknown[]) => m.deletion(...a) },
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
  FEED_REACTIONS: [],
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
async function mount(detailed = false) {
  await act(async () => root.render(React.createElement(FeedPostCard, { post: post(), detailed })));
}
async function press(label: string) {
  const el = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(el).not.toBeNull();
  await act(async () => el?.click());
}
function confirmation() {
  return m.alert.mock.calls.find((a) => a[0] === "Удалить публикацию?");
}
function confirmationButton(label: string) {
  const b = (confirmation()?.[2] as { text: string; onPress?: () => void }[] | undefined)?.find(
    (x) => x.text === label,
  );
  expect(b).toBeDefined();
  return b?.onPress;
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
describe("V81 actual FeedPostCard owner confirmation and guarded deletion", () => {
  it("foreign actor cannot initiate owner delete confirmation or editor navigation", async () => {
    await mount();
    await owner("B", "BE1");
    await press("Owner delete action");
    await press("Owner edit action");
    expect(confirmation()).toBeUndefined();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("double menu press gives just one confirmation; cancel never deletes", async () => {
    await mount();
    const el = host.querySelector<HTMLButtonElement>('button[aria-label="Owner delete action"]');
    await act(async () => {
      el?.click();
      el?.click();
    });
    expect(m.alert.mock.calls.filter((c) => c[0] === "Удалить публикацию?")).toHaveLength(1);
    await act(async () => confirmationButton("Отмена")?.());
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("double confirm dispatches one guarded DELETE and navigates on exact id ACK", async () => {
    const d = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(d.promise);
    await mount(true);
    await press("Owner delete action");
    const confirm = confirmationButton("Удалить");
    await act(async () => {
      confirm?.();
      confirm?.();
    });
    expect(m.deletion).toHaveBeenCalledTimes(1);
    expect(m.deletion.mock.calls[0][0]).toBe("p-A");
    expect(typeof m.deletion.mock.calls[0][1]).toBe("function");
    await act(async () => d.resolve({ id: "p-A" }));
    expect(m.replace).toHaveBeenCalledWith("/(main)/(tabs)/feed");
  });
  it("ACK survives feed cache invalidation failure and still navigates", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache unavailable"));
    await mount(true);
    await press("Owner delete action");
    await act(async () => confirmationButton("Удалить")?.());
    expect(m.replace).toHaveBeenCalledWith("/(main)/(tabs)/feed");
    expect(
      m.alert.mock.calls.filter((c) => String(c[0]).includes("Не удалось удалить")),
    ).toHaveLength(0);
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
  it("wrong-id deletion ACK is UNKNOWN with no navigation or repeated confirmation", async () => {
    m.deletion.mockResolvedValueOnce({ id: "wrong-id" });
    await mount(true);
    await press("Owner delete action");
    await act(async () => confirmationButton("Удалить")?.());
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    await press("Owner delete action");
    expect(m.alert.mock.calls.filter((c) => c[0] === "Удалить публикацию?")).toHaveLength(1);
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
  it("cancelled confirmation old callback never dispatches DELETE", async () => {
    await mount();
    await press("Owner delete action");
    const oldConfirm = confirmationButton("Удалить");
    await act(async () => confirmationButton("Отмена")?.());
    await act(async () => oldConfirm?.());
    expect(m.deletion).not.toHaveBeenCalled();
  });
  it("A->B->A after confirmation before delete refuses the stale callback", async () => {
    await mount();
    await press("Owner delete action");
    const oldConfirm = confirmationButton("Удалить");
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => oldConfirm?.());
    expect(m.deletion).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("A->B->A during pending delete ignores old result without cache or navigation", async () => {
    const d = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(d.promise);
    await mount(true);
    await press("Owner delete action");
    await act(async () => confirmationButton("Удалить")?.());
    await owner("B", "BE1");
    await owner("A", "E2");
    await act(async () => d.resolve({ id: "p-A" }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("unmount during pending delete drops old result and notifications", async () => {
    const d = pending<{ id: string }>();
    m.deletion.mockReturnValueOnce(d.promise);
    await mount(true);
    await press("Owner delete action");
    await act(async () => confirmationButton("Удалить")?.());
    await act(async () => root.unmount());
    await act(async () => d.resolve({ id: "p-A" }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("network error including sensitive provider text is UNKNOWN and cannot retry", async () => {
    const secret = "Bearer secret-token ?X-Amz-Credential=private";
    m.deletion.mockRejectedValueOnce(new Error(secret));
    await mount(true);
    await press("Owner delete action");
    await act(async () => confirmationButton("Удалить")?.());
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await press("Owner delete action");
    expect(m.deletion).toHaveBeenCalledTimes(1);
  });
});
