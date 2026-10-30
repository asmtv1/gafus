// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  username: "alice",
  logged: true,
  loading: false,
  list: vi.fn(),
  detail: vi.fn(),
  media: vi.fn(),
  pet: vi.fn(),
  links: vi.fn(),
  navigate: vi.fn(),
  uploads: vi.fn(),
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner, username: m.username } : null,
      }),
    {
      getState: () => ({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner, username: m.username } : null,
      }),
    },
  ),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner, username: m.username } : null,
      }),
    {
      getState: () => ({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner, username: m.username } : null,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/pet-vet-visits", () => ({
  petVetVisitsApi: {
    listResponse: (...args: unknown[]) => m.list(...args),
    detailResponse: (...args: unknown[]) => m.detail(...args),
    media: (...args: unknown[]) => m.media(...args),
    list: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
    removeAttachment: vi.fn(),
  },
}));
vi.mock("@/shared/lib/api/pets", () => ({
  petsApi: { getById: (...args: unknown[]) => m.pet(...args) },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("expo-router", async () => {
  const R = await import("react");
  const Screen = () => null;
  return {
    Stack: { Screen },
    useRouter: () => ({ push: vi.fn() }),
    useNavigation: () => ({ dispatch: m.navigate }),
    useFocusEffect: (fn: () => void | (() => void)) => R.useEffect(fn, [fn]),
  };
});
vi.mock("@react-navigation/native", () => ({ usePreventRemove: vi.fn() }));
vi.mock("react-native-safe-area-context", async () => {
  const R = await import("react");
  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  StorageAccessFramework: { requestDirectoryPermissionsAsync: vi.fn(), createFileAsync: vi.fn() },
  downloadAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black" },
  FONTS: { montserratBold: "bold", montserrat: "sans" },
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: ({ message }: { message: string }) =>
      R.createElement("div", { "data-loading": message }, message),
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => R.createElement("button", { disabled, onClick: onPress }, label),
  };
});
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
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
  return {
    View: Box,
    Modal: Box,
    KeyboardAvoidingView: Box,
    ScrollView: Box,
    StyleSheet: { create: (x: unknown) => x },
    Platform: { OS: "ios" },
    Keyboard: { dismiss: vi.fn() },
    Share: { share: vi.fn() },
    Linking: { openURL: (...args: unknown[]) => m.links(...args), openSettings: vi.fn() },
    Alert: { alert: vi.fn() },
    TextInput: (p: { accessibilityLabel?: string }) =>
      R.createElement("input", { "aria-label": p.accessibilityLabel }),
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel },
        children,
      ),
  };
});
import { PetVetVisitsScreen } from "./PetVetVisits";
let root: Root, host: HTMLDivElement, client: QueryClient;
const row = () => ({
  id: "visit1",
  petId: "pet1",
  visitedOn: "2026-10-18",
  specialty: "THERAPY_PRIVATE",
  doctorName: "DOCTOR_PRIVATE",
  clinic: "CLINIC_PRIVATE",
  diagnosis: "DIAGNOSIS_PRIVATE",
  conclusion: "CONCLUSION_PRIVATE",
  notes: "NOTE_PRIVATE",
  attachments: [
    {
      id: "att1",
      name: "medical.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
      hasPreview: true,
    },
  ],
  leak: "SIGNED_SECRET_KEY",
});
const delayed = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { resolve, promise };
};
async function render(petId = "pet1") {
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client }, createElement(PetVetVisitsScreen, { petId })),
    ),
  );
}
async function shown(t: string) {
  // Flush asynchronous QueryClient updates inside act before DOM assertions.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await vi.waitFor(() => expect(host.textContent).toContain(t));
}
const press = (substring: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(substring));
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.username = "alice";
  m.logged = true;
  m.loading = false;
  m.list.mockResolvedValue({ success: true, data: [row()] });
  m.detail.mockResolvedValue({ success: true, data: row() });
  m.pet.mockResolvedValue({ success: true, data: { id: "pet1", name: "PetPrivate" } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe("V43 actual mounted PetVetVisits history→single detail safe owner GET", () => {
  it("fresh owned history shows card but does not reveal diagnosis or request media until explicit expansion", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    expect(host.textContent).not.toContain("DIAGNOSIS_PRIVATE");
    expect(m.detail).not.toHaveBeenCalled();
    expect(m.media).not.toHaveBeenCalled();
    expect(m.links).not.toHaveBeenCalled();
    expect(m.list).toHaveBeenCalledWith("pet1", expect.any(Function));
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey.join("/") === "pet-vet-visits/owner/A/E1/pet1"),
    ).toBe(true);
  });
  it("expansion requests exact visit detail; renders diagnosis and attachment metadata, no auto signed URL GET", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("DIAGNOSIS_PRIVATE");
    expect(m.detail).toHaveBeenCalledWith("pet1", "visit1", expect.any(Function));
    expect(host.textContent).toContain("medical.pdf");
    expect(host.textContent).not.toContain("SIGNED_SECRET_KEY");
    expect(m.media).not.toHaveBeenCalled();
    expect(m.links).not.toHaveBeenCalled();
  });
  it("200 [] shows real empty history only", async () => {
    m.list.mockResolvedValue({ success: true, data: [] });
    await render();
    await shown("Здесь будет история посещений");
    expect(m.detail).not.toHaveBeenCalled();
  });
  it.each(["VET_VISIT_NOT_FOUND", "BAD_REQUEST", "REQUEST_TIMEOUT", "NETWORK_ERROR"])(
    "%s list failure never becomes empty/no medical data",
    async (code) => {
      m.list.mockResolvedValue({ success: false, code, error: "DIAGNOSIS_SECRET_RAW" });
      await render();
      await vi.waitFor(() =>
        expect(host.textContent).toMatch(/не найдено|Не удалось загрузить историю/),
      );
      expect(host.textContent).not.toContain("Здесь будет история посещений");
      expect(host.textContent).not.toContain("DIAGNOSIS_SECRET_RAW");
    },
  );
  it("missing/unknown detail after card expansion never uses diagnosis from cached list", async () => {
    m.detail.mockResolvedValue({ success: false, code: "VET_VISIT_NOT_FOUND" });
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("Посещение не найдено");
    expect(host.textContent).not.toContain("DIAGNOSIS_PRIVATE");
    expect(m.media).not.toHaveBeenCalled();
  });
  it("logout after fresh list hides private history and blocks detail", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    m.logged = false;
    await render();
    await shown("Медкарта доступна только владельцу");
    expect(host.textContent).not.toContain("THERAPY_PRIVATE");
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("A→B→A new epoch while list pending blocks late private medical response", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof row>[] }>();
    m.list.mockReturnValueOnce(d.promise);
    await render();
    await shown("Загрузка посещений");
    const oldGuard = m.list.mock.calls[0][1] as () => boolean;
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    m.list.mockResolvedValue({ success: true, data: [] });
    await render();
    expect(oldGuard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: [row()] }));
    await shown("Здесь будет история посещений");
    expect(host.textContent).not.toContain("THERAPY_PRIVATE");
  });
  it("unsigned URL returned by existing media GET is never opened as PDF", async () => {
    m.media.mockResolvedValue({ url: "https://private.example/plain.pdf?token=PRIVATE" });
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("medical.pdf");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Открыть medical.pdf"]')?.click(),
    );
    await vi.waitFor(() => expect(m.media).toHaveBeenCalledOnce());
    expect(m.media.mock.calls[0]).toEqual([
      "pet1",
      "visit1",
      "att1",
      "original",
      expect.any(Function),
    ]);
    expect(m.links).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("https://private.example/plain.pdf");
  });
  it("late PDF media response from A->B->A new epoch cannot invoke external Linking", async () => {
    const d = delayed<{ url: string }>();
    m.media.mockReturnValueOnce(d.promise);
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("medical.pdf");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Открыть medical.pdf"]')?.click(),
    );
    await vi.waitFor(() => expect(m.media).toHaveBeenCalledOnce());
    const guard = m.media.mock.calls[0][4] as () => boolean;
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(guard()).toBe(false);
    await act(async () =>
      d.resolve({ url: "https://storage.example/md5(abcdef,2000000000)/users/a/private.pdf" }),
    );
    expect(m.links).not.toHaveBeenCalled();
  });
  it("preview GET runs only after explicit view press and cannot auto-open provider", async () => {
    m.media.mockResolvedValue({
      url: "https://files.example/md5(abcdef,2000000000)/users/a/thumb.webp",
    });
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("Показать превью");
    expect(m.media).not.toHaveBeenCalled();
    await act(async () => press("Показать превью")?.click());
    await vi.waitFor(() => expect(m.media).toHaveBeenCalledOnce());
    expect(m.media.mock.calls[0][3]).toBe("preview");
    expect(m.links).not.toHaveBeenCalled();
  });
  it("pending detail hides diagnosis even though list already contains it", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof row> }>();
    m.detail.mockReturnValueOnce(d.promise);
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("Загрузка посещения");
    expect(host.textContent).not.toContain("DIAGNOSIS_PRIVATE");
    await act(async () => d.resolve({ success: true, data: row() }));
    await shown("DIAGNOSIS_PRIVATE");
  });
});
