// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  loading: false,
  get: vi.fn(),
  put: vi.fn(),
  updated: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  inputs: new Map<string, { onChangeText: (v: string) => void }>(),
}));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (
      select: (s: {
        user: { id: string };
        isAuthenticated: boolean;
        isLoading: boolean;
        setUserProfile: typeof m.updated;
      }) => unknown,
    ) =>
      select({
        user: { id: m.owner },
        isAuthenticated: m.authed,
        isLoading: m.loading,
        setUserProfile: m.updated,
      }),
    {
      getState: () => ({ user: { id: m.owner }, isAuthenticated: m.authed, isLoading: m.loading }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api", () => ({ userApi: { getProfile: m.get, updateProfile: m.put } }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
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
    TextInput: (p: { placeholder?: string; onChangeText: (v: string) => void; value?: string }) => {
      if (p.placeholder && !m.inputs.has(p.placeholder)) m.inputs.set(p.placeholder, p);
      return React.createElement("input", {
        "data-placeholder": p.placeholder,
        value: p.value,
        readOnly: true,
      });
    },
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: "ios" },
  };
});
vi.mock("react-native-paper", async () => {
  const React = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", null, children),
    Snackbar: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? React.createElement("aside", null, children) : null,
  };
});
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: m.back, replace: m.replace, canGoBack: () => true }),
}));
vi.mock("@/shared/components", async () => {
  const React = await import("react");
  return {
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      React.createElement("button", { "data-label": "Назад", onClick: onPress }, "Назад"),
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
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: m.success, light: vi.fn() },
}));
import EditProfileScreen from "../../../app/(main)/profile/edit";
const baseProfile = () => ({
  fullName: "Анна",
  city: "Самара",
  about: "О себе",
  telegram: "anna123",
  instagram: "",
  website: "",
  birthDate: "1990-05-10T00:00:00.000Z",
  avatarUrl: "private",
});
const user = () => ({ id: m.owner, username: "anna", role: "USER", profile: { ...saved } });
let saved: ReturnType<typeof baseProfile>;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(EditProfileScreen))),
  );
  await vi.waitFor(() => expect(m.inputs.has("Имя и фамилия")).toBe(true));
  await flush();
}
function button(label: string) {
  const b = Array.from(host.querySelectorAll("button")).find(
    (el) => el.getAttribute("data-label") === label,
  );
  if (!b) throw new Error("MISSING BUTTON " + label + " " + host.textContent);
  return b as HTMLButtonElement;
}
async function fill(key: string, value: string) {
  await act(async () => {
    const input = m.inputs.get(key);
    if (!input) throw Error("MISSING INPUT " + key);
    input.onChangeText(value);
  });
}
async function press(label: string) {
  await act(async () => button(label).click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.inputs.clear();
  saved = baseProfile();
  m.get.mockImplementation(async (guard: () => boolean) => ({ success: guard(), data: user() }));
  m.put.mockImplementation(async (changes: Record<string, unknown>, guard: () => boolean) => {
    if (!guard()) return { success: false, code: "G05_SESSION_CHANGED" };
    Object.assign(saved, changes);
    return { success: true, data: { userId: m.owner, ...saved } };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    // Actor race tests exercise explicit mutation readback; background focus/reconnect
    // refetches are unrelated to the asserted POST -> guarded GET sequence.
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
  m.success.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("actual mounted ordinary edit profile form owner-scoped PUT GET", () => {
  it("city changed: only city submitted; no success until exact saved GET", async () => {
    await mount();
    await fill("Например, Самара", "  Казань  ");
    const wait = deferred<{ success: boolean; data: { userId: string } }>();
    m.put.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    const [changes, guard] = m.put.mock.calls[0];
    expect(changes).toEqual({ city: "Казань" });
    expect(guard()).toBe(true);
    expect(m.updated).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Профиль обновлён");
    saved.city = "Казань";
    await act(async () => wait.resolve({ success: true, data: { userId: "A" } }));
    await flush();
    await vi.waitFor(() => expect(m.updated).toHaveBeenCalledOnce());
    expect(host.textContent).toContain("Профиль обновлён");
    expect(m.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it("same React batch doubletap is one PUT, not two", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    const wait = deferred<{ success: boolean; data: { userId: string } }>();
    m.put.mockReturnValueOnce(wait.promise);
    const b = button("Сохранить");
    await act(async () => {
      b.click();
      b.click();
    });
    await flush();
    expect(m.put).toHaveBeenCalledOnce();
    saved.city = "Казань";
    await act(async () => wait.resolve({ success: true, data: { userId: "A" } }));
    await flush();
  });
  it("unchanged ISO birthDate and fields: exit without PUT", async () => {
    await mount();
    await press("Сохранить");
    expect(m.put).not.toHaveBeenCalled();
    expect(m.back).toHaveBeenCalledOnce();
  });
  it("invalid birth date stops PUT and returns validation text", async () => {
    await mount();
    await fill("ДД.ММ.ГГГГ", "31.02.2024");
    await press("Сохранить");
    expect(m.put).not.toHaveBeenCalled();
    expect(host.querySelector("aside")?.textContent).toBeTruthy();
  });
  it("server structured 400 validation rejects without local success", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    m.put.mockResolvedValueOnce({ success: false, code: "VALIDATION_ERROR", error: "invalid" });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте заполненные поля"));
    expect(m.updated).not.toHaveBeenCalled();
    expect(m.put).toHaveBeenCalledOnce();
  });
  it("USER020_PROFILE_VALIDATION_ERROR is terminal 400; correction sends a fresh confirmed PUT", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    m.put.mockResolvedValueOnce({
      success: false,
      code: "PROFILE_VALIDATION_ERROR",
      error: "PRIVATE_SERVER_DIAGNOSTIC",
      details: { fieldErrors: { birthDate: "INVALID_VALUE", secret: "PRIVATE_OWNER" } },
    });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Проверьте заполненные поля"));
    expect(host.textContent).not.toContain("Результат сохранения неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_");
    expect(button("Сохранить").disabled).toBe(false);
    expect(m.put).toHaveBeenCalledOnce();
    expect(m.updated).not.toHaveBeenCalled();
    // Server validation must allow the owner to correct and submit again.
    await fill("Например, Самара", "Тула");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledTimes(2));
    expect(m.put.mock.calls[1][0]).toEqual({ city: "Тула" });
    await vi.waitFor(() => expect(m.updated).toHaveBeenCalledOnce());
    expect(host.textContent).toContain("Профиль обновлён");
  });

  it("unknown timeout keeps UI without local store mutation/no auto retry", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    m.put.mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(button("Сохранить").disabled).toBe(true);
    expect(m.put).toHaveBeenCalledOnce();
    expect(m.updated).not.toHaveBeenCalled();
  });
  it("PUT ACK with stale GET never updates profile/store", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    m.put.mockResolvedValueOnce({ success: true, data: { userId: "A" } });
    await press("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Результат сохранения неизвестен"));
    expect(m.updated).not.toHaveBeenCalled();
    expect(m.put).toHaveBeenCalledOnce();
  });
  it("fixture does not refetch profile from unrelated window focus events", async () => {
    await mount();
    await vi.waitFor(() => expect(m.get).toHaveBeenCalledOnce());
    await act(async () => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(m.get).toHaveBeenCalledOnce();
  });
  it("A->B->A fresh epoch during in-flight PUT prevents new owner readback", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    const wait = deferred<{ success: boolean; data: { userId: string } }>();
    m.put.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    const guard = m.put.mock.calls[0][1] as () => boolean;
    m.owner = "B";
    m.epoch = "B-E1";
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(EditProfileScreen))),
    );
    m.owner = "A";
    m.epoch = "A-E2";
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(EditProfileScreen))),
    );
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    const seen = m.get.mock.calls.length;
    expect(guard()).toBe(false);
    await act(async () => wait.resolve({ success: true, data: { userId: "A" } }));
    await flush();
    expect(m.get).toHaveBeenCalledTimes(seen);
    expect(m.updated).not.toHaveBeenCalled();
  });
  it("unmount before PUT ACK: no late setUserProfile/success", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    const wait = deferred<{ success: boolean; data: { userId: string } }>();
    m.put.mockReturnValueOnce(wait.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ success: true, data: { userId: "A" } }));
    expect(m.updated).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("website gets server canonical https and matches verified GET", async () => {
    await mount();
    await fill("youtube.com/@… или example.com", "www.example.com");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    expect(m.put.mock.calls[0][0]).toEqual({ website: "https://example.com/" });
    await vi.waitFor(() => expect(m.updated).toHaveBeenCalledOnce());
    expect(host.textContent).toContain("Профиль обновлён");
  });
  it("invalid Телеграм username fails client validation without PUT", async () => {
    await mount();
    await fill("username без @", "x");
    await press("Сохранить");
    expect(m.put).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Проверьте адрес сайта или имя пользователя");
  });
  it("logout during delayed readback after PUT ACK rejects late store callback", async () => {
    await mount();
    await fill("Например, Самара", "Казань");
    const late = deferred<{ success: boolean; data: ReturnType<typeof user> }>();
    m.get.mockReturnValueOnce(late.promise);
    await press("Сохранить");
    await vi.waitFor(() => expect(m.get).toHaveBeenCalledTimes(2));
    m.authed = false;
    late.resolve({ success: true, data: user() });
    await flush();
    expect(m.updated).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Профиль обновлён");
  });
  it("explicit field clearing sends only empty value, not hidden account attributes", async () => {
    await mount();
    await fill("О себе", "");
    await press("Сохранить");
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    expect(m.put.mock.calls[0][0]).toEqual({ about: "" });
  });
});
