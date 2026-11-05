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
  replies: vi.fn(),
  nextRootPage: vi.fn(),
  hasMoreRoots: true,
  fetchingRoots: false,
  rootPageError: false,
  detailError: false,
  detailPending: false,
  queryKeys: [] as unknown[][],
  detailRefetch: vi.fn(),
  rootAnswers: [] as Record<string, unknown>[],
  canManage: false,
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
    replies: (...args: unknown[]) => m.replies(...args),
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
  useInfiniteQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    return {
      data: m.detailError
        ? undefined
        : {
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
                answers: m.rootAnswers,
                nextAnswerPage: null,
                canManage: m.canManage,
                canEdit: false,
                canReply: true,
                blockReason: null,
                isAdmin: false,
              },
            ],
          },
      isPending: m.detailPending,
      isError: m.detailError || m.rootPageError,
      isFetchNextPageError: m.rootPageError,
      isRefetching: false,
      hasNextPage: m.hasMoreRoots,
      isFetchingNextPage: m.fetchingRoots,
      refetch: () => m.detailRefetch(),
      fetchNextPage: () => m.nextRootPage(),
    };
  },
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
    QAuthor: ({ author }: { author: { name: string } }) =>
      R.createElement("span", null, author.name),
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
    Keyboard: { addListener: () => ({ remove: () => undefined }) },
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
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.loading = false;
  m.uuid = 0;
  m.canManage = false;
  m.rootAnswers = [];
  m.hasMoreRoots = true;
  m.fetchingRoots = false;
  m.rootPageError = false;
  m.detailError = false;
  m.detailPending = false;
  m.queryKeys = [];
  m.detailRefetch.mockResolvedValue(undefined);
  m.nextRootPage.mockResolvedValue(undefined);
  m.replies.mockResolvedValue({ items: [], nextPage: null });
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

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const more = async () =>
  act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[data-label="Ещё ответы"], button[data-label="Повторить страницу ответов"]',
      )
      ?.click(),
  );
describe("AG3 SOC032 V58 actual root answer pagination mounted", () => {
  it("no next page means no network", async () => {
    m.hasMoreRoots = false;
    await render();
    await more();
    expect(m.nextRootPage).not.toHaveBeenCalled();
  });
  it("rapid doubletap makes exactly one call", async () => {
    const gate = deferred<void>();
    m.nextRootPage.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      const b = host.querySelector<HTMLButtonElement>('button[data-label="Ещё ответы"]');
      b?.click();
      b?.click();
    });
    expect(m.nextRootPage).toHaveBeenCalledOnce();
    await act(async () => gate.resolve(undefined));
  });
  it("query busy disables next-page button", async () => {
    m.fetchingRoots = true;
    await render();
    expect(host.querySelector<HTMLButtonElement>('button[data-label="Загрузка…"]')?.disabled).toBe(
      true,
    );
  });
  it("read error is sanitized and retry permitted", async () => {
    m.nextRootPage.mockRejectedValueOnce(Error("PRIVATE_BACKEND_DETAIL"));
    await render();
    await more();
    expect(host.textContent).toContain("Не удалось загрузить следующие ответы");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_DETAIL");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_BACKEND_DETAIL");
    await more();
    expect(m.nextRootPage).toHaveBeenCalledTimes(2);
  });
  it("page2 error keeps question and loaded root answers, with page-specific retry", async () => {
    m.rootAnswers = [
      {
        id: "root-1",
        parentId: null,
        author: { id: "reader", name: "Собачник" },
        body: "Ответ уже загружен",
        photos: [],
        createdAt: "2026-10-18T00:00:00Z",
        editedAt: null,
        best: false,
        deleted: false,
        hidden: false,
        replyCount: 0,
        canEdit: false,
        canDelete: false,
        hearts: 0,
        liked: false,
      },
    ];
    m.rootPageError = true;
    await render();
    expect(host.textContent).toContain("Как помочь щенку?");
    expect(host.textContent).toContain("Собачник");
    expect(host.textContent).not.toContain("Не удалось загрузить обсуждение");
    expect(host.textContent).toContain("Не удалось загрузить следующие ответы");
    expect(host.textContent).not.toContain("Пока никто не ответил");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[data-label="Повторить страницу ответов"]')
        ?.click(),
    );
    expect(m.nextRootPage).toHaveBeenCalledOnce();
    expect(m.detailRefetch).not.toHaveBeenCalled();
  });
  it("resolved fetchNextPage error result gives feedback even without thrown exception", async () => {
    m.nextRootPage.mockResolvedValueOnce({ isError: true, isFetchNextPageError: true });
    await render();
    await more();
    expect(host.textContent).toContain("Не удалось загрузить следующие ответы");
    expect(host.textContent).not.toContain("Не удалось загрузить обсуждение");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_BACKEND_DETAIL");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[data-label="Повторить страницу ответов"]')
        ?.click(),
    );
    expect(m.nextRootPage).toHaveBeenCalledTimes(2);
  });
  it("initial detail error does not show empty and retries original detail query", async () => {
    m.detailError = true;
    await render();
    expect(host.textContent).toContain("Не удалось загрузить обсуждение");
    expect(host.textContent).not.toContain("Пока никто не ответил");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[data-label="Повторить"]')?.click(),
    );
    expect(m.detailRefetch).toHaveBeenCalledOnce();
    expect(m.nextRootPage).not.toHaveBeenCalled();
  });
  it("old sort page-error completion never overrides new sort or blocks its request", async () => {
    const oldPage = deferred<{ isFetchNextPageError: boolean }>();
    m.nextRootPage.mockReturnValueOnce(oldPage.promise);
    await render();
    await more();
    await act(async () =>
      host.querySelector<HTMLElement>('[aria-label="Сортировать: Новые"]')?.click(),
    );
    expect(m.queryKeys.at(-1)?.at(-1)).toBe("new");
    await more();
    expect(m.nextRootPage).toHaveBeenCalledTimes(2);
    await act(async () => oldPage.resolve({ isFetchNextPageError: true }));
    expect(host.textContent).not.toContain("Не удалось загрузить следующие ответы");
    expect(m.trace).not.toHaveBeenCalled();
  });
  it("A→B→A new epoch ignores stale failure", async () => {
    const gate = deferred<void>();
    m.nextRootPage.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => gate.reject(Error("PRIVATE_LATE")));
    expect(m.trace).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Не удалось загрузить следующие ответы");
  });
  it("unmount suppresses late failure callback", async () => {
    const gate = deferred<void>();
    m.nextRootPage.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    await act(async () => root.unmount());
    await act(async () => gate.reject(Error("PRIVATE_LATE")));
    expect(m.trace).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
