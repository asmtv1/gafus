// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  loading: false,
  create: vi.fn(),
  edit: vi.fn(),
  detail: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  invalidate: vi.fn(),
  trace: vi.fn(),
  mockDetail: null as null | Record<string, unknown>,
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: m.loading,
  });
  return {
    useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(state()), {
      getState: state,
    }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/lib/api/questions", () => ({
  questionsApi: {
    create: (...v: unknown[]) => m.create(...v),
    edit: (...v: unknown[]) => m.edit(...v),
    detail: (...v: unknown[]) => m.detail(...v),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...v: unknown[]) => m.invalidate(...v) }),
  useQuery: ({ enabled }: { enabled: boolean }) => ({
    isPending: false,
    isError: false,
    data: enabled ? m.mockDetail : null,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: (v: string) => m.replace(v), back: () => m.back() }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black", textSecondary: "grey", cardBackground: "white" },
  FONTS: { montserrat: "a", montserratBold: "b", montserratMedium: "c" },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return { AppBackButton: () => null, Loading: () => null, TexturedSafeAreaView: Box };
});
vi.mock("./ui", () => ({ QPhotoPicker: () => null, st: { error: {} } }));
vi.mock("@/shared/components/ui/Button", async () => {
  const R = await import("react");
  return {
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
    }) => R.createElement("button", { onClick: onPress, disabled }, label),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    Keyboard: { dismiss: () => undefined },
    KeyboardAvoidingView: Box,
    ScrollView: Box,
    View: Box,
    Modal: ({ children, visible }: { children?: React.ReactNode; visible: boolean }) =>
      visible ? R.createElement("div", null, children) : null,
    Platform: { OS: "ios" },
    StyleSheet: { create: (x: unknown) => x, absoluteFill: {} },
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    TextInput: ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (s: string) => void;
      accessibilityLabel: string;
    }) =>
      R.createElement("input", {
        value,
        "aria-label": accessibilityLabel,
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onChangeText(ev.target.value),
      }),
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
  };
});
import { QuestionFormScreen } from "./QuestionFormScreen";
let host: HTMLDivElement;
let root: Root;
const wait = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const saveButton = () =>
  Array.from(host.querySelectorAll("button")).find(
    (x) =>
      x.textContent?.includes("Опубликовать вопрос") ||
      x.textContent?.includes("Сохранить изменения"),
  );
async function render(id?: string) {
  await act(async () => root.render(createElement(QuestionFormScreen, { id })));
}
async function fill(label: string, value: string) {
  await act(async () => {
    const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    expect(node).not.toBeNull();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
      node,
      value,
    );
    node?.dispatchEvent(new Event("input", { bubbles: true }));
    node?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function valid() {
  await fill("Заголовок", "   Сколько гулять со щенком?   ");
  await fill("Подробности", "  Что учитывать?   ");
}
async function save() {
  await act(async () => saveButton()?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.mockDetail = null;
  m.create.mockResolvedValue({ id: "question-1" });
  m.edit.mockResolvedValue(undefined);
  m.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 SOC032 actual QuestionFormScreen source/mock", () => {
  it("does not post unverified session or invalid fields", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.create).not.toHaveBeenCalled();
    m.authed = true;
    await render();
    await valid();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Добавить теги"]')?.click();
    });
    await fill("Теги через запятую, до пяти", "a,b,c,d,e,f");
    await save();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rapid doubletap produces one canonical POST and only navigates after ACK", async () => {
    const ack = wait<{ id: string }>();
    m.create.mockReturnValueOnce(ack.promise);
    await render();
    await valid();
    await act(async () => {
      saveButton()?.click();
      saveButton()?.click();
    });
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.create.mock.calls[0][0]).toMatchObject({
      title: "Сколько гулять со щенком?",
      body: "Что учитывать?",
      clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(m.replace).not.toHaveBeenCalled();
    await act(async () => ack.resolve({ id: "question-1" }));
    expect(m.replace).toHaveBeenCalledWith("/questions/question-1");
  });
  it("unknown result never leaks raw backend error or retries mutation", async () => {
    m.create.mockRejectedValueOnce(Error("SYNTHETIC_PRIVATE_BACKEND_DETAIL"));
    await render();
    await valid();
    await save();
    expect(host.textContent).toContain("Результат сохранения неизвестен");
    expect(host.textContent).not.toContain("SYNTHETIC_PRIVATE_BACKEND_DETAIL");
    await save();
    expect(m.create).toHaveBeenCalledOnce();
    expect(saveButton()?.disabled).toBe(true);
  });
  it("A to B to A new auth epoch fences late ACK and resets draft", async () => {
    const ack = wait<{ id: string }>();
    m.create.mockReturnValueOnce(ack.promise);
    await render();
    await valid();
    await save();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => ack.resolve({ id: "question-1" }));
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Заголовок"]')?.value).toBe("");
  });
  it("unmounted pending callback never navigates or touches cache", async () => {
    const ack = wait<{ id: string }>();
    m.create.mockReturnValueOnce(ack.promise);
    await render();
    await valid();
    await save();
    await act(async () => root.unmount());
    await act(async () => ack.resolve({ id: "question-1" }));
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("cache invalidation error after confirmed ACK cannot turn success into unknown", async () => {
    m.invalidate.mockRejectedValueOnce(Error("SYNTHETIC_CACHE_ERROR"));
    await render();
    await valid();
    await save();
    expect(m.replace).toHaveBeenCalledWith("/questions/question-1");
    expect(host.textContent).not.toContain("Результат сохранения неизвестен");
    await save();
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("existing edit uses PATCH without a create request and guards success", async () => {
    m.mockDetail = {
      id: "q-existing",
      title: "Старый",
      body: "Прежний текст",
      tags: [],
      photos: [],
      category: "Другое",
      canEdit: true,
      blockReason: null,
    };
    await render("q-existing");
    await fill("Заголовок", "Новый заголовок");
    await save();
    expect(m.edit).toHaveBeenCalledOnce();
    expect(m.edit.mock.calls[0][0]).toBe("q-existing");
    expect(m.edit.mock.calls[0][1]).toMatchObject({
      title: "Новый заголовок",
      body: "Прежний текст",
    });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.replace).toHaveBeenCalledWith("/questions/q-existing");
  });
});
