// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authenticated: true,
  petId: "pet-A",
  back: vi.fn(),
  alert: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  inputs: new Map<string, { onChangeText: (v: string) => void }>(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (
      select: (s: {
        user: { id: string } | null;
        isAuthenticated: boolean;
        isLoading: boolean;
      }) => unknown,
    ) =>
      select({
        user: m.authenticated ? { id: m.owner } : null,
        isAuthenticated: m.authenticated,
        isLoading: false,
      }),
    {
      getState: () => ({
        user: m.authenticated ? { id: m.owner } : null,
        isAuthenticated: m.authenticated,
        isLoading: false,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.authenticated ? { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/api", () => ({
  parsePetKind: (v: string) => (v === "CAT" ? "CAT" : "DOG"),
  petsApi: { getById: m.read, update: m.update },
}));
vi.mock("@/shared/config", () => ({
  BORDER_RADIUS: { md: 6 },
  COLORS: { disabled: "#aaa", background: "#fff", error: "#f00" },
  FONTS: { impact: "sans", montserrat: "sans", montserratMedium: "sans" },
  SPACING: { md: 8, sm: 4, xs: 2, xl: 16 },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const dom =
    (tag: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement(tag, null, children);
  return {
    View: dom("div"),
    ScrollView: dom("div"),
    KeyboardAvoidingView: dom("div"),
    TextInput: (p: {
      testID?: string;
      placeholder?: string;
      onChangeText: (v: string) => void;
      value?: string;
    }) => {
      if (p.placeholder && !m.inputs.has(p.placeholder)) m.inputs.set(p.placeholder, p);
      if (p.testID) m.inputs.set(p.testID, p);
      return React.createElement("input", {
        "data-placeholder": p.placeholder,
        value: p.value,
        readOnly: true,
      });
    },
    StyleSheet: { create: (x: unknown) => x },
    Platform: { OS: "ios" },
    Alert: { alert: m.alert },
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: m.back }),
  useLocalSearchParams: () => ({ id: m.petId }),
}));
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      React.createElement("button", { onClick: onPress }, "Назад"),
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => React.createElement("button", { "data-label": label, onClick: onPress, disabled }, label),
    Loading: () => React.createElement("span", null, "Загрузка"),
  };
});
vi.mock("@/features/pets", async () => {
  const real = await import("./pet-form-validation");
  return { validatePetForm: real.validatePetForm };
});
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: m.success, light: vi.fn(), selection: vi.fn() },
}));
import EditPetScreen from "../../../app/(main)/pets/edit/[id]";
const baseline = () => ({
  id: m.petId,
  ownerId: m.owner,
  name: "Бим",
  type: "DOG",
  breed: "Корги",
  birthDate: "2020-02-29",
  heightCm: 50,
  weightKg: null as number | null,
  neckGirthCm: null as number | null,
  muzzleGirthCm: null as number | null,
  bellyGirthCm: null as number | null,
  photoUrl: "private-photo",
  showInProfile: true,
  notes: "старое",
  createdAt: "2020-03-01",
});
let pet: ReturnType<typeof baseline>;
let root: Root;
let host: HTMLDivElement;
let qc: QueryClient;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.authenticated = true;
  m.petId = "pet-A";
  m.inputs.clear();
  pet = baseline();
  m.read.mockImplementation(async (_id: string, guard: () => boolean) => ({
    success: guard(),
    data: { ...pet },
  }));
  m.update.mockImplementation(
    async (_id: string, patch: Record<string, unknown>, guard: () => boolean) => {
      if (!guard()) return { success: false, code: "G05_SESSION_CHANGED" };
      Object.assign(pet, patch);
      return { success: true, data: { ...pet } };
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  qc = new QueryClient({
    // A->B->A mutation tests must not count unrelated observer refetches
    // while verifying the explicit server ACK -> guarded GET readback.
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  host.remove();
  vi.unstubAllGlobals();
});

async function renderRead() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: qc }, createElement(EditPetScreen))),
  );
  await flush();
}
async function expectName(value: string) {
  await vi.waitFor(() =>
    expect(host.querySelector<HTMLInputElement>('input[data-placeholder="Кличка"]')?.value).toBe(
      value,
    ),
  );
}
const raw = (id: string, ownerId: string, name: string, type: string = "DOG") => ({
  ...baseline(),
  id,
  ownerId,
  name,
  type,
  createdAt: "2026-10-21T12:00:00.000Z",
});

describe("AG3 V96 actual mounted existing Pet detail GET on edit-route (READ ONLY)", () => {
  it("guest sees login/not found barrier and never calls petsApi.getById", async () => {
    m.authenticated = false;
    await renderRead();
    expect(m.read).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("старое");
    expect(host.textContent).not.toContain("Бим");
  });
  it("own DOG and CAT GET exactly requested petId with verified epoch guard", async () => {
    m.read.mockResolvedValueOnce({ success: true, data: raw("pet-A", "A", "Бим", "CAT") });
    await renderRead();
    expect(m.read.mock.calls[0][0]).toBe("pet-A");
    expect(typeof m.read.mock.calls[0][1]).toBe("function");
    expect(m.read.mock.calls[0][1]()).toBe(true);
    await expectName("Бим");
    expect(host.textContent).not.toContain("Питомец не найден");
  });
  it("same owner petId X→Y→X never uses delayed response for old X; scoped cache only", async () => {
    const old = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.petId = "pet-X";
    m.read
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ success: true, data: raw("pet-Y", "A", "Йорк") })
      .mockResolvedValueOnce({ success: true, data: raw("pet-X", "A", "Новый Бим") });
    await renderRead();
    expect(m.read).toHaveBeenCalledTimes(1);
    m.petId = "pet-Y";
    await renderRead();
    await expectName("Йорк");
    m.petId = "pet-X";
    await renderRead();
    await act(async () => old.resolve({ success: true, data: raw("pet-X", "A", "PRIVATE_OLD_X") }));
    await expectName("Новый Бим");
    expect(host.textContent).not.toContain("PRIVATE_OLD_X");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("loaded X→Y→X does not show previously cached X while fresh GET awaits", async () => {
    const current = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.petId = "pet-X";
    m.read
      .mockResolvedValueOnce({ success: true, data: raw("pet-X", "A", "Кэш X") })
      .mockResolvedValueOnce({ success: true, data: raw("pet-Y", "A", "Текущий Y") })
      .mockReturnValueOnce(current.promise);
    await renderRead();
    await expectName("Кэш X");
    m.petId = "pet-Y";
    await renderRead();
    await expectName("Текущий Y");
    m.petId = "pet-X";
    await renderRead();
    expect(host.textContent).not.toContain("Кэш X");
    expect(
      host.querySelector<HTMLInputElement>('input[data-placeholder="Кличка"]')?.value,
    ).not.toBe("Кэш X");
    await act(async () => current.resolve({ success: true, data: raw("pet-X", "A", "Свежее X") }));
    await expectName("Свежее X");
    expect(m.read).toHaveBeenCalledTimes(3);
  });
  it("A→B→A E2 while old A E1 GET pending never renders prior private pet", async () => {
    const old = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.read
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ success: true, data: raw("pet-A", "B", "Б pet") })
      .mockResolvedValueOnce({ success: true, data: raw("pet-A", "A", "А E2") });
    await renderRead();
    m.owner = "B";
    m.epoch = "B1";
    await renderRead();
    m.owner = "A";
    m.epoch = "E2";
    await renderRead();
    await act(async () => old.resolve({ success: true, data: raw("pet-A", "A", "PRIVATE_E1") }));
    await expectName("А E2");
    expect(host.textContent).not.toContain("PRIVATE_E1");
  });
  it("foreign shared pet-cache snapshot is never shown before fresh GET", async () => {
    const gate = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.read.mockReturnValueOnce(gate.promise);
    qc.setQueryData(["pet", "pet-A", "A", "E1"], raw("pet-A", "B", "PRIVATE_CACHE_FOREIGN"));
    await renderRead();
    expect(host.textContent).not.toContain("PRIVATE_CACHE_FOREIGN");
    expect(
      host.querySelector<HTMLInputElement>('input[data-placeholder="Кличка"]')?.value,
    ).not.toBe("PRIVATE_CACHE_FOREIGN");
    await act(async () => gate.resolve({ success: true, data: raw("pet-A", "A", "Свежий Бим") }));
    await expectName("Свежий Бим");
    expect(m.read).toHaveBeenCalledOnce();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("malformed cached 200 object is not rendered while fresh owner GET pending", async () => {
    const gate = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.read.mockReturnValueOnce(gate.promise);
    qc.setQueryData(["pet", "pet-A", "A", "E1"], {
      id: "pet-A",
      ownerId: "A",
      name: "PRIVATE_MALFORMED_CACHE",
      type: "HORSE",
    });
    await renderRead();
    expect(host.textContent).not.toContain("PRIVATE_MALFORMED_CACHE");
    expect(
      host.querySelector<HTMLInputElement>('input[data-placeholder="Кличка"]')?.value,
    ).not.toBe("PRIVATE_MALFORMED_CACHE");
    await act(async () =>
      gate.resolve({ success: true, data: raw("pet-A", "A", "Фактический DOG") }),
    );
    await expectName("Фактический DOG");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("foreign owner success200 with matching id fails closed, not visible", async () => {
    m.read.mockResolvedValueOnce({ success: true, data: raw("pet-A", "B", "PRIVATE_FOREIGN") });
    await renderRead();
    expect(host.textContent).not.toContain("PRIVATE_FOREIGN");
    expect(host.textContent).not.toContain("старое");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить питомца"));
  });
  it("private foreign404 is a not-found state, not empty loaded form", async () => {
    m.read.mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "secret backend" });
    await renderRead();
    await vi.waitFor(() => expect(host.textContent).toContain("Питомец не найден"));
    expect(host.textContent).not.toContain("secret backend");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("existing actual Hono 404 envelope (without code) remains not-found and never echoes server error", async () => {
    m.read.mockResolvedValueOnce({ success: false, error: "Питомец не найден" });
    await renderRead();
    await vi.waitFor(() => expect(host.textContent).toContain("Питомец не найден"));
    expect(host.textContent).not.toContain("Не удалось загрузить питомца");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("success200 data:null is invalid read, not an empty or a 404", async () => {
    m.read.mockResolvedValueOnce({ success: true, data: null });
    await renderRead();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить питомца"));
    expect(host.textContent).not.toContain("Питомец не найден");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("malformed200 with required fields absent does not become success or not-found", async () => {
    m.read.mockResolvedValueOnce({
      success: true,
      data: { id: "pet-A", name: "PRIVATE_MALFORMED" },
    });
    await renderRead();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить питомца"));
    expect(host.textContent).not.toContain("PRIVATE_MALFORMED");
    expect(host.textContent).not.toContain("Питомец не найден");
  });
  it("500/UNKNOWN returns safe read error and explicit retry (not empty404)", async () => {
    m.read
      .mockResolvedValueOnce({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        error: "SECRET_PROVIDER",
      })
      .mockResolvedValueOnce({ success: true, data: raw("pet-A", "A", "После повтора") });
    await renderRead();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить питомца"));
    expect(host.textContent).not.toContain("SECRET_PROVIDER");
    expect(host.textContent).not.toContain("Питомец не найден");
    const b = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Повторить"),
    );
    expect(b).toBeDefined();
    await act(async () => b?.click());
    await expectName("После повтора");
    expect(m.read).toHaveBeenCalledTimes(2);
  });
  it("unmount while GET pending fences late callback and no subsequent mutation", async () => {
    const old = deferred<{ success: boolean; data: ReturnType<typeof raw> }>();
    m.read.mockReturnValueOnce(old.promise);
    await renderRead();
    await act(async () => root.unmount());
    await act(async () =>
      old.resolve({ success: true, data: raw("pet-A", "A", "PRIVATE_UNMOUNT") }),
    );
    expect(host.textContent).not.toContain("PRIVATE_UNMOUNT");
    expect(m.update).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
