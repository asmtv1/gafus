// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  route: "albums",
  albumId: "album-A",
  navigate: vi.fn(),
  fetch: vi.fn(),
  viewer: vi.fn(),
  alerts: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (s: (state: unknown) => unknown) =>
      s({ user: { id: m.owner, username: "alice" }, isAuthenticated: m.authed, isLoading: false }),
    {
      getState: () => ({
        user: { id: m.owner, username: "alice" },
        isAuthenticated: m.authed,
        isLoading: false,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/api/gallery", () => ({
  galleryTransport: (...args: unknown[]) => m.fetch(...args),
  galleryApi: { setCover: vi.fn(), deleteAlbum: vi.fn() },
}));
vi.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "fake" }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const Pressable = ({
    onPress,
    accessibilityLabel,
    children,
    disabled,
  }: {
    onPress?: () => void;
    accessibilityLabel?: string;
    children?: React.ReactNode;
    disabled?: boolean;
  }) =>
    R.createElement(
      "button",
      { "aria-label": accessibilityLabel, onClick: onPress, disabled },
      children,
    );
  const FlatList = ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data?: unknown[];
    renderItem?: ({ item, index }: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
  }) =>
    R.createElement(
      "div",
      null,
      ListHeaderComponent,
      (data ?? []).map((item, index) =>
        R.createElement("div", { key: index }, renderItem?.({ item, index })),
      ),
      (data?.length ?? 0) ? null : ListEmptyComponent,
    );
  return {
    View: Box,
    FlatList,
    Pressable,
    Image: Box,
    ScrollView: Box,
    Text: Box,
    AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
    Alert: { alert: m.alerts },
    StyleSheet: { create: (s: unknown) => s },
    useWindowDimensions: () => ({ width: 390, height: 800 }),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Menu: Object.assign(
      ({ children, anchor }: { children: React.ReactNode; anchor?: React.ReactNode }) =>
        R.createElement("div", null, anchor, children),
      {
        Item: ({
          title,
          onPress,
          disabled,
          titleStyle,
        }: {
          title: string;
          onPress?: () => void;
          disabled?: boolean;
          titleStyle?: { color?: string };
        }) =>
          R.createElement("button", { onClick: onPress, disabled, "data-menu-item": title, "data-title-color": titleStyle?.color }, title),
      },
    ),
  };
});
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () =>
    m.route === "albums" ? {} : { albumId: m.albumId, username: "alice" },
  useRouter: () => ({ push: m.navigate, dismissTo: m.navigate }),
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    AppBackButton: () => null,
    Loading: () => R.createElement("span", null, "Загрузка"),
    MascotSpinner: () => null,
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress }, label),
  };
});
vi.mock("./uploads", () => ({ UploadControls: () => null }));
vi.mock("./GalleryImage", () => ({ GalleryImage: () => null }));
vi.mock("./image", async () => {
  const R = await import("react");
  return {
    GalleryImage: ({ source }: { source?: { uri?: string } }) =>
      R.createElement("span", { "data-image-url": source?.uri ?? "" }, "Photo"),
  };
});
vi.mock("./viewer", async () => {
  const R = await import("react");
  return {
    PhotoViewer: ({ photos, start }: { photos: unknown[]; start: number }) => {
      m.viewer({ photos, start });
      return R.createElement("span", null, "ПОЛНЫЙ ЭКРАН");
    },
  };
});
vi.mock("./PhotoActionsMenu", () => ({ PhotoActionsMenu: () => null }));
vi.mock("./components", async () => {
  const R = await import("react");
  return {
    AlbumEditor: () => null,
    Failure: ({ error: _error }: { error: unknown }) =>
      R.createElement("span", null, "Ошибка загрузки галереи"),
    AlbumTile: ({ album }: { album: { id: string; name: string } }) =>
      R.createElement("button", { onClick: () => m.navigate(album.id) }, album.name),
  };
});
vi.mock("./styles", () => ({
  styles: {
    screen: {},
    content: {},
    albumsListContent: {},
    muted: {},
    text: {},
    grid: {},
    thumb: {},
    placeholder: {},
    error: {},
  },
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive" },
  FONTS: { montserratMedium: "sans", montserrat: "sans" },
}));
import { GalleryAlbumsScreen, GalleryAlbumScreen } from "./screens";
let root: Root, host: HTMLDivElement, client: QueryClient;
const expiry = () => new Date(Date.now() + 30_000).toISOString();
const album = () => ({
  id: "album-A",
  ownerId: "A",
  ownerUsername: "alice",
  name: "Публичный альбом",
  description: null,
  isVisible: true,
  coverPhotoId: "photo-A",
  coverDisplayPhotoId: "photo-A",
  coverThumbUrl: "https://cdn.example/cover?secret=abc",
  urlsExpireAt: expiry(),
  photoCount: 1,
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
  canEdit: true,
});
const photo = () => ({
  id: "photo-A",
  albumId: "album-A",
  caption: "Пёсик",
  status: "ready",
  thumbUrl: "https://cdn.example/thumb?secret=abc",
  fullUrl: "https://cdn.example/full?secret=abc",
  urlsExpireAt: expiry(),
  width: 100,
  height: 100,
  createdAt: "2026-10-18",
  expiresAt: null,
  canEdit: false,
});
const list = (kind: string) => ({
  items: kind === "albums" ? [album()] : [photo()],
  nextCursor: null,
  usedSlots: 1,
  limit: 200,
  isOwner: true,
  enabled: true,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { resolve, promise };
};
async function draw() {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(m.route === "albums" ? GalleryAlbumsScreen : GalleryAlbumScreen),
      ),
    ),
  );
  await vi.waitFor(() => expect(m.fetch).toHaveBeenCalled());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.route = "albums";
  m.albumId = "album-A";
  m.fetch.mockImplementation(async (path: string) =>
    path.startsWith("profiles/")
      ? list("albums")
      : path.endsWith("/photos?pageSize=30")
        ? list("photos")
        : album(),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
async function editorMenu() {
  await draw();
  await vi.waitFor(() => expect(host.textContent).toContain("Публичный альбом"));
  // The header is visible while album/photo queries are still loading. Await
  // the real owner-menu affordance before exercising destructive callbacks.
  await vi.waitFor(() => {
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Действия с альбомом"]'),
    ).not.toBeNull();
  });
  const actions = host.querySelector<HTMLButtonElement>('button[aria-label="Действия с альбомом"]');
  if (!actions)
    throw Error(
      "Missing actions; text=" +
        host.textContent +
        "; calls=" +
        JSON.stringify(m.fetch.mock.calls.map((x: unknown[]) => x[0])),
    );
  await act(async () => actions.click());
  const remove = host.querySelector<HTMLButtonElement>('button[data-menu-item="Удалить альбом"]');
  if (!remove) throw Error("Missing delete menu item");
  await act(async () => remove.click());
  expect(m.alerts).toHaveBeenCalledOnce();
  const buttons = m.alerts.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  return {
    cancel: buttons.find((x) => x.text === "Отмена")!,
    confirm: buttons.find((x) => x.text === "Удалить")!,
  };
}
function deleteCalls() {
  return m.fetch.mock.calls.filter(
    (args: unknown[]) => (args[1] as { method?: string } | undefined)?.method === "DELETE",
  );
}
describe("gallery album menu readability", () => {
  it("uses black action text while keeping album deletion red", async () => {
    m.route = "detail";
    await draw();
    await vi.waitFor(() =>
      expect(host.querySelector('button[aria-label="Действия с альбомом"]')).not.toBeNull(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Действия с альбомом"]')!.click(),
    );
    for (const label of ["Настройки альбома", "Изменить обложку", "Правила загрузки"]) {
      const item = Array.from(host.querySelectorAll<HTMLButtonElement>("button[data-menu-item]"))
        .find(button => button.getAttribute("data-menu-item") === label);
      expect(item?.getAttribute("data-title-color"), label).toBe("#000000");
    }
    expect(
      host.querySelector('button[data-menu-item="Удалить альбом"]')?.getAttribute("data-title-color"),
    ).toBe("#A53825");
  });
});

describe("actual GalleryAlbumScreen Alert -> single DELETE -> GET NOT_FOUND", () => {
  it("cancel Alert never sends DELETE", async () => {
    m.route = "detail";
    const { cancel } = await editorMenu();
    await act(async () => cancel.onPress?.());
    expect(deleteCalls()).toHaveLength(0);
  });
  it("one confirmed DELETE requires fresh NOT_FOUND GET before back navigation", async () => {
    m.route = "detail";
    let deleted = false;
    m.fetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") {
        deleted = true;
        return { id: "album-A" };
      }
      if (path === "albums/album-A" && deleted)
        throw Object.assign(new Error("gone"), { code: "NOT_FOUND" });
      return path.endsWith("/photos?pageSize=30") ? list("photos") : album();
    });
    const { confirm } = await editorMenu();
    await act(async () => confirm.onPress?.());
    await vi.waitFor(() => expect(m.navigate).toHaveBeenCalledOnce());
    expect(deleteCalls()).toHaveLength(1);
    expect(deleteCalls()[0][0]).toBe("albums/album-A");
    expect(deleteCalls()[0][1].requestGuard()).toBe(true);
  });
  it("two rapid destructive confirmations trigger one DELETE while in flight", async () => {
    m.route = "detail";
    const d = deferred<{ id: string }>();
    let deleted = false;
    m.fetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") {
        deleted = true;
        return d.promise;
      }
      if (deleted && path === "albums/album-A")
        throw Object.assign(new Error("gone"), { code: "NOT_FOUND" });
      return path.endsWith("/photos?pageSize=30") ? list("photos") : album();
    });
    const { confirm } = await editorMenu();
    await act(async () => {
      confirm.onPress?.();
      confirm.onPress?.();
    });
    expect(deleteCalls()).toHaveLength(1);
    expect(m.navigate).not.toHaveBeenCalled();
    await act(async () => d.resolve({ id: "album-A" }));
    await vi.waitFor(() => expect(m.navigate).toHaveBeenCalledOnce());
  });
  it("unknown network result stays visible without retry/navigation, redacts signed URL", async () => {
    m.route = "detail";
    m.fetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") throw new Error("X-Amz-Signature=PRIVATE_TOKEN");
      return path.endsWith("/photos?pageSize=30") ? list("photos") : album();
    });
    const { confirm } = await editorMenu();
    await act(async () => confirm.onPress?.());
    await vi.waitFor(() => expect(host.textContent).toContain("Результат удаления неизвестен"));
    await act(async () => confirm.onPress?.());
    expect(deleteCalls()).toHaveLength(1);
    expect(m.navigate).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("PRIVATE_TOKEN");
  });
  it("A->B->A new epoch after Alert before confirm prevents DELETE", async () => {
    m.route = "detail";
    const { confirm } = await editorMenu();
    m.owner = "B";
    m.epoch = "B";
    m.owner = "A";
    m.epoch = "E2";
    await act(async () => confirm.onPress?.());
    expect(deleteCalls()).toHaveLength(0);
    expect(m.navigate).not.toHaveBeenCalled();
  });
  it("unmount while DELETE pending prevents later GET and navigation", async () => {
    m.route = "detail";
    const d = deferred<{ id: string }>();
    m.fetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") return d.promise;
      return path.endsWith("/photos?pageSize=30") ? list("photos") : album();
    });
    const { confirm } = await editorMenu();
    await act(async () => confirm.onPress?.());
    await vi.waitFor(() => expect(deleteCalls()).toHaveLength(1));
    const prior = m.fetch.mock.calls.length;
    await act(async () => root.unmount());
    await act(async () => d.resolve({ id: "album-A" }));
    expect(m.fetch).toHaveBeenCalledTimes(prior);
    expect(m.navigate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
