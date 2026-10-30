// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
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
        user: { id: string };
        isAuthenticated: boolean;
        isLoading: boolean;
      }) => unknown,
    ) => select({ user: { id: m.owner }, isAuthenticated: true, isLoading: false }),
    { getState: () => ({ user: { id: m.owner }, isAuthenticated: true, isLoading: false }) },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
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
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: qc }, createElement(EditPetScreen))),
  );
  await flush();
  await vi.waitFor(() => expect(m.inputs.has("Кличка")).toBe(true));
  await flush();
}
function button(label: string) {
  const b = Array.from(host.querySelectorAll("button")).find(
    (el) => el.getAttribute("data-label") === label,
  );
  if (!b) throw new Error("Missing button " + label + ": " + host.textContent);
  return b as HTMLButtonElement;
}
async function press(label: string) {
  await act(async () => button(label).click());
  await flush();
}
async function fill(placeholder: string, v: string) {
  await act(async () => {
    const input = m.inputs.get(placeholder);
    if (!input) throw Error("Missing input " + placeholder);
    input.onChangeText(v);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
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
describe("AG3-PROFILE-031 actual mounted PetEdit ordinary handler", () => {
  it("changed name only: guarded partial PUT and exact GET readback before back", async () => {
    await mount();
    await fill("Кличка", "  Бимка ");
    const wait = deferred<{ success: boolean; data: typeof pet }>();
    m.update.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    const [id, patch, guard] = m.update.mock.calls[0];
    expect(id).toBe("pet-A");
    expect(patch).toEqual({ name: "Бимка" });
    expect(guard()).toBe(true);
    expect(m.back).not.toHaveBeenCalled();
    pet.name = "Бимка";
    await act(async () => wait.resolve({ success: true, data: { ...pet } }));
    await flush();
    await vi.waitFor(() => expect(m.back).toHaveBeenCalledOnce());
    expect(m.read.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it("doubletap before React re-render dispatches single PUT", async () => {
    await mount();
    await fill("Кличка", "Другое");
    const wait = deferred<{ success: boolean; data: typeof pet }>();
    m.update.mockReturnValueOnce(wait.promise);
    const btn = button("Сохранить");
    await act(async () => {
      btn.click();
      btn.click();
    });
    await flush();
    expect(m.update).toHaveBeenCalledOnce();
    pet.name = "Другое";
    await act(async () => wait.resolve({ success: true, data: { ...pet } }));
    await flush();
  });
  it("invalid date is client validation and no PUT", async () => {
    await mount();
    await fill("ДД.ММ.ГГГГ", "31.02.2022");
    await press("Сохранить");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("no edits does not send PUT", async () => {
    await mount();
    await press("Сохранить");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.back).toHaveBeenCalledOnce();
  });
  it("server 400 validation error blocks back, shows rejected status", async () => {
    await mount();
    await fill("Кличка", "Другое");
    m.update.mockResolvedValueOnce({
      success: false,
      code: "VALIDATION_ERROR",
      error: "Некорректное поле",
    });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте введённые данные"));
    expect(m.update).toHaveBeenCalledOnce();
    expect(m.back).not.toHaveBeenCalled();
  });
  it("lost ACK timeout is UNKNOWN and disables duplicate PUT", async () => {
    await mount();
    await fill("Кличка", "Другое");
    m.update.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(button("Сохранить").disabled).toBe(true);
    expect(m.update).toHaveBeenCalledOnce();
  });
  it("positive ACK with old readback cannot claim success", async () => {
    await mount();
    await fill("Кличка", "Другое");
    m.update.mockResolvedValueOnce({ success: true, data: { ...pet, name: "Другое" } });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(m.back).not.toHaveBeenCalled();
  });
  it("A->B->A new epoch during PUT: no GET or back callback", async () => {
    await mount();
    await fill("Кличка", "Другое");
    const wait = deferred<{ success: boolean; data: typeof pet }>();
    m.update.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    const guard = m.update.mock.calls[0][2] as () => boolean;
    m.owner = "B";
    m.epoch = "B-E1";
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client: qc }, createElement(EditPetScreen))),
    );
    m.owner = "A";
    m.epoch = "A-E2";
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client: qc }, createElement(EditPetScreen))),
    );
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    const calls = m.read.mock.calls.length;
    expect(guard()).toBe(false);
    await act(async () => wait.resolve({ success: true, data: { ...pet, name: "Другое" } }));
    await flush();
    expect(m.read).toHaveBeenCalledTimes(calls);
    expect(m.back).not.toHaveBeenCalled();
  });
  it("unmount during delayed PUT blocks old callback", async () => {
    await mount();
    await fill("Кличка", "Другое");
    const wait = deferred<{ success: boolean; data: typeof pet }>();
    m.update.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ success: true, data: { ...pet, name: "Другое" } }));
    expect(m.back).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("existing height clear sends only explicit JSON null; closes after exact GET null", async () => {
    await mount();
    await fill("pet-edit-heightCm", "");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    expect(m.update.mock.calls[0][1]).toEqual({ heightCm: null });
    await vi.waitFor(() => expect(m.back).toHaveBeenCalledOnce());
    expect(pet.heightCm).toBeNull();
    expect(m.read).toHaveBeenCalledTimes(2);
  });
  it("all four nullable measurements are cleared together with no weight PUT", async () => {
    pet.neckGirthCm = 31;
    pet.muzzleGirthCm = 22;
    pet.bellyGirthCm = 44;
    await mount();
    for (const field of ["heightCm", "neckGirthCm", "muzzleGirthCm", "bellyGirthCm"])
      await fill(`pet-edit-${field}`, "");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    expect(m.update.mock.calls[0][1]).toEqual({
      heightCm: null,
      neckGirthCm: null,
      muzzleGirthCm: null,
      bellyGirthCm: null,
    });
    await vi.waitFor(() => expect(m.back).toHaveBeenCalledOnce());
    expect(pet.weightKg).toBeNull();
  });
  it("server PET_VALIDATION_ERROR uses stable fieldErrors on relevant form input", async () => {
    await mount();
    await fill("pet-edit-heightCm", "55");
    m.update.mockResolvedValueOnce({
      success: false,
      code: "PET_VALIDATION_ERROR",
      details: { fieldErrors: { heightCm: "OUT_OF_RANGE" } },
      error: "private raw values",
    });
    await press("Сохранить");
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Значение выходит за допустимые пределы"),
    );
    expect(host.textContent).not.toContain("private raw values");
    expect(m.back).not.toHaveBeenCalled();
  });
  it("PET_NOT_FOUND with another-owner code never navigates", async () => {
    await mount();
    await fill("Кличка", "Другое");
    m.update.mockResolvedValueOnce({
      success: false,
      code: "PET_NOT_FOUND",
      error: "private owner",
    });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте введённые данные"));
    expect(host.textContent).not.toContain("private owner");
    expect(m.back).not.toHaveBeenCalled();
  });
  it("positive PUT ACK but GET returns pre-clear height is terminal UNKNOWN", async () => {
    await mount();
    await fill("pet-edit-heightCm", "");
    m.update.mockResolvedValueOnce({ success: true, data: { ...pet, heightCm: null } });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(m.back).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledOnce();
  });
  it("explicit notes clearing sends empty string, not undefined", async () => {
    await mount();
    await fill("Заметки о питомце", "");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    expect(m.update.mock.calls[0][1]).toEqual({ notes: "" });
  });
});
