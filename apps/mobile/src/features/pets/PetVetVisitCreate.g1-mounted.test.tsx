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
  create: vi.fn(),
  pickDoc: vi.fn(),
  fields: {} as Record<string, (value: string) => void>,
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
    createResponse: (...args: unknown[]) => m.create(...args),
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
vi.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => m.pickDoc(...args),
}));
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
    TextInput: (p: {
      accessibilityLabel?: string;
      onChangeText?: (value: string) => void;
      value?: string;
    }) => {
      if (p.accessibilityLabel && p.onChangeText) m.fields[p.accessibilityLabel] = p.onChangeText;
      return R.createElement("input", {
        "aria-label": p.accessibilityLabel,
        value: p.value ?? "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => p.onChangeText?.(e.target.value),
      });
    },
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
  m.fields = {};
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  m.owner = "A";
  m.epoch = "E1";
  m.username = "alice";
  m.logged = true;
  m.loading = false;
  m.list.mockResolvedValue({ success: true, data: [] });
  m.create.mockResolvedValue({ success: false, code: "NO_MOCK_SET" });
  m.pickDoc.mockResolvedValue({ canceled: true });
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
  vi.unstubAllGlobals();
});

const created = (changed?: Partial<ReturnType<typeof row>>) => ({
  ...row(),
  id: "created1",
  specialty: "Терапевт",
  doctorName: "",
  clinic: "",
  diagnosis: "",
  conclusion: "",
  notes: "",
  attachments: [],
  ...changed,
});
async function openCreate() {
  await render();
  await shown("Здесь будет история посещений");
  await act(async () => press("Добавить запись")?.click());
  await shown("Новое посещение");
}
async function setField(label: string, value: string) {
  await act(async () => m.fields[label]?.(value));
}
async function completedDraft() {
  await setField("Дата посещения, ДД.ММ.ГГГГ", "18.10.2026");
  await setField("Специальность врача", " Терапевт ");
}
async function saveClick() {
  await act(async () => press("Сохранить")?.click());
}
async function readySetup() {
  m.create.mockImplementation(async () => ({ success: true, data: created() }));
  m.detail.mockResolvedValue({ success: true, data: created() });
}
describe("AG3 V44 actual mounted create veterinary visit metadata-only", () => {
  it("form fields -> exactly one POST -> guarded detail GET, no upload; only changed fields", async () => {
    await readySetup();
    await openCreate();
    await completedDraft();
    await saveClick();
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.create.mock.calls[0]).toEqual([
      "pet1",
      { visitedOn: "2026-10-18", specialty: "Терапевт" },
      expect.any(Function),
    ]);
    expect(m.detail).toHaveBeenCalledWith("pet1", "created1", expect.any(Function));
    expect(m.uploads).not.toHaveBeenCalled();
    expect(m.media).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("NO_MOCK_SET");
  });
  it("filled optional clinic and diagnosis sent as changed-only fields in mounted form", async () => {
    m.create.mockResolvedValue({
      success: true,
      data: created({ clinic: "Клиника", diagnosis: "Заметка" }),
    });
    m.detail.mockResolvedValue({
      success: true,
      data: created({ clinic: "Клиника", diagnosis: "Заметка" }),
    });
    await openCreate();
    await completedDraft();
    await setField("Какая клиника", " Клиника ");
    await setField("Какой был диагноз", " Заметка ");
    await saveClick();
    expect(m.create).toHaveBeenCalledExactlyOnceWith(
      "pet1",
      {
        visitedOn: "2026-10-18",
        specialty: "Терапевт",
        clinic: "Клиника",
        diagnosis: "Заметка",
      },
      expect.any(Function),
    );
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("structured precommit validation allows manual correction, not auto-retry", async () => {
    m.create.mockResolvedValueOnce({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { specialty: "REQUIRED" } },
      error: "SECRET_PRIVATE",
    });
    await openCreate();
    await completedDraft();
    await saveClick();
    await shown("Проверьте специальность врача");
    expect(press("Сохранить")?.disabled).toBe(false);
    expect(host.textContent).not.toContain("SECRET_PRIVATE");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("server 400 with medical error text is UNKNOWN and never automatically repeated", async () => {
    m.create.mockResolvedValueOnce({
      success: false,
      code: "BAD_REQUEST",
      error: "secret diagnosis text",
    });
    await openCreate();
    await completedDraft();
    await saveClick();
    await shown("Результат сохранения неизвестен");
    expect(host.textContent).not.toContain("secret diagnosis text");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).not.toHaveBeenCalled();
    await saveClick();
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("sync doubletap while POST unresolved sends one write", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof created> }>();
    m.create.mockReturnValue(d.promise);
    m.detail.mockResolvedValue({ success: true, data: created() });
    await openCreate();
    await completedDraft();
    await act(async () => {
      press("Сохранить")?.click();
      press("Сохранить")?.click();
    });
    expect(m.create).toHaveBeenCalledOnce();
    await act(async () => d.resolve({ success: true, data: created() }));
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("lost POST ACK is UNKNOWN: retains form, disables second save, never retries/GET", async () => {
    m.create.mockRejectedValueOnce(new Error("SECRET_MEDICAL_PII_FROM_TRANSPORT"));
    await openCreate();
    await completedDraft();
    await saveClick();
    await shown("Результат сохранения неизвестен");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("SECRET_MEDICAL_PII_FROM_TRANSPORT");
    expect(press("Сохранить")?.disabled).toBe(true);
    await saveClick();
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("ACK without matching persisted detail remains UNKNOWN without second POST", async () => {
    m.create.mockResolvedValue({ success: true, data: created() });
    m.detail.mockResolvedValue({
      success: true,
      data: created({ diagnosis: "DIFFERENT_PRIVATE" }),
    });
    await openCreate();
    await completedDraft();
    await saveClick();
    await shown("Результат сохранения неизвестен");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("DIFFERENT_PRIVATE");
  });
  it("invalid date and non-1900 year never call API", async () => {
    await openCreate();
    await setField("Специальность врача", "Терапевт");
    await setField("Дата посещения, ДД.ММ.ГГГГ", "30.02.2026");
    await saveClick();
    await shown("Проверьте дату");
    expect(m.create).not.toHaveBeenCalled();
    await setField("Дата посещения, ДД.ММ.ГГГГ", "01.01.1899");
    await saveClick();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("unverified and A→B→A epoch during POST suppress late detail/readback", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof created> }>();
    m.create.mockReturnValue(d.promise);
    await openCreate();
    await completedDraft();
    await saveClick();
    const guard = m.create.mock.calls[0][2] as () => boolean;
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: created() }));
    expect(m.detail).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Результат сохранения неизвестен");
  });
  it("unmount pending create cannot update detached screen or start detail GET", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof created> }>();
    m.create.mockReturnValue(d.promise);
    await openCreate();
    await completedDraft();
    await saveClick();
    await act(async () => root.unmount());
    await act(async () => d.resolve({ success: true, data: created() }));
    expect(m.detail).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("medical attachment picker remains gated; only metadata POST is available", async () => {
    await openCreate();
    await completedDraft();
    await act(async () => press("Выбрать PDF или файл")?.click());
    await shown("Загрузка вложений требует отдельной проверки");
    expect(m.pickDoc).not.toHaveBeenCalled();
    expect(m.uploads).not.toHaveBeenCalled();
    expect(m.media).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
