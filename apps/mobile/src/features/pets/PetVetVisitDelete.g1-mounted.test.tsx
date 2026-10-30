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
  del: vi.fn(),
  alert: vi.fn(),
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
    deleteResponse: (...args: unknown[]) => m.del(...args),
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
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
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
const clean = () => ({ ...row(), attachments: [] });
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
  // Wait for QueryClient notifications inside act, then inspect the settled tree.
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
  m.list.mockResolvedValue({ success: true, data: [clean()] });
  m.create.mockResolvedValue({ success: false, code: "NO_MOCK_SET" });
  m.edit.mockReset();
  m.del.mockReset();
  m.alert.mockReset();
  m.detail.mockReset();
  m.pickDoc.mockResolvedValue({ canceled: true });
  m.detail.mockResolvedValue({ success: true, data: clean() });
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

async function openDelete() {
  await render();
  await shown("THERAPY_PRIVATE");
  await act(async () => press("THERAPY_PRIVATE")?.click());
  await shown("DIAGNOSIS_PRIVATE");
}
async function prompt() {
  await act(async () => press("Удалить запись")?.click());
}
const answer = (label: string) => {
  const latest = m.alert.mock.calls.at(-1);
  const buttons = (latest?.[2] ?? []) as { text: string; onPress?: () => void }[];
  return buttons.find((b) => b.text === label)?.onPress;
};
function setupDelete() {
  m.detail
    .mockReset()
    .mockResolvedValueOnce({ success: true, data: clean() })
    .mockResolvedValueOnce({ success: true, data: clean() })
    .mockResolvedValueOnce({ success: false, code: "VET_VISIT_NOT_FOUND" });
  m.del.mockResolvedValue({ success: true });
}
describe("AG3 V46 actual mounted delete confirmation one-only", () => {
  it("no DELETE until explicit Alert confirm; one DELETE, GET owner 404", async () => {
    setupDelete();
    await openDelete();
    await prompt();
    expect(m.del).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledOnce();
    await act(async () => answer("Удалить")?.());
    await vi.waitFor(() => expect(m.detail).toHaveBeenCalledTimes(3));
    expect(m.del).toHaveBeenCalledExactlyOnceWith("pet1", "visit1", expect.any(Function));
    expect(m.alert.mock.calls[0][1]).not.toContain("все её вложения");
  });
  it("after exact 404 readback the refreshed owned list hides deleted medical card", async () => {
    setupDelete();
    let removed = false;
    m.list.mockImplementation(async () => ({ success: true, data: removed ? [] : [clean()] }));
    m.del.mockImplementation(async () => {
      removed = true;
      return { success: true };
    });
    await openDelete();
    await prompt();
    await act(async () => answer("Удалить")?.());
    await shown("Здесь будет история посещений");
    expect(host.textContent).not.toContain("DIAGNOSIS_PRIVATE");
    expect(m.del).toHaveBeenCalledOnce();
    expect(m.detail).toHaveBeenCalledTimes(3);
  });
  it("cancel/dismiss does not send DELETE; next confirmation allowed", async () => {
    setupDelete();
    await openDelete();
    await prompt();
    await act(async () => answer("Отмена")?.());
    expect(m.del).not.toHaveBeenCalled();
    await prompt();
    expect(m.alert).toHaveBeenCalledTimes(2);
    const dismiss = m.alert.mock.calls.at(-1)?.[3] as { onDismiss: () => void };
    await act(async () => dismiss.onDismiss());
    expect(m.del).not.toHaveBeenCalled();
  });
  it("two taps before Alert and double confirm callback issue only one DELETE", async () => {
    setupDelete();
    const deferred = delayed<{ success: boolean }>();
    m.del.mockReturnValueOnce(deferred.promise);
    await openDelete();
    await act(async () => {
      press("Удалить запись")?.click();
      press("Удалить запись")?.click();
    });
    expect(m.alert).toHaveBeenCalledOnce();
    await act(async () => {
      answer("Удалить")?.();
      answer("Удалить")?.();
    });
    await vi.waitFor(() => expect(m.del).toHaveBeenCalledOnce());
    await act(async () => deferred.resolve({ success: true }));
    expect(m.del).toHaveBeenCalledOnce();
  });
  it("logout and A→B→A while native Alert pending reject callback with zero requests", async () => {
    setupDelete();
    await openDelete();
    await prompt();
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => answer("Удалить")?.());
    expect(m.del).not.toHaveBeenCalled();
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("loss of DELETE ACK => UNKNOWN with disabled further delete; no second DELETE", async () => {
    setupDelete();
    m.del.mockRejectedValueOnce(new Error("PRIVATE_CLINICAL_URL_SECRET"));
    await openDelete();
    await prompt();
    await act(async () => answer("Удалить")?.());
    await shown("Результат удаления неизвестен");
    expect(press("Удалить запись")?.disabled).toBe(true);
    expect(m.del).toHaveBeenCalledOnce();
    expect(m.detail).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("PRIVATE_CLINICAL_URL_SECRET");
  });
  it("post-DELETE GET 500/200 or malformed not 404 => UNKNOWN lock", async () => {
    setupDelete();
    m.detail
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: clean() })
      .mockResolvedValueOnce({ success: true, data: clean() })
      .mockResolvedValueOnce({ success: false, code: "SERVER_ERROR" });
    await openDelete();
    await prompt();
    await act(async () => answer("Удалить")?.());
    await shown("Результат удаления неизвестен");
    expect(m.del).toHaveBeenCalledOnce();
    expect(press("Удалить запись")?.disabled).toBe(true);
  });
  it("an attached record never presents delete confirmation or invokes storage DELETE", async () => {
    m.list.mockResolvedValue({ success: true, data: [row()] });
    m.detail.mockResolvedValue({ success: true, data: row() });
    await openDelete();
    await prompt();
    await shown("Удаление посещений с вложениями требует отдельной проверки");
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.del).not.toHaveBeenCalled();
  });
  it("unmount before native confirm makes callback inert", async () => {
    setupDelete();
    await openDelete();
    await prompt();
    await act(async () => root.unmount());
    await act(async () => answer("Удалить")?.());
    expect(m.del).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
