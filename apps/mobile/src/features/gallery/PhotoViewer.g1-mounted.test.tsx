// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  epoch: "E1",
  owner: "A",
  get: vi.fn(),
  close: vi.fn(),
  fallback: vi.fn(),
  cleanup: undefined as undefined | (() => void),
  image: vi.fn(),
}));
vi.mock("./data", () => ({
  galleryKeys: {
    album: (viewer: string, owner: string, id: string) => ["gallery", viewer, owner, id],
  },
  useGalleryContext: () => ({
    viewer: `${m.owner}:${m.epoch}`,
    actor: { ownerId: m.owner, authEpoch: m.epoch },
  }),
  useForeground: () => true,
}));
vi.mock("./privateRead", () => ({
  privateGalleryReads: () => ({ getPhoto: m.get }),
  sameGalleryActor: (actor: { ownerId: string; authEpoch: string }) =>
    actor.ownerId === m.owner && actor.authEpoch === m.epoch,
  publicGalleryPhoto: (p: unknown) => p,
  signedGalleryUrl: (u: string | undefined, e: string | undefined) =>
    u && e && Date.parse(e) > Date.now() + 5_000 ? u : null,
}));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryApi: { requestMediaFallback: m.fallback } }));
vi.mock("./session", () => ({
  registerGalleryCleanup: (clean: () => void) => {
    m.cleanup = clean;
    return () => {
      m.cleanup = undefined;
    };
  },
}));
vi.mock("./components", async () => {
  const R = await import("react");
  return { Failure: () => R.createElement("span", null, "Не удалось загрузить изображение") };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return { Loading: () => R.createElement("span", null, "Загрузка фотографии") };
});
vi.mock("@/shared/components/media/CdnImage", async () => {
  const R = await import("react");
  return {
    CdnImage: (p: Record<string, unknown>) => {
      m.image(p);
      return R.createElement(
        "span",
        { "data-img": p.cdnUrl, "data-private": p.privateMemoryOnly },
        "Изображение",
      );
    },
  };
});
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-safe-area-context", async () => {
  const R = await import("react");
  const Box = ({ children }: { children: React.ReactNode }) =>
    R.createElement("div", null, children);
  return { SafeAreaProvider: Box, SafeAreaView: Box };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const Pressable = ({
    onPress,
    accessibilityLabel,
    children,
  }: {
    onPress?: () => void;
    accessibilityLabel?: string;
    children?: React.ReactNode;
  }) => R.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children);
  const FlatList = ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (args: { item: unknown; index: number }) => React.ReactNode;
  }) =>
    R.createElement(
      "div",
      null,
      data.map((item, index) =>
        R.createElement("div", { key: index }, renderItem({ item, index })),
      ),
    );
  return {
    View: Box,
    Modal: Box,
    Pressable,
    FlatList,
    useWindowDimensions: () => ({ width: 390, height: 800 }),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native-reanimated", async () => {
  const R = await import("react");
  const View = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    default: { View },
    useSharedValue: (n: number) => ({ value: n }),
    useAnimatedStyle: () => ({}),
    runOnJS: (fn: () => void) => fn,
    withSpring: (n: number) => n,
    withTiming: (n: number) => n,
  };
});
vi.mock("react-native-gesture-handler", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const Pan = () => {
    const x = {
      enabled: () => x,
      activeOffsetY: () => x,
      failOffsetX: () => x,
      onUpdate: () => x,
      onEnd: () => x,
      onFinalize: () => x,
    };
    return x;
  };
  return { Gesture: { Pan }, GestureDetector: Box, GestureHandlerRootView: Box };
});
vi.mock("./styles", () => ({ styles: { viewer: {}, viewerBar: {}, viewerText: {}, close: {} } }));
import { PhotoViewer } from "./viewer";
let root: Root, host: HTMLDivElement, cache: QueryClient;
const dto = (expiry: string) => ({
  id: "photo",
  albumId: "album",
  status: "ready" as const,
  caption: "Пёс",
  fullUrl: "https://cdn.example/full?sig=secret",
  thumbUrl: "https://cdn.example/thumb?sig=secret",
  urlsExpireAt: expiry,
  createdAt: "2026-10-18",
  width: 20,
  height: 20,
  expiresAt: null,
  canEdit: false,
});
const pending = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { resolve, promise };
};
async function mount() {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(PhotoViewer, {
          photos: [dto(new Date(Date.now() + 60_000).toISOString())],
          start: 0,
          owner: "alice",
          total: 1,
          more: vi.fn(),
          close: m.close,
        }),
      ),
    ),
  );
  await vi.waitFor(() => expect(m.get).toHaveBeenCalled());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.epoch = "E1";
  m.owner = "A";
  m.cleanup = undefined;
  m.get.mockResolvedValue(dto(new Date(Date.now() + 60_000).toISOString()));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("real mounted PhotoViewer fullscreen safe signed media", () => {
  it("fresh URL renders fullscreen private-memory CdnImage only after getPhoto", async () => {
    await mount();
    await vi.waitFor(() => expect(host.querySelector("[data-img]")).not.toBeNull());
    expect(host.querySelector("[data-private]")?.getAttribute("data-private")).toBe("true");
    expect(host.textContent).toContain("1 / 1");
  });
  it("expired URL shows explicit retry/error instead of an empty or stale full image", async () => {
    m.get.mockResolvedValue(dto(new Date(Date.now() - 3_000).toISOString()));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Срок ссылки истёк"));
    expect(host.querySelector("[data-img]")).toBeNull();
  });
  it("failed photo GET reports error rather than rendering stale thumbnail/full", async () => {
    m.get.mockRejectedValue(new Error("private storage URL"));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить изображение"));
    expect(host.textContent).not.toContain("private storage URL");
    expect(host.querySelector("[data-img]")).toBeNull();
  });
  it("unmount before GET resolves cannot display old URL", async () => {
    const d = pending<ReturnType<typeof dto>>();
    m.get.mockReturnValueOnce(d.promise);
    await mount();
    await act(async () => root.unmount());
    await act(async () => d.resolve(dto(new Date(Date.now() + 60_000).toISOString())));
    expect(m.image).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("logout registered gallery cleanup closes fullscreen promptly", async () => {
    await mount();
    expect(typeof m.cleanup).toBe("function");
    await act(async () => m.cleanup?.());
    expect(m.close).toHaveBeenCalledOnce();
  });
});
