// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  loading: false,
  answer: vi.fn(),
  editAnswer: vi.fn(),
  invalidate: vi.fn(),
  trace: vi.fn(),
  replace: vi.fn(),
  uuid: 0,
  scrollToEnd: vi.fn(),
  keyboardDidShow: null as null | (() => void),
  removeKeyboardListener: vi.fn(),
  onScrollLayout: null as null | (() => void),
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
    answer: (...args: unknown[]) => m.answer(...args),
    editAnswer: (...args: unknown[]) => m.editAnswer(...args),
    detail: vi.fn(),
    replies: vi.fn(),
    remove: vi.fn(),
    removeAnswer: vi.fn(),
    heart: vi.fn(),
    best: vi.fn(),
    close: vi.fn(),
    report: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...args: unknown[]) => m.invalidate(...args) }),
  useInfiniteQuery: () => ({
    data: {
      pages: [
        {
          id: "q-1",
          title: "Как помочь щенку?",
          body: "Посоветуйте",
          category: "Другое",
          tags: [],
          author: { id: "q-owner", name: "Читатель", avatarUrl: null },
          createdAt: "2026-10-18T00:00:00Z",
          editedAt: null,
          status: "waiting",
          closed: false,
          answerCount: 0,
          viewCount: 3,
          bestAnswer: null,
          photos: [],
          answers: [],
          nextAnswerPage: null,
          canManage: false,
          canEdit: false,
          canReply: true,
          blockReason: null,
          isAdmin: false,
        },
      ],
    },
    isPending: false,
    isError: false,
    isRefetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: (v: unknown) => m.replace(v), push: vi.fn() }),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++m.uuid).padStart(12, "0")}`,
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black", textSecondary: "gray" },
  FONTS: { montserrat: "a", montserratBold: "b", montserratMedium: "c" },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    AppBackButton: () => null,
    Loading: () => null,
    MascotSpinner: () => null,
    TexturedSafeAreaView: Box,
  };
});
vi.mock("./QuestionAnswerHeart", () => ({ QuestionAnswerHeart: () => null }));
vi.mock("./QuestionPostMenu", () => ({ QuestionPostMenu: () => null }));
vi.mock("./ui", async () => {
  const R = await import("react");
  return {
    QAuthor: () => null,
    QBody: () => null,
    QPhotos: () => null,
    QStatus: () => null,
    QPhotoPicker: ({ trailingAction }: { trailingAction?: React.ReactNode }) =>
      R.createElement("div", null, trailingAction),
    QInput: ({
      label,
      value,
      onChange,
      onFocus,
      onBlur,
    }: {
      label: string;
      value: string;
      onChange: (v: string) => void;
      onFocus?: () => void;
      onBlur?: () => void;
    }) =>
      R.createElement("input", {
        "aria-label": label,
        value,
        onFocus,
        onBlur,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
      }),
    QButton: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => R.createElement("button", { "data-label": label, disabled, onClick: onPress }, label),
    st: {
      error: {},
      notice: {},
      group: {},
      answer: {},
      best: {},
      reply: {},
      row: {},
      badge: {},
      resolved: {},
      meta: {},
      card: {},
      title: {},
      content: {},
    },
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  const Scroll = R.forwardRef<{ scrollToEnd: typeof m.scrollToEnd }, {
    children?: React.ReactNode; onLayout?: () => void;
  }>(({ children, onLayout }, ref) => {
    R.useImperativeHandle(ref, () => ({ scrollToEnd: m.scrollToEnd }));
    m.onScrollLayout = onLayout ?? null;
    return R.createElement("div", null, children);
  });
  return {
    ScrollView: Scroll,
    KeyboardAvoidingView: ({ children, behavior }: {
      children?: React.ReactNode; behavior?: string;
    }) => R.createElement("div", { "data-keyboard-behavior": behavior }, children),
    Keyboard: { addListener: (_event: string, callback: () => void) => {
      m.keyboardDidShow = callback;
      return { remove: m.removeKeyboardListener };
    } },
    View: Box,
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) => R.createElement("span", { "aria-label": accessibilityLabel, onClick: onPress }, children),
    StyleSheet: { create: (v: unknown) => v },
    Platform: { OS: "android" },
    Alert: { alert: vi.fn() },
    Share: { share: vi.fn() },
    RefreshControl: () => null,
  };
});
import { QuestionDetailScreen } from "./QuestionDetailScreen";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((a) => {
    resolve = a;
  });
  return { promise, resolve };
};
async function render() {
  await act(async () => root.render(createElement(QuestionDetailScreen, { id: "q-1" })));
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
async function enter(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Ваш ответ"]');
    expect(input).not.toBeNull();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      value,
    );
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function send() {
  await act(async () => button("Ответить")?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.uuid = 0;
  m.keyboardDidShow = null;
  m.onScrollLayout = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  m.answer.mockResolvedValue({ id: "answer-1" });
  m.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  host.remove();
});

describe("AG3 SOC032 V52 real QuestionDetail answer composer mounted source/mock", () => {
  it("keeps the Android answer field visible on focus, keyboard opening and screen resizing", async () => {
    await render();
    expect(host.querySelector('[data-keyboard-behavior="padding"]')).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Ваш ответ"]');
    expect(input).not.toBeNull();
    await act(async () => input?.focus());
    expect(m.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    m.scrollToEnd.mockClear();
    await act(async () => m.keyboardDidShow?.());
    expect(m.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    m.scrollToEnd.mockClear();
    await act(async () => m.onScrollLayout?.());
    expect(m.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    await act(async () => input?.blur());
    m.scrollToEnd.mockClear();
    await act(async () => m.keyboardDidShow?.());
    expect(m.scrollToEnd).not.toHaveBeenCalled();
  });
  it("guest cannot mount private detail or submit", async () => {
    m.authed = false;
    await render();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.answer).not.toHaveBeenCalled();
  });
  it("blank answer cannot dispatch", async () => {
    await render();
    expect(button("Ответить")?.disabled).toBe(true);
    expect(m.answer).not.toHaveBeenCalled();
  });
  it("rapid doubletap sends one canonical DTO, then resets only on ACK", async () => {
    const ack = deferred<{ id: string }>();
    m.answer.mockReturnValueOnce(ack.promise);
    await render();
    await enter("  Советую учить постепенно.  ");
    await act(async () => {
      button("Ответить")?.click();
      button("Ответить")?.click();
    });
    expect(m.answer).toHaveBeenCalledOnce();
    expect(m.answer.mock.calls[0]).toEqual([
      "q-1",
      {
        body: "Советую учить постепенно.",
        photoIds: [],
        clientRequestId: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => ack.resolve({ id: "answer-1" }));
    expect(m.invalidate).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Ваш ответ"]')?.value).toBe("");
  });
  it("unknown POST result blocks repeat without raw exception or telemetry", async () => {
    m.answer.mockRejectedValueOnce(new Error("PRIVATE_BACKEND_STACK"));
    await render();
    await enter("Совет по прогулке");
    await send();
    expect(host.textContent).toContain("Результат отправки ответа неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_STACK");
    await send();
    expect(m.answer).toHaveBeenCalledOnce();
    expect(button("Ответить")?.disabled).toBe(true);
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_BACKEND_STACK");
  });
  it("A→B→A new epoch rejects late ACK and preserves fresh screen", async () => {
    const ack = deferred<{ id: string }>();
    m.answer.mockReturnValueOnce(ack.promise);
    await render();
    await enter("Совет для A");
    await send();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => ack.resolve({ id: "answer-1" }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Ваш ответ"]')?.value).toBe("");
  });
  it("unmount before pending ACK does not invalidate cache", async () => {
    const ack = deferred<{ id: string }>();
    m.answer.mockReturnValueOnce(ack.promise);
    await render();
    await enter("Совет");
    await send();
    await act(async () => root.unmount());
    await act(async () => ack.resolve({ id: "answer-1" }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("cache failure after server ACK is not unknown; next answer remains possible", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("CACHE_PRIVATE_ERROR"));
    await render();
    await enter("Совет первый");
    await send();
    expect(m.answer).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("неизвестен");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("CACHE_PRIVATE_ERROR");
    await enter("Совет второй");
    await send();
    expect(m.answer).toHaveBeenCalledTimes(2);
  });
});
