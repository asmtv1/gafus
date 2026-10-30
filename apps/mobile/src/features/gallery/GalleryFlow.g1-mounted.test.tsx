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
    ListFooterComponent,
    onEndReached,
  }: {
    data?: unknown[];
    renderItem?: ({ item, index }: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    onEndReached?: () => void;
  }) =>
    R.createElement(
      "div",
      null,
      ListHeaderComponent,
      (data ?? []).map((item, index) =>
        R.createElement("div", { key: index }, renderItem?.({ item, index })),
      ),
      (data?.length ?? 0) ? null : ListEmptyComponent,
      ListFooterComponent,
      onEndReached
        ? R.createElement(
            "button",
            { "aria-label": "Долистать", onClick: onEndReached },
            "Долистать",
          )
        : null,
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
      ({ children, visible, anchor }: {
        children: React.ReactNode;visible?:boolean;anchor?:React.ReactNode,
      }) => R.createElement("div", null, anchor, visible ? children : null),
      { Item: ({title,onPress,disabled}: {
        title:string;onPress?:()=>void;disabled?:boolean,
      })=>R.createElement("button",{onClick:onPress,disabled},title) },
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
  canEdit: false,
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
  isOwner: false,
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
describe("actual GalleryAlbumsScreen -> GalleryAlbumScreen -> fullscreen handler", () => {
  it("albums query renders verified image/album and opens existing album navigation", async () => {
    await draw();
    await vi.waitFor(() => expect(host.textContent).toContain("Публичный альбом"));
    const b = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Публичный альбом",
    );
    await act(async () => b?.click());
    expect(m.navigate).toHaveBeenCalledWith("album-A");
  });
  it("failed albums next page keeps loaded album and retries the same cursor", async () => {
    let failNext = true;
    m.fetch.mockImplementation(async (path: string) => {
      if (path.startsWith("profiles/")) {
        if (path.includes("cursor=page2")) {
          if (failNext) {
            failNext = false;
            throw new Error("PRIVATE_S3_SIGNED_QUERY");
          }
          return {
            ...list("albums"),
            items: [{ ...album(), id: "album-B", name: "Второй альбом" }],
          };
        }
        return { ...list("albums"), nextCursor: "page2" };
      }
      return album();
    });
    await draw();
    await vi.waitFor(() => expect(host.textContent).toContain("Публичный альбом"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Долистать"]')?.click(),
    );
    await vi.waitFor(() =>
      expect(m.fetch.mock.calls.some(([path]) => String(path).includes("cursor=page2"))).toBe(true),
    );
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Не удалось загрузить следующую страницу"),
    );
    expect(host.textContent).toContain("Публичный альбом");
    expect(host.textContent).not.toContain("Ошибка загрузки галереи");
    expect(host.textContent).not.toContain("PRIVATE_S3_SIGNED_QUERY");
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Повторить страницу",
    );
    await act(async () => retry?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Второй альбом"));
    expect(
      m.fetch.mock.calls.filter(([path]) => String(path).includes("cursor=page2")),
    ).toHaveLength(2);
    expect(host.textContent).toContain("Публичный альбом");
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
  });

  it("album photos query renders thumbnail and opening photo passes projected ready DTO to viewer", async () => {
    m.route = "detail";
    await draw();
    await vi.waitFor(() => expect(host.textContent).toContain("Photo"));
    const b = host.querySelector<HTMLButtonElement>('button[aria-label="Пёсик"]');
    expect(b).not.toBeNull();
    await act(async () => b?.click());
    expect(host.textContent).toContain("ПОЛНЫЙ ЭКРАН");
    expect(m.viewer.mock.calls[0][0].photos[0].id).toBe("photo-A");
  });
  it("album GET failure surfaces error instead of no photos", async () => {
    m.route = "detail";
    m.fetch.mockRejectedValueOnce(new Error("secret signed token"));
    await draw();
    await vi.waitFor(() => expect(host.textContent).toContain("Ошибка загрузки галереи"));
    expect(host.textContent).not.toContain("В альбоме пока нет фотографий");
    expect(host.textContent).not.toContain("secret signed token");
  });
  it("logout during pending album list request cannot show prior account album", async () => {
    const d = deferred<ReturnType<typeof list>>();
    m.fetch.mockReturnValueOnce(d.promise);
    await draw();
    const guard = m.fetch.mock.calls[0][1].requestGuard as () => boolean;
    m.owner = "B";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    await act(async () => d.resolve(list("albums")));
    expect(host.textContent).not.toContain("Публичный альбом");
  });
});
describe("actual owner album cover picker original PUT→GET mounted mobile screen",()=>{
  async function openPicker(){
    m.route="detail";
    await draw();
    await vi.waitFor(()=>expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Действия с альбомом"]')).not.toBeNull());
    await act(async()=>host.querySelector<HTMLButtonElement>(
      'button[aria-label="Действия с альбомом"]')?.click());
    const choose=Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(item=>item.textContent==="Выбрать обложку");
    expect(choose).toBeDefined();
    await act(async()=>choose?.click());
    await vi.waitFor(()=>expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сделать обложкой фотографию"]')).not.toBeNull());
  }
  it("owner ready photo updates cover only after true PUT ACK and protected fresh GET",async()=>{
    let current={...album(),canEdit:true,coverPhotoId:null as string|null};
    m.fetch.mockImplementation(async (
      path:string,options?:{method?:string;body?:{photoId:string}},
    )=>{
      if(path.endsWith("/photos?pageSize=30"))return {...list("photos"),
        items:[{...photo(),canEdit:true}]};
      if(options?.method==="PUT"&&path==="albums/album-A/cover"){
        current={...current,coverPhotoId:options.body?.photoId??null};return {...current};
      }
      return {...current};
    });
    await openPicker();
    await act(async()=>host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сделать обложкой фотографию"]')?.click());
    await vi.waitFor(()=>expect(m.fetch.mock.calls.some(([path,opts])=>
      path==="albums/album-A/cover"&&opts?.method==="PUT")).toBe(true));
    await vi.waitFor(()=>expect(client.getQueryData<{coverPhotoId:string|null}>(
      ["gallery","A:E1","alice","album-A","metadata"],
    )?.coverPhotoId).toBe("photo-A"));
    const put=m.fetch.mock.calls.filter(([path,opts])=>
      path==="albums/album-A/cover"&&opts?.method==="PUT");
    expect(put).toHaveLength(1);
    expect(put[0][1]).toMatchObject({body:{photoId:"photo-A"},
      requestGuard:expect.any(Function),skipAuthRefreshReplay:true});
    expect(m.fetch.mock.calls.filter(([path,opts])=>
      path==="albums/album-A"&&!opts?.method).length).toBeGreaterThanOrEqual(2);
    expect(host.textContent).not.toContain("Сохранение обложки не подтверждено");
  });
  it("ambiguous PUT response keeps old cover, displays safe status and blocks repeat",async()=>{
    let puts=0;
    m.fetch.mockImplementation(async (path:string,options?:{method?:string})=>{
      if(path.endsWith("/photos?pageSize=30"))return {...list("photos"),
        items:[{...photo(),canEdit:true}]};
      if(path==="albums/album-A/cover"&&options?.method==="PUT"){
        puts++;throw new Error("PRIVATE_MINIO_SECRET");
      }
      return {...album(),canEdit:true,coverPhotoId:null};
    });
    await openPicker();
    const trigger=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сделать обложкой фотографию"]')!;
    await act(async()=>{trigger.click();trigger.click();});
    await vi.waitFor(()=>expect(host.textContent).toContain("Сохранение обложки не подтверждено"));
    expect(host.textContent).not.toContain("PRIVATE_MINIO_SECRET");
    expect(puts).toBe(1);
    await act(async()=>trigger.click());
    expect(puts).toBe(1);
    expect(client.getQueryData<{coverPhotoId:string|null}>(
      ["gallery","A:E1","alice","album-A","metadata"],
    )?.coverPhotoId).toBeNull();
  });
});
