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
  edit: vi.fn(),
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
    editResponse: (...args: unknown[]) => m.edit(...args),
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
  m.list.mockResolvedValue({ success: true, data: [row()] });
  m.create.mockResolvedValue({ success: false, code: "NO_MOCK_SET" });
  m.edit.mockReset();
  m.detail.mockReset();
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

async function openEdit() {
  await render();
  await shown("THERAPY_PRIVATE");
  await act(async () => press("THERAPY_PRIVATE")?.click());
  await shown("DIAGNOSIS_PRIVATE");
  await act(async () => press("Редактировать")?.click());
  await shown("Редактирование посещения");
}
async function setField(label: string, value: string) {
  await act(async () => m.fields[label]?.(value));
}
async function saveClick() {
  await act(async () => press("Сохранить")?.click());
}
const updated = () => ({ ...row(), diagnosis: "Изменённый диагноз" });
function reads() {
  let n = 0;
  m.detail.mockImplementation(async () => ({ success: true, data: ++n <= 2 ? row() : updated() }));
  m.edit.mockResolvedValue({ success: true, data: updated() });
}
describe("V45 actual mounted existing edit form full PUT", () => {
  it("one changed diagnosis retains all other fields and verifies two GETs", async () => {
    reads();
    await openEdit();
    await setField("Какой был диагноз", "Изменённый диагноз");
    await saveClick();
    expect(m.edit).toHaveBeenCalledOnce();
    expect(m.edit.mock.calls[0]).toEqual([
      "pet1",
      "visit1",
      {
        visitedOn: "2026-10-18",
        specialty: "THERAPY_PRIVATE",
        doctorName: "DOCTOR_PRIVATE",
        clinic: "CLINIC_PRIVATE",
        diagnosis: "Изменённый диагноз",
        conclusion: "CONCLUSION_PRIVATE",
        notes: "NOTE_PRIVATE",
      },
      expect.any(Function),
    ]);
    expect(m.uploads).not.toHaveBeenCalled();
    expect(m.media).not.toHaveBeenCalled();
  });
  it("doubletap preflight and PUT pending only performs one write", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof row> }>();
    reads();
    m.edit.mockReturnValueOnce(d.promise);
    await openEdit();
    await setField("Какой был диагноз", "Изменённый диагноз");
    await act(async () => {
      press("Сохранить")?.click();
      press("Сохранить")?.click();
    });
    await vi.waitFor(() => expect(m.edit).toHaveBeenCalledOnce());
    await act(async () => d.resolve({ success: true, data: updated() }));
    expect(m.edit).toHaveBeenCalledOnce();
  });
  it("structured validation rejection remains editable without UNKNOWN lock", async () => {
    reads();
    m.edit.mockResolvedValue({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { diagnosis: "OUT_OF_RANGE" } },
    });
    await openEdit();
    await setField("Какой был диагноз", "Изменённый диагноз");
    await saveClick();
    await shown("Проверьте длину и формат полей");
    expect(press("Сохранить")?.disabled).toBe(false);
    expect(m.edit).toHaveBeenCalledOnce();
  });
  it("ambiguous lost PUT ACK locks save, never repeats automatically", async () => {
    reads();
    m.edit.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DETAIL"));
    await openEdit();
    await setField("Какой был диагноз", "Изменённый диагноз");
    await saveClick();
    await shown("Результат изменения неизвестен");
    expect(press("Сохранить")?.disabled).toBe(true);
    expect(m.edit).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("PRIVATE_TRANSPORT_DETAIL");
  });
  it("A-B-A after pending edit avoids medical readback and stale UI", async () => {
    const d = delayed<{ success: boolean; data: ReturnType<typeof row> }>();
    reads();
    m.edit.mockReturnValueOnce(d.promise);
    await openEdit();
    await setField("Какой был диагноз", "Изменённый диагноз");
    await saveClick();
    await vi.waitFor(() => expect(m.edit).toHaveBeenCalledOnce());
    const guard = m.edit.mock.calls[0][3] as () => boolean;
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect(guard()).toBe(false);
    await act(async () => d.resolve({ success: true, data: updated() }));
    expect(host.textContent).not.toContain("Результат изменения неизвестен");
  });
  it("existing attachments cannot be removed or added by unapproved SDK", async () => {
    reads();
    await openEdit();
    await act(async () => press("Удалить")?.click());
    await shown("Удаление вложений требует отдельной проверки");
    expect(m.edit).not.toHaveBeenCalled();
    expect(m.uploads).not.toHaveBeenCalled();
    await act(async () => press("Выбрать фото")?.click());
    await shown("Загрузка вложений требует отдельной проверки");
    expect(m.pickDoc).not.toHaveBeenCalled();
  });
});
