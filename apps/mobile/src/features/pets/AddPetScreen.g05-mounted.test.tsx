// @vitest-environment jsdom
/** Mounts the actual AddPet route; only native widgets and outbound petsApi are mocked. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  ids: [
    "8ae52e9a-580f-4ab8-9545-397973bc32f5",
    "5639c98f-7140-4846-87f7-283a40ae1906",
    "f88080aa-69c8-412b-af68-4a442d6e696e",
  ],
  uuid: vi.fn(),
  create: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
  track: vi.fn(),
  success: vi.fn(),
  inputs: new Map<string, { onChangeText: (value: string) => void }>(),
  tourComplete: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: m.uuid }));
vi.mock("@/shared/lib/api/pets", () => ({ petsApi: { create: m.create } }));
vi.mock("@/shared/lib/api", () => ({ petsApi: { create: m.create } }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (value: { user: { id: string } }) => unknown) => selector({ user: { id: m.owner } }),
    { getState: () => ({ user: { id: m.owner } }) },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/config", () => ({
  COLORS: { background: "#fff", disabled: "#888" },
  FONTS: { montserrat: "sans", montserratMedium: "sans" },
  SPACING: { md: 8, sm: 4 },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const region =
    (tag: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement(tag, null, children);
  return {
    View: region("div"),
    ScrollView: region("div"),
    KeyboardAvoidingView: region("div"),
    TextInput: (props: {
      placeholder?: string;
      value?: string;
      onChangeText: (value: string) => void;
    }) => {
      if (props.placeholder) m.inputs.set(props.placeholder, props);
      return React.createElement("input", {
        "data-placeholder": props.placeholder,
        value: props.value,
        readOnly: true,
      });
    },
    StyleSheet: { create: (value: unknown) => value },
    Alert: { alert: m.alert },
    Platform: { OS: "ios" },
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
  useRouter: () => ({ back: m.back }),
  Stack: { Screen: () => null },
}));
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      React.createElement("button", { "data-label": "Назад", onClick: onPress }, "Назад"),
    PageHeader: ({ title }: { title: string }) => React.createElement("h1", null, title),
    TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
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
    }) => React.createElement("button", { "data-label": label, disabled, onClick: onPress }, label),
  };
});
vi.mock("@/features/onboarding-tour", () => ({
  useMobileOnboardingTourStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      isActive: false,
      currentStepId: null,
      isAwaitingRequiredPetCreation: false,
      completeRequiredPetCreation: m.tourComplete,
    }),
}));
vi.mock("@/features/pets", async () => {
  const actual = await import("./pet-form-validation");
  return { validatePetForm: actual.validatePetForm };
});
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: m.success, light: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/shared/lib/analytics", () => ({ trackEvent: m.track }));

import AddPetScreen from "../../../app/(main)/pets/add";
let root: Root;
let container: HTMLDivElement;
let query: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;
let unmounted: boolean;
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll("button")).find(
    (el) => el.getAttribute("data-label") === label,
  );
  if (!found) throw new Error(`Missing button ${label}; available: ${container.textContent}`);
  return found as HTMLButtonElement;
};
const press = async (label: string) =>
  act(async () => {
    button(label).click();
  });
const fill = async (placeholder: string, value: string) =>
  act(async () => {
    const input = m.inputs.get(placeholder);
    if (!input) throw Error(`Missing input ${placeholder}`);
    input.onChangeText(value);
  });
const fillForm = async () => {
  await fill("Кличка", "  Бим  ");
  await fill("Порода", "  Корги  ");
  await fill("ДД.ММ.ГГГГ", "29.02.2020");
  await fill("Необязательно, 0.1–200 кг", "4,25");
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function renderScreen() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: query }, createElement(AddPetScreen))),
  );
}
async function unmountScreen() {
  if (!unmounted) {
    await act(async () => root.unmount());
    unmounted = true;
  }
}

describe("G05 fully mounted standard AddPet route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    m.create.mockReset();
    m.uuid.mockReset();
    vi.stubGlobal("__DEV__", false);
    m.owner = "A";
    m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
    m.inputs.clear();
    const ids = [...m.ids];
    m.uuid.mockImplementation(() => ids.shift());
    m.success.mockResolvedValue(undefined);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    unmounted = false;
    query = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    invalidate = vi.spyOn(query, "invalidateQueries").mockResolvedValue(undefined);
    await renderScreen();
  });
  afterEach(async () => {
    await unmountScreen();
    query.clear();
    container.remove();
    vi.unstubAllGlobals();
  });
  it("validates actual inputs, normalizes UTC DOB/weight, retains exact original JSON on manual uncertain retry", async () => {
    await press("Добавить");
    expect(m.create).not.toHaveBeenCalled();
    await fillForm();
    m.create
      .mockResolvedValueOnce({ success: false, code: "PET_CREATE_RESULT_UNCONFIRMED" })
      .mockResolvedValueOnce({ success: true, data: { id: "pet-A", ownerId: "A" } });
    await press("Добавить");
    expect(m.create).toHaveBeenCalledTimes(1);
    const first = m.create.mock.calls[0][0];
    expect(first).toMatchObject({
      name: "Бим",
      breed: "Корги",
      birthDate: "2020-02-29",
      weightKg: 4.25,
      clientRequestId: m.ids[0],
    });
    expect(container.textContent).toContain("Результат создания не подтверждён");
    expect(invalidate).not.toHaveBeenCalled();
    await fill("Кличка", "Изменённое имя");
    await press("Повторить создание");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[1][0]).toEqual(first);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(m.back).toHaveBeenCalledTimes(1);
  });
  it("retries the frozen operation after form edits become invalid, without changing JSON/UUID", async () => {
    await fillForm();
    m.create
      .mockResolvedValueOnce({ success: false, code: "PET_CREATE_RESULT_UNCONFIRMED" })
      .mockResolvedValueOnce({ success: true, data: { id: "pet-A", ownerId: "A" } });
    await press("Добавить");
    expect(m.create).toHaveBeenCalledTimes(1);
    await fill("ДД.ММ.ГГГГ", "wrong date");
    await fill("Необязательно, 0.1–200 кг", "300");
    await press("Повторить создание");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[1][0]).toEqual(m.create.mock.calls[0][0]);
  });
  it("ignores late transport failure after Back before native route unmounts", async () => {
    await fillForm();
    const pending = deferred<{ success: boolean; code: string }>();
    m.create.mockImplementationOnce(() => pending.promise);
    await press("Добавить");
    await press("Назад");
    expect(m.back).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ success: false, code: "NETWORK_ERROR" });
      await pending.promise;
    });
    expect(m.alert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(m.back).toHaveBeenCalledTimes(1);
  });
  it("does not navigate, invalidate another owner's cache, or alert on late success after logout", async () => {
    await fillForm();
    const pending = deferred<{ success: boolean; data: { id: string; ownerId: string } }>();
    m.create.mockImplementationOnce(() => pending.promise);
    await press("Добавить");
    expect(m.create).toHaveBeenCalledTimes(1);
    m.owner = "B";
    m.epoch = "d8f37921-b880-4b04-ae14-96c2e749b029";
    await act(async () => {
      pending.resolve({ success: true, data: { id: "pet-A", ownerId: "A" } });
      await pending.promise;
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.tourComplete).not.toHaveBeenCalled();
  });
  it("blocks late success after same-owner authEpoch rotation without touching cache or navigation", async () => {
    await fillForm();
    const pending = deferred<{ success: boolean; data: { id: string; ownerId: string } }>();
    m.create.mockImplementationOnce(() => pending.promise);
    await press("Добавить");
    expect(m.create).toHaveBeenCalledTimes(1);
    m.epoch = "d8f37921-b880-4b04-ae14-96c2e749b029";
    await act(async () => {
      pending.resolve({ success: true, data: { id: "pet-A", ownerId: "A" } });
      await pending.promise;
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("ignores late transport errors after component unmount", async () => {
    await fillForm();
    const pending = deferred<{ success: boolean; code: string }>();
    m.create.mockImplementationOnce(() => pending.promise);
    await press("Добавить");
    await unmountScreen();
    await act(async () => {
      pending.resolve({ success: false, code: "NETWORK_ERROR" });
      await pending.promise;
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("discards late successful response after screen unmount, without cache/navigation/alert side-effects", async () => {
    await fillForm();
    const pending = deferred<{ success: boolean; data: { id: string; ownerId: string } }>();
    m.create.mockImplementationOnce(() => pending.promise);
    await press("Добавить");
    await unmountScreen();
    await act(async () => {
      pending.resolve({ success: true, data: { id: "pet-A", ownerId: "A" } });
      await pending.promise;
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });
});
