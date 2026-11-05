// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  username: "alice",
  permission: vi.fn(),
  picker: vi.fn(),
  manipulate: vi.fn(),
  api: vi.fn(),
  storage: vi.fn(),
  tracer: vi.fn(),
  next: 0,
  background: false,
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: m.owner, username: m.username },
      isAuthenticated: true,
      isLoading: false,
    }),
  },
}));
vi.mock("./privateRead", () => ({
  sameGalleryActor: (actor: { ownerId: string; authEpoch: string }) =>
    actor.ownerId === m.owner && actor.authEpoch === m.epoch,
}));
// Mobile always uploads client-rendered WebP. Simulate both signed POSTs while
// preserving the mounted UI/queue/owner/expiry assertions below.
vi.mock("@/shared/lib/media/prepareUploadWebp", () => ({
  prepareUploadWebpVariants: vi.fn(async () => ({
    thumb: {uri:"file:///temp/thumb.webp",mime:"image/webp",width:100,height:100,bytes:200,dispose:vi.fn()},
    full: {uri:"file:///temp/full.webp",mime:"image/webp",width:100,height:100,bytes:200,dispose:vi.fn()},
  })),
}));
vi.mock("@/shared/lib/media/directPhotoUpload", () => ({
  postClientWebp: vi.fn(async () => { await m.storage(); }),
}));
vi.mock("@/shared/lib/api/gallery", () => ({
  galleryTransport: (...args: unknown[]) => m.api(...args),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.tracer }));
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => m.permission(...a),
  launchImageLibraryAsync: (...a: unknown[]) => m.picker(...a),
}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: (...args: unknown[]) => m.manipulate(...args),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    size = 200;
    constructor(uri: string) {
      this.uri = uri;
    }
    open() {
      return {
        readBytes: () => new Uint8Array([255, 216, 255, ...Array(9).fill(0)]),
        close: () => undefined,
      };
    }
    delete() {
      return undefined;
    }
  },
}));
vi.mock("expo-image", async () => {
  const R=await import("react");
  const MockImage=Object.assign(({source}:{source?:{uri?:string}})=>
    R.createElement("img",{src:source?.uri}),{
      clearMemoryCache:vi.fn().mockResolvedValue(undefined),
      clearDiskCache:vi.fn().mockResolvedValue(undefined),
    });
  return {Image:MockImage};
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({ COLORS: { primary: "olive", textSecondary: "gray" } }));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => R.createElement("button", { "data-button": label, disabled, onClick: onPress }, label),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const Pressable = ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children);
  return {
    View: Box,
    Pressable,
    Linking: { openSettings: vi.fn() },
    Alert: { alert: vi.fn() },
    AppState: {
      get currentState() {
        return m.background ? "background" : "active";
      },
      addEventListener: () => ({ remove: () => undefined }),
    },
  };
});
vi.mock("./data", () => ({
  useGalleryContext: () => ({
    viewer: `${m.owner}:${m.epoch}`,
    username: m.username,
    actor: { ownerId: m.owner, authEpoch: m.epoch },
    cache: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
  }),
  useForeground: () => !m.background,
  galleryKeys: {
    owner: (viewer: string, owner: string) => ["gallery", viewer, owner],
    album: (viewer: string, owner: string, id: string) => ["gallery", viewer, owner, id],
  },
  galleryError: () => "Не удалось загрузить фото",
  requestId: () => `req-${++m.next}`,
}));
vi.mock("./styles", () => ({
  styles: {
    section: {},
    albumsUploadSection: {},
    uploadNotice: {},
    uploadNoticeRow: {},
    uploadNoticeText: {},
    uploadFileName: {},
    uploadStatus: {},
    uploadNoticeAction: {},
    uploadNoticeError: {},
    uploadStatusError: {},
    uploadStatusRetry: {},
    uploadStatusRetryText: {},
    albumsUploadWarning: {},
    muted: {},
    error: {},
  },
}));
import { useGallerySession } from "./session";
import { prepareUploadWebpVariants } from "@/shared/lib/media/prepareUploadWebp";
import { UploadControls } from "./uploads";
const expiry = () => new Date(Date.now() + 60_000).toISOString();
const signedThumb = () => ({method:"POST" as const,
  url:"https://s3.cloud.ru/gafus-gallery-private",
  fields:{ "Content-Type":"image/webp",policy:"PRIVATE_POLICY" },
});
const clientReserved = () => ({...reserved(),thumbUpload:signedThumb()});
const reserved = () => ({
  uploadId: "upload1",
  albumId: "album1",
  status: "reserved",
  postUrl: "https://storage.example/secret?X-Amz-Signature=NEVERLOG",
  postFields: { "Content-Type": "image/webp", policy: "PRIVATE_POLICY" },

  reservationExpiresAt: expiry(),
  expiresAt: expiry(),
  photo: null,
});
let root: Root, host: HTMLDivElement, query: QueryClient;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
const uploadCalls = (suffix: string) =>
  m.api.mock.calls.filter((args: unknown[]) => String(args[0]).includes(suffix));
async function mounted(retryUploadId?: string) {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: query },
        createElement(UploadControls, {
          owner: "alice",
          albumId: "album1",
          usedSlots: 1,
          retryUploadId,
        }),
      ),
    ),
  );
}
function button() {
  const b =
    host.querySelector<HTMLButtonElement>('button[data-button="Добавить фотографии"]') ??
    host.querySelector<HTMLButtonElement>('button[data-button="Выбрать файл заново"]');
  if (!b) throw new Error("missing upload picker");
  return b;
}
async function pick() {
  await act(async () => button().click());
}
async function reached(status: string) {
  await vi.waitFor(() => expect(useGallerySession.getState().tasks[0]?.status).toBe(status));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.username = "alice";
  m.next = 0;
  m.background = false;
  useGallerySession.setState({ tasks: [], epoch: 0 });
  m.manipulate.mockResolvedValue({ uri: "file:///temp/optimized.jpg", width: 100, height: 100 });
  m.permission.mockResolvedValue({ granted: true });
  m.picker.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///test.jpg",
        width: 100,
        height: 100,
        mimeType: "image/jpeg",
        fileName: "secret-pet.jpg",
      },
    ],
  });
  m.api.mockImplementation(async (path: string) => {
    if (path === "uploads/client-reserve") return clientReserved();
    if (path.endsWith("/client-complete")) return { ...reserved(), status: "processing" };
    if (path === "uploads/upload1/client-thumb") return signedThumb();
    if (path === "uploads/upload1")
      return { ...reserved(), status: "processing", postUrl: null, postFields: null };
    throw Error("unexpected path");
  });
  m.storage.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", m.storage);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  query.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("actual mounted ImagePicker -> prepare -> reserve -> storage -> commit -> GET", () => {
  it("retains failed image and retries exactly it from cached source without reopening picker",async()=>{
    const convert=vi.mocked(prepareUploadWebpVariants);
    convert.mockRejectedValueOnce(Error("WebP image manipulator failed"));
    await mounted();
    await pick();
    await reached("failed");
    const initial=useGallerySession.getState().tasks[0]!;
    expect(initial.previewUri).toBe("file:///test.jpg");
    expect(m.picker).toHaveBeenCalledOnce();
    expect(m.storage).not.toHaveBeenCalled();
    const retry=host.querySelector<HTMLButtonElement>(
      'button[aria-label="Повторить обработку фото secret-pet.jpg"]');
    expect(retry).not.toBeNull();
    await act(async()=>retry?.click());
    await reached("processing");
    expect(m.picker).toHaveBeenCalledOnce();
    expect(convert).toHaveBeenCalledTimes(2);
    expect(m.storage).toHaveBeenCalledTimes(2);
    expect(uploadCalls("client-reserve")).toHaveLength(1);
  });
  it("valid real handler invokes existing SDK/adapter exactly once, readback, stores no signed POST secrets", async () => {
    await mounted();
    await pick();
    await reached("processing");
    expect(m.permission).toHaveBeenCalledOnce();
    expect(m.picker).toHaveBeenCalledOnce();
    expect(m.manipulate).toHaveBeenCalledWith("file:///test.jpg", [],
      { format: "jpeg", compress: 0.8 });
    expect(uploadCalls("client-reserve")).toHaveLength(1);
    expect(m.storage).toHaveBeenCalledTimes(2);
    expect(uploadCalls("/client-complete")).toHaveLength(1);
    expect(uploadCalls("uploads/upload1").length).toBeGreaterThanOrEqual(1);
    const body = uploadCalls("client-reserve")[0][1].body;
    expect(body).toMatchObject({
      albumId: "album1",
      declaredMime: "image/webp",
      declaredBytes: 200,
    });
    expect(body.clientRequestId).toMatch(/^req-/);
    const task = useGallerySession.getState().tasks[0];
    expect(task.ownerId).toBe("A");
    expect(task.authEpoch).toBe("E1");
    expect(JSON.stringify(task)).not.toContain("NEVERLOG");
    expect(JSON.stringify(task)).not.toContain("PRIVATE_POLICY");
    expect(JSON.stringify(m.tracer.mock.calls)).not.toContain("secret-pet.jpg");
  });
  it("blocks new photos while prior storage acknowledgement is unknown, with cancellation and status controls", async () => {
    useGallerySession.setState({ epoch: 0, tasks: [{
      id: "req-uncertain", owner: "alice", ownerId: "A", authEpoch: "E1",
      albumId: "album1", filename: "first.jpg", generation: 0,
      status: "unknown", upload: { ...reserved(), status: "reserved" as const, postUrl: null, postFields: null },
    }] });
    await mounted();
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain("Новые фото временно заблокированы");
    expect(host.querySelector('button[aria-label="Проверить статус без повторной отправки"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Отменить загрузку first.jpg"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Закрыть сообщение о загрузке first.jpg"]')).toBeNull();
    await pick();
    expect(m.permission).not.toHaveBeenCalled();
    expect(m.picker).not.toHaveBeenCalled();
    expect(uploadCalls("client-reserve")).toHaveLength(0);
  });
  it("rapid doubletap before busy state rerender opens one picker and one reserve", async () => {
    await mounted();
    await act(async () => {
      button().click();
      button().click();
    });
    await reached("processing");
    expect(m.picker).toHaveBeenCalledOnce();
    expect(uploadCalls("client-reserve")).toHaveLength(1);
  });
  it("owner A->B->A newer epoch after media permission prevents picker and API", async () => {
    const p = deferred<{ granted: boolean }>();
    m.permission.mockReturnValueOnce(p.promise);
    await mounted();
    await pick();
    await vi.waitFor(() => expect(m.permission).toHaveBeenCalledOnce());
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "E2";
    await act(async () => p.resolve({ granted: true }));
    expect(m.picker).not.toHaveBeenCalled();
    expect(m.api).not.toHaveBeenCalled();
  });
  it("unmount during pending picker discards late photo without SDK File/storage/HTTP", async () => {
    const p = deferred<unknown>();
    m.picker.mockReturnValueOnce(p.promise);
    await mounted();
    await pick();
    await vi.waitFor(() => expect(m.picker).toHaveBeenCalledOnce());
    await act(async () => root.unmount());
    await act(async () =>
      p.resolve({
        canceled: false,
        assets: [{ uri: "file:///test.jpg", width: 100, height: 100 }],
      }),
    );
    expect(m.api).not.toHaveBeenCalled();
    expect(m.storage).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("lost commit response ends UNKNOWN, never resubmits commit even after status check reserved", async () => {
    m.api.mockImplementation(async (path: string) => {
      if (path === "uploads/client-reserve") return clientReserved();
      if (path.endsWith("/client-complete")) throw new Error("lost ACK X-Amz-Signature=SECRET");
      if (path === "uploads/upload1") return reserved();
      throw Error("unexpected");
    });
    await mounted();
    await pick();
    await reached("unknown");
    expect(uploadCalls("/client-complete")).toHaveLength(1);
    const action = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Проверить статус без повторной отправки"]',
    );
    expect(action).not.toBeNull();
    await act(async () => action?.click());
    expect(uploadCalls("/client-complete")).toHaveLength(1);
    expect(useGallerySession.getState().tasks[0].status).toBe("unknown");
    expect(host.textContent).not.toContain("SECRET");
  });
  it("expired signed POST token blocks transfer even when reservation remains valid", async () => {
    m.api.mockImplementation(async (path: string) =>
      path === "uploads/client-reserve"
        ? { ...clientReserved(), expiresAt: new Date(Date.now() - 1_000).toISOString() }
        : reserved(),
    );
    await mounted();
    await pick();
    await reached("expired");
    expect(m.storage).not.toHaveBeenCalled();
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("expired reserve stops before storage fetch and commit", async () => {
    m.api.mockImplementation(async (path: string) =>
      path === "uploads/client-reserve"
        ? { ...clientReserved(), reservationExpiresAt: new Date(Date.now() - 1_000).toISOString() }
        : reserved(),
    );
    await mounted();
    await pick();
    await reached("expired");
    expect(m.storage).not.toHaveBeenCalled();
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("epoch A->B->A while reserve pending drops late storage transfer and commit", async () => {
    const d = deferred<ReturnType<typeof reserved>>();
    m.api.mockImplementation(async (path: string) =>
      path === "uploads/client-reserve" ? d.promise : reserved(),
    );
    await mounted();
    await pick();
    await vi.waitFor(() => expect(uploadCalls("client-reserve")).toHaveLength(1));
    m.owner = "B";
    m.epoch = "E-B";
    m.owner = "A";
    m.epoch = "E2";
    await act(async () => d.resolve(reserved()));
    expect(m.storage).not.toHaveBeenCalled();
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("matching ACK with GET ready but no photo identity is UNKNOWN, never false ready", async () => {
    m.api.mockImplementation(async (path: string) => {
      if (path === "uploads/client-reserve") return clientReserved();
      if (path.endsWith("/client-complete")) return { ...reserved(), status: "processing" };
      if (path === "uploads/upload1") return { ...reserved(), status: "ready", photo: null };
      throw Error("unexpected");
    });
    await mounted();
    await pick();
    await reached("unknown");
    expect(uploadCalls("/client-complete")).toHaveLength(1);
    expect(host.textContent).not.toContain("Фото добавлено");
  });
  it("lost GET readback after positive commit remains UNKNOWN with one commit only", async () => {
    m.api.mockImplementation(async (path: string) => {
      if (path === "uploads/client-reserve") return clientReserved();
      if (path.endsWith("/client-complete")) return { ...reserved(), status: "processing" };
      if (path === "uploads/upload1") throw new Error("X-Amz-Signature=PRIVATE");
      throw Error("unexpected");
    });
    await mounted();
    await pick();
    await reached("unknown");
    expect(uploadCalls("/client-complete")).toHaveLength(1);
    expect(host.textContent).not.toContain("PRIVATE");
  });
  it("S3 POST accepted before signed token expiry still confirms while reservation is valid", async () => {
    const base = Date.now();
    const pending = deferred<{ ok: boolean }>();
    m.storage.mockReturnValueOnce(pending.promise);
    m.api.mockImplementation(async (path: string) => {
      if (path === "uploads/client-reserve")
        return {
          ...clientReserved(),
          expiresAt: new Date(base + 6_000).toISOString(),
          reservationExpiresAt: new Date(base + 60_000).toISOString(),
        };
      if (path.endsWith("/client-complete")) return { ...reserved(), status: "processing" };
      if (path === "uploads/upload1") return { ...reserved(), status: "processing" };
      throw Error("unexpected");
    });
    await mounted();
    await pick();
    await vi.waitFor(() => expect(m.storage).toHaveBeenCalledTimes(2));
    const clock = vi.spyOn(Date, "now").mockReturnValue(base + 7_000);
    try {
      await act(async () => pending.resolve({ ok: true }));
      await reached("processing");
    } finally {
      clock.mockRestore();
    }
    expect(uploadCalls("/client-complete")).toHaveLength(1);
  });
  it("reservation token expires during pending storage POST: no commit attempted", async () => {
    const base = Date.now();
    const d = deferred<{ ok: boolean }>();
    m.storage.mockReturnValueOnce(d.promise);
    m.api.mockImplementation(async (path: string) => {
      if (path === "uploads/client-reserve")
        return { ...clientReserved(), reservationExpiresAt: new Date(base + 6_000).toISOString() };
      throw Error("should not commit expired reservation");
    });
    await mounted();
    await pick();
    await vi.waitFor(() => expect(m.storage).toHaveBeenCalledTimes(2));
    const clock = vi.spyOn(Date, "now").mockReturnValue(base + 7_000);
    try {
      await act(async () => d.resolve({ ok: true }));
      await reached("expired");
    } finally {
      clock.mockRestore();
    }
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("historical failed photo retry first authorizes GET, then existing retryUpload+transfer+commit", async () => {
    m.api.mockImplementation(async (path: string, _options?: { method?: string }) => {
      if (path === "uploads/historical")
        return {
          ...reserved(),
          uploadId: "historical",
          status: "failed",
          postUrl: null,
          postFields: null,
        };
      if (path === "uploads/historical/retry") return reserved();
      if (path === "uploads/upload1/client-thumb") return signedThumb();
      if (path.endsWith("/client-complete")) return { ...reserved(), status: "processing" };
      if (path === "uploads/upload1") return { ...reserved(), status: "processing" };
      throw Error("unexpected retry path");
    });
    await mounted("historical");
    await pick();
    await reached("processing");
    expect(m.api.mock.calls[0][0]).toBe("uploads/historical");
    expect(uploadCalls("historical/retry")).toHaveLength(1);
    expect(m.picker).toHaveBeenCalledOnce();
    expect(m.storage).toHaveBeenCalledTimes(2);
    expect(uploadCalls("/client-complete")).toHaveLength(1);
  });
  it("historical reserved upload does not create a retry task or open picker", async () => {
    m.api.mockImplementation(async (path: string) =>
      path === "uploads/historical"
        ? { ...reserved(), uploadId: "historical", status: "reserved" }
        : reserved(),
    );
    await mounted("historical");
    await pick();
    await vi.waitFor(() => expect(host.textContent).toContain("Повторная загрузка недоступна"));
    expect(m.picker).not.toHaveBeenCalled();
    expect(useGallerySession.getState().tasks).toHaveLength(0);
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("historical retry GET from another album cannot authorize SDK or network write", async () => {
    m.api.mockImplementation(async (path: string) =>
      path === "uploads/historical"
        ? { ...reserved(), uploadId: "historical", albumId: "foreign", status: "failed" }
        : reserved(),
    );
    await mounted("historical");
    await pick();
    await vi.waitFor(() => expect(host.textContent).toContain("Повторная загрузка недоступна"));
    expect(m.picker).not.toHaveBeenCalled();
    expect(uploadCalls("/client-complete")).toHaveLength(0);
  });
  it("A→B→A epoch during historical retry GET blocks late ImagePicker", async () => {
    const pending = deferred<ReturnType<typeof reserved>>();
    m.api.mockReturnValueOnce(pending.promise);
    await mounted("historical");
    await pick();
    await vi.waitFor(() => expect(m.api).toHaveBeenCalledOnce());
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "E2";
    await act(async () =>
      pending.resolve({ ...reserved(), uploadId: "historical", status: "failed" }),
    );
    expect(m.picker).not.toHaveBeenCalled();
    expect(useGallerySession.getState().tasks).toHaveLength(0);
  });
});
