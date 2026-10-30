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
  m.pet.mockResolvedValue({
    success: true,
    data: { id: "pet1", ownerId: "A", name: "PetPrivate" },
  });
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

describe("AG3 V100 actual mounted vet history/cache read-only projection", () => {
  it("same pet A→B→A E2 after successful A/E1 and B reads never reuses old private history", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    m.owner = "B";
    m.epoch = "B1";
    m.list.mockResolvedValueOnce({
      success: true,
      data: [{ ...row(), ownerId: "B", specialty: "B_PRIVATE_CURRENT" }],
    });
    await render();
    await shown("B_PRIVATE_CURRENT");
    expect(host.textContent).not.toContain("THERAPY_PRIVATE");
    m.owner = "A";
    m.epoch = "E2";
    m.list.mockResolvedValueOnce({ success: true, data: [] });
    await render();
    await shown("Здесь будет история посещений");
    expect(host.textContent).not.toContain("B_PRIVATE_CURRENT");
    expect(host.textContent).not.toContain("THERAPY_PRIVATE");
    expect(m.list.mock.calls.filter((c) => c[0] === "pet1")).toHaveLength(3);
    const cacheKeys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey.join("/"));
    expect(cacheKeys).toContain("pet-vet-visits/owner/A/E2/pet1");
  });
  it("unmount pending private list GET: late foreign response cannot paint or open details", async () => {
    type ScopedRow = ReturnType<typeof row> & { ownerId?: string };
    let done!: (value: { success: boolean; data: ScopedRow[] }) => void;
    const promise = new Promise<{ success: boolean; data: ScopedRow[] }>((yes) => {
      done = yes;
    });
    m.list.mockReturnValueOnce(promise);
    await render();
    await shown("Загрузка посещений");
    await act(async () => root.unmount());
    await act(async () =>
      done({
        success: true,
        data: [{ ...row(), ownerId: "B", specialty: "LATE_FOREIGN_AFTER_UNMOUNT" }],
      }),
    );
    expect(host.textContent).not.toContain("LATE_FOREIGN_AFTER_UNMOUNT");
    expect(m.detail).not.toHaveBeenCalled();
    expect(m.media).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("foreign cached ready row WITHOUT ownerId and provenance cannot masquerade as own medical visit", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () =>
      client.setQueryData(["pet-vet-visits", "owner", "A", "E1", "pet1"], {
        kind: "ready",
        data: [{ ...row(), specialty: "UNMARKED_FOREIGN_MEDICAL" }],
      }),
    );
    expect(host.textContent).not.toContain("UNMARKED_FOREIGN_MEDICAL");
    expect(host.textContent).not.toContain("Здесь будет история посещений");
  });
  it("foreign owner ready-cache row injected AFTER authoritative list GET must not render private specialty", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => {
      client.setQueryData(["pet-vet-visits", "owner", "A", "E1", "pet1"], {
        kind: "ready",
        data: [{ ...row(), ownerId: "B", specialty: "FOREIGN_PRIVATE_MEDICAL" }],
      });
    });
    expect(host.textContent).not.toContain("FOREIGN_PRIVATE_MEDICAL");
    expect(host.textContent).not.toContain("DIAGNOSIS_PRIVATE");
    expect(m.media).not.toHaveBeenCalled();
  });
  it("foreign private pet title in exact actor-keyed query cache must not render in medical header", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await shown("PetPrivate");
    await act(async () => {
      client.setQueryData(["vet-pet-title", "owner", "A", "E1", "pet1"], {
        name: "FOREIGN_PRIVATE_PET_TITLE",
        petId: "pet2",
        ownerId: "B",
        authEpoch: "B1",
      });
    });
    expect(host.textContent).not.toContain("FOREIGN_PRIVATE_PET_TITLE");
    expect(host.textContent).toContain("PetPrivate");
  });
  it("foreign pet owner returned by backend cannot become the medical header", async () => {
    m.pet.mockResolvedValueOnce({
      success: true,
      data: { id: "pet1", ownerId: "B", name: "FOREIGN_HTTP_PET_TITLE" },
    });
    await render();
    await shown("THERAPY_PRIVATE");
    expect(host.textContent).not.toContain("FOREIGN_HTTP_PET_TITLE");
    expect(host.textContent).toContain("Посещения врача");
  });
  it("wrong auth epoch in exact owner cache key cannot replace the verified pet title", async () => {
    await render();
    await shown("PetPrivate");
    await act(async () => {
      client.setQueryData(["vet-pet-title", "owner", "A", "E1", "pet1"], {
        name: "STALE_PRIVATE_PET_TITLE",
        petId: "pet1",
        ownerId: "A",
        authEpoch: "E0",
      });
    });
    expect(host.textContent).not.toContain("STALE_PRIVATE_PET_TITLE");
    expect(host.textContent).toContain("PetPrivate");
  });
  it("backend-style 200 owner-mismatched visit is read error, never own empty or private specialty", async () => {
    m.list.mockResolvedValueOnce({
      success: true,
      data: [{ ...row(), ownerId: "B", specialty: "HTTP_FOREIGN_PRIVATE" }],
    });
    await render();
    await shown("Не удалось загрузить историю посещений");
    expect(host.textContent).not.toContain("HTTP_FOREIGN_PRIVATE");
    expect(host.textContent).not.toContain("Здесь будет история посещений");
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("legitimate own ownerId field accepted while response is strictly projected before UI", async () => {
    m.list.mockResolvedValueOnce({
      success: true,
      data: [{ ...row(), ownerId: "A", secretStorageKey: "SHOULD_NOT_SHOW" }],
    });
    await render();
    await shown("THERAPY_PRIVATE");
    expect(host.textContent).not.toContain("SHOULD_NOT_SHOW");
    expect(m.list).toHaveBeenCalledWith("pet1", expect.any(Function));
  });
  it("foreign pet cached row injected after focused own GET must not render, even when signed owner matches", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => {
      client.setQueryData(["pet-vet-visits", "owner", "A", "E1", "pet1"], {
        kind: "ready",
        data: [{ ...row(), petId: "pet2", specialty: "WRONGPET_PRIVATE_MEDICAL" }],
      });
    });
    expect(host.textContent).not.toContain("WRONGPET_PRIVATE_MEDICAL");
  });
  it("detail cache injection after one verified expansion must not reveal foreign private diagnosis", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => press("THERAPY_PRIVATE")?.click());
    await shown("DIAGNOSIS_PRIVATE");
    await act(async () => {
      client.setQueryData(["pet-vet-detail", "owner", "A", "E1", "pet1", "visit1"], {
        kind: "ready",
        data: { ...row(), ownerId: "B", diagnosis: "FOREIGN_CACHE_DIAGNOSIS" },
      });
    });
    expect(host.textContent).not.toContain("FOREIGN_CACHE_DIAGNOSIS");
    expect(m.media).not.toHaveBeenCalled();
    expect(m.links).not.toHaveBeenCalled();
  });
  it("malformed cached ready success is treated as error, not empty/history or private text", async () => {
    await render();
    await shown("THERAPY_PRIVATE");
    await act(async () => {
      client.setQueryData(["pet-vet-visits", "owner", "A", "E1", "pet1"], {
        kind: "ready",
        data: [{ ...row(), visitedOn: "2026-02-31", specialty: "MALFORMED_PRIVATE" }],
      });
    });
    expect(host.textContent).not.toContain("MALFORMED_PRIVATE");
    expect(host.textContent).not.toContain("Здесь будет история посещений");
  });
});
