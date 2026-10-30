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
  close: vi.fn(),
  remove: vi.fn(),
  report: vi.fn(),
  alert: vi.fn(),
  canManage: true,
  invalidate: vi.fn(),
  trace: vi.fn(),
  replace: vi.fn(),
  uuid: 0,
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
    remove: (...args: unknown[]) => m.remove(...args),
    removeAnswer: vi.fn(),
    heart: vi.fn(),
    best: vi.fn(),
    close: (...args: unknown[]) => m.close(...args),
    report: (...args: unknown[]) => m.report(...args),
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
          canManage: m.canManage,
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
vi.mock("./QuestionPostMenu", async () => {
  const R = await import("react");
  return {
    QuestionPostMenu: ({
      visible,
      actions,
      onClose,
    }: {
      visible: boolean;
      onClose: () => void;
      actions: { key: string; label: string; disabled?: boolean; onPress: () => void }[];
    }) =>
      visible
        ? R.createElement(
            "div",
            null,
            ...actions.map((a) =>
              R.createElement(
                "button",
                {
                  "data-label": a.label,
                  key: a.key,
                  disabled: a.disabled,
                  onClick: () => {
                    onClose();
                    a.onPress();
                  },
                },
                a.label,
              ),
            ),
          )
        : null,
  };
});
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
    }: {
      label: string;
      value: string;
      onChange: (v: string) => void;
    }) =>
      R.createElement("input", {
        "aria-label": label,
        value,
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
  const Scroll = R.forwardRef<
    { scrollToEnd: (options: { animated: boolean }) => void },
    { children?: React.ReactNode }
  >(({ children }, ref) => {
    R.useImperativeHandle(ref, () => ({ scrollToEnd: () => undefined }));
    return R.createElement("div", null, children);
  });
  return {
    ScrollView: Scroll,
    KeyboardAvoidingView: Box,
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
    Platform: { OS: "ios" },
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
    Share: { share: vi.fn() },
    RefreshControl: () => null,
  };
});
import { QuestionDetailScreen } from "./QuestionDetailScreen";
let root: Root, host: HTMLDivElement;
async function render() {
  await act(async () => root.render(createElement(QuestionDetailScreen, { id: "q-1" })));
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.uuid = 0;
  m.canManage = true;
  m.close.mockResolvedValue(undefined);
  m.remove.mockResolvedValue(undefined);
  m.report.mockResolvedValue(undefined);
  m.answer.mockResolvedValue({ id: "answer-1" });
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

const openMenu = async () => {
  await act(async () =>
    host.querySelector<HTMLElement>('[aria-label="Действия с вопросом"]')?.click(),
  );
};
const choose = async (label: string) => {
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`)?.click(),
  );
};
const wait = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
describe("AG3 SOC032 V56 actual question action mutation lifecycle mounted", () => {
  it("close discussion doubletap sends one mutation until server ACK", async () => {
    const ack = wait<void>();
    m.close.mockReturnValueOnce(ack.promise);
    await render();
    await openMenu();
    await act(async () => {
      const b = button("Закрыть обсуждение");
      b?.click();
      b?.click();
    });
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.close.mock.calls[0]).toEqual(["q-1", true]);
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => ack.resolve(undefined));
    expect(m.invalidate).toHaveBeenCalledOnce();
  });
  it("cache failure after confirmed close does not become UNKNOWN", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE_EXCEPTION"));
    await render();
    await openMenu();
    await choose("Закрыть обсуждение");
    expect(m.close).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("неизвестен");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_CACHE_EXCEPTION");
    await openMenu();
    await choose("Закрыть обсуждение");
    expect(m.close).toHaveBeenCalledTimes(2);
  });
  it("ambiguous close fails closed: sanitized error and no second mutation", async () => {
    m.close.mockRejectedValueOnce(Error("PRIVATE_BACKEND_DETAIL"));
    await render();
    await openMenu();
    await choose("Закрыть обсуждение");
    expect(host.textContent).toContain("Результат действия неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_DETAIL");
    await openMenu();
    await choose("Закрыть обсуждение");
    expect(m.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_BACKEND_DETAIL");
  });
  it("A→B→A new generation suppresses late ACK cache refresh", async () => {
    const ack = wait<void>();
    m.close.mockReturnValueOnce(ack.promise);
    await render();
    await openMenu();
    await choose("Закрыть обсуждение");
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => ack.resolve(undefined));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("report UI success only after confirmed POST and never before", async () => {
    const ack = wait<void>();
    m.report.mockReturnValueOnce(ack.promise);
    await render();
    await openMenu();
    await choose("Пожаловаться");
    await choose("Отправить жалобу");
    expect(m.report).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("Жалоба отправлена администратору");
    await act(async () => ack.resolve(undefined));
    expect(host.textContent).toContain("Жалоба отправлена администратору");
    expect(m.invalidate).toHaveBeenCalledOnce();
  });
  it("question deletion waits for native confirmation and actual ACK to navigate", async () => {
    const ack = wait<void>();
    m.remove.mockReturnValueOnce(ack.promise);
    await render();
    await openMenu();
    await choose("Удалить");
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledOnce();
    const actions = m.alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const yes = actions.find((a) => a.text === "Удалить")!;
    await act(async () => yes.onPress?.());
    expect(m.remove).toHaveBeenCalledOnce();
    expect(m.replace).not.toHaveBeenCalled();
    await act(async () => ack.resolve(undefined));
    expect(m.replace).toHaveBeenCalledWith("/(main)/(tabs)/questions");
  });
  it("unmounted pending delete callback cannot navigate or mutate UI", async () => {
    const ack = wait<void>();
    m.remove.mockReturnValueOnce(ack.promise);
    await render();
    await openMenu();
    await choose("Удалить");
    const actions = m.alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => actions.find((a) => a.text === "Удалить")?.onPress?.());
    await act(async () => root.unmount());
    await act(async () => ack.resolve(undefined));
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
