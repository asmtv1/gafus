// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  username: "alice",
  authed: true,
  wire: vi.fn(),
  close: vi.fn(),
  trace: vi.fn(),
  cacheSet: vi.fn(),
  invalidate: vi.fn(),
  inputs: new Map<string, { onChangeText: (v: string) => void }>(),
  switch: undefined as undefined | ((v: boolean) => void),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (s: (v: unknown) => unknown) =>
      s({
        user: { id: m.owner, username: m.username },
        isAuthenticated: m.authed,
        isLoading: false,
      }),
    {
      getState: () => ({
        user: { id: m.owner, username: m.username },
        isAuthenticated: m.authed,
        isLoading: false,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/gallery", () => ({
  galleryTransport: (...args: unknown[]) => m.wire(...args),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.trace }));
vi.mock("./data", () => ({
  galleryError: () => "Не удалось загрузить галерею",
  galleryKeys: {
    owner: (viewer: string, owner: string) => ["gallery", viewer, owner],
    album: (viewer: string, owner: string, id: string) => ["gallery", viewer, owner, id],
  },
  useAlbums: () => ({}),
  useGalleryContext: () => ({
    viewer: `${m.owner}:${m.epoch}`,
    actor: m.authed ? { ownerId: m.owner, authEpoch: m.epoch } : null,
    username: m.username,
    cache: { setQueryData: m.cacheSet, invalidateQueries: m.invalidate },
  }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-safe-area-context", async () => {
  const R = await import("react");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      R.createElement("div", null, children),
    initialWindowMetrics: null,
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    Modal: Box,
    ScrollView: Box,
    KeyboardAvoidingView: Box,
    Pressable: Box,
    Platform: { OS: "ios" },
    Switch: (p: { value: boolean; onValueChange: (v: boolean) => void }) => {
      m.switch = p.onValueChange;
      return R.createElement(
        "button",
        { "data-label": "visibility", onClick: () => p.onValueChange(!p.value) },
        String(p.value),
      );
    },
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    IconButton: ({ onPress }: { onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress }, "Закрыть"),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    Loading: () => null,
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Input: (p: { label: string; onChangeText: (s: string) => void; value: string }) => {
      m.inputs.set(p.label, p);
      return R.createElement("input", { value: p.value, readOnly: true });
    },
    Button: (p: { label: string; disabled?: boolean; onPress?: () => void }) =>
      R.createElement(
        "button",
        { "data-label": p.label, disabled: p.disabled, onClick: p.onPress },
        p.label,
      ),
  };
});
vi.mock("./image", () => ({ GalleryImage: () => null }));
vi.mock("./uploads", () => ({ UploadControls: () => null }));
vi.mock("@/shared/config", () => ({ COLORS: { primary: "olive" } }));
vi.mock("./styles", () => ({
  styles: {
    modal: {},
    editorHeader: {},
    heading: {},
    editorTitle: {},
    editorClose: {},
    content: {},
    visibilityRow: {},
    text: {},
    muted: {},
    error: {},
    card: {},
  },
}));
import { AlbumEditor } from "./components";
let root: Root, host: HTMLDivElement;
const album = () => ({
  id: "album1",
  name: "Собаки",
  isVisible: true,
  ownerId: "A",
  ownerUsername: "alice",
  canEdit: true,
  description: null,
  coverPhotoId: null,
  coverThumbUrl: null,
  urlsExpireAt: null,
  photoCount: 0,
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
});
let saved: ReturnType<typeof album>;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { resolve, promise };
};
async function mount(a?: ReturnType<typeof album>, owner = "alice") {
  await act(async () =>
    root.render(createElement(AlbumEditor, { owner, album: a, close: m.close })),
  );
}
async function edit(value: string) {
  await act(async () => m.inputs.get("Название альбома")!.onChangeText(value));
}
function button() {
  return host.querySelector<HTMLButtonElement>('button[data-label="Сохранить"]')!;
}
async function save() {
  await act(async () => button().click());
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.username = "alice";
  m.authed = true;
  m.inputs.clear();
  m.switch = undefined;
  saved = album();
  m.invalidate.mockResolvedValue(undefined);
  m.wire.mockImplementation(async (_path: string, opts?: { body?: Record<string, unknown> }) => {
    if (opts?.body) saved = { ...saved, ...opts.body } as typeof saved;
    return { ...saved };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("actual mounted AlbumEditor existing POST/PATCH -> GET", () => {
  it("create requires POST ACK plus matching GET before close", async () => {
    await mount();
    await edit("  Новое  ");
    const ack = deferred<typeof saved>();
    m.wire.mockReturnValueOnce(ack.promise);
    await save();
    expect(m.wire).toHaveBeenCalledOnce();
    expect(m.wire.mock.calls[0][1].body).toEqual({ name: "Новое", isVisible: true });
    expect(m.close).not.toHaveBeenCalled();
    saved.name = "Новое";
    await act(async () => ack.resolve({ ...saved }));
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.wire).toHaveBeenCalledTimes(2);
    expect(m.cacheSet).toHaveBeenCalledOnce();
  });
  it("rename PATCH only changed name, exact GET", async () => {
    await mount(album());
    await edit("Друзья");
    await save();
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.wire.mock.calls[0][0]).toBe("albums/album1");
    expect(m.wire.mock.calls[0][1].body).toEqual({ name: "Друзья" });
  });
  it("unchanged form exits with zero HTTP", async () => {
    await mount(album());
    await save();
    expect(m.wire).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledOnce();
  });
  it("rapid doubletap triggers one POST", async () => {
    await mount();
    await edit("Новое");
    const ack = deferred<typeof saved>();
    m.wire.mockReturnValueOnce(ack.promise);
    const b = button();
    await act(async () => {
      b.click();
      b.click();
    });
    expect(m.wire).toHaveBeenCalledOnce();
    saved.name = "Новое";
    await act(async () => ack.resolve({ ...saved }));
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  });
  it("unknown timeout locks Save without retry and no secrets logged", async () => {
    await mount();
    await edit("Новое");
    m.wire.mockRejectedValueOnce(new Error("signed-url?token=SECRET"));
    await save();
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(button().disabled).toBe(true);
    await edit("Ещё");
    await save();
    expect(m.wire).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("SECRET");
  });
  it("structured validation rejects without close/auto retry", async () => {
    await mount();
    await edit("Новое");
    m.wire.mockRejectedValueOnce(Object.assign(new Error("PRIVATE"), { code: "VALIDATION" }));
    await save();
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте введённые данные"));
    expect(m.wire).toHaveBeenCalledOnce();
    expect(m.close).not.toHaveBeenCalled();
  });
  it("stale readback after ACK is UNKNOWN not success", async () => {
    await mount();
    await edit("Новое");
    m.wire.mockResolvedValueOnce({ ...saved, name: "Новое" });
    m.wire.mockResolvedValueOnce({ ...saved, name: "Собаки" });
    await save();
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(m.close).not.toHaveBeenCalled();
    expect(m.cacheSet).not.toHaveBeenCalled();
  });
  it("A->B->A new epoch during POST rejects old callbacks", async () => {
    await mount();
    await edit("Новое");
    const ack = deferred<typeof saved>();
    m.wire.mockReturnValueOnce(ack.promise);
    await save();
    const guard = m.wire.mock.calls[0][1].requestGuard as () => boolean;
    m.owner = "B";
    m.epoch = "EB";
    m.owner = "A";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    await act(async () => ack.resolve({ ...saved, name: "Новое" }));
    expect(m.wire).toHaveBeenCalledOnce();
    expect(m.close).not.toHaveBeenCalled();
  });
  it("unmount during POST prevents late close/cache", async () => {
    await mount();
    await edit("Новое");
    const ack = deferred<typeof saved>();
    m.wire.mockReturnValueOnce(ack.promise);
    await save();
    await act(async () => root.unmount());
    await act(async () => ack.resolve({ ...saved, name: "Новое" }));
    expect(m.close).not.toHaveBeenCalled();
    expect(m.cacheSet).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("logged-out/foreign owner cannot create album", async () => {
    m.authed = false;
    await mount();
    await edit("Новое");
    await save();
    expect(m.wire).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(host);
    m.authed = true;
    await mount(undefined, "bob");
    await edit("Новое");
    await save();
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("blank title blocked before transport", async () => {
    await mount();
    await edit("  ");
    expect(button().disabled).toBe(true);
    await save();
    expect(m.wire).not.toHaveBeenCalled();
  });
  it("privacy toggle PATCH sends only isVisible=false", async () => {
    await mount(album());
    await act(async () => m.switch?.(false));
    await save();
    await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.wire.mock.calls[0][1].body).toEqual({ isVisible: false });
  });
});
