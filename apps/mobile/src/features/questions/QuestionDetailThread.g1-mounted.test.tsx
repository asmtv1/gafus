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
  rootAnswers: [] as Record<string, unknown>[],
  rootPages: null as Record<string, unknown>[][] | null,
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
  useInfiniteQuery: () => ({
    data: {
      pages: (m.rootPages ?? [m.rootAnswers]).map((pageAnswers) => ({
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
        answers: pageAnswers,
        nextAnswerPage: null,
        canManage: m.canManage,
        canEdit: false,
        canReply: true,
        blockReason: null,
        isAdmin: false,
      })),
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
    View: Box,
    Text: ({ children, accessibilityRole, accessibilityLabel, accessibilityLiveRegion }: {
      children?: React.ReactNode;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityLiveRegion?: string;
    }) => R.createElement("span", {
      "data-native-role": accessibilityRole,
      "aria-label": accessibilityLabel,
      "data-live": accessibilityLiveRegion,
    }, children),
    Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole,
      accessibilityState, disabled }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { expanded?: boolean; disabled?: boolean; busy?: boolean };
      disabled?: boolean;
    }) => R.createElement("span", {
      "aria-label": accessibilityLabel,
      "data-native-role": accessibilityRole,
      "data-native-expanded": String(accessibilityState?.expanded),
      "data-native-busy": String(accessibilityState?.busy),
      "data-native-disabled": String(accessibilityState?.disabled),
      "data-disabled": String(!!disabled),
      onClick: disabled ? undefined : onPress,
    }, children),
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
  m.rootAnswers = [rootAnswer()];
  m.rootPages = null;
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

const rootAnswer = () => ({
  id: "root-1",
  body: "Начните с коротких прогулок",
  author: { id: "replyer-A", name: "Ответ A", avatarUrl: null },
  createdAt: "2026-10-18T00:00:00Z",
  editedAt: null,
  parentId: null,
  replyToName: null,
  deleted: false,
  hidden: false,
  replyCount: 3,
  photos: [],
  hearts: 0,
  liked: false,
  best: false,
  canEdit: false,
  canDelete: false,
});
const child = (id: string, name: string) => ({
  ...rootAnswer(),
  id,
  author: { id, name, avatarUrl: null },
  parentId: "root-1",
  replyCount: 0,
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
async function more() {
  await act(async () =>
    host
      .querySelector<HTMLElement>(
        '[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"], [aria-label="Повторить загрузку ответов в ветке 1 пользователя Ответ A"]',
      )
      ?.click(),
  );
}
async function latestSort() {
  await act(async () =>
    host.querySelector<HTMLElement>('[aria-label="Сортировать: Новые"]')?.click(),
  );
}
describe("AG3 SOC032 V57 actual nested replies pagination mounted source/mock", () => {
  it("groups ordinary child, nested best and root best without duplicate best card or extra GET", async () => {
    const root = { ...rootAnswer(), replyCount: 2 };
    const regular = child("child-ordinary", "Обычный вложенный");
    const nestedBest = { ...child("child-best", "Лучший вложенный"), best: true };
    const topBest = {
      ...rootAnswer(),
      id: "root-best",
      best: true,
      replyCount: 0,
      author: { id: "best-owner", name: "Лучший корневой", avatarUrl: null },
    };
    m.rootPages = [
      [root, regular],
      [nestedBest, topBest],
    ];
    await render();
    const view = host.textContent ?? "";
    expect(view).toContain("Обычный вложенный");
    expect(view).toContain("Лучший вложенный");
    expect(view).toContain("Лучший корневой");
    expect(view.match(/Лучший вложенный/g)).toHaveLength(1);
    expect(view.indexOf("Ответ A")).toBeLessThan(view.indexOf("Обычный вложенный"));
    expect(view.indexOf("Обычный вложенный")).toBeLessThan(view.indexOf("Лучший вложенный"));
    expect(view.indexOf("Лучший вложенный")).toBeLessThan(view.indexOf("Лучший корневой"));
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]')).toBeNull();
    expect(m.replies).not.toHaveBeenCalled();
  });

  it("dedups IDs across root pages and extra replies: last value wins, first insertion stays", async () => {
    m.rootPages = [
      [rootAnswer(), child("dup", "Старый дубль"), child("middle", "Средний")],
      [child("dup", "Новый дубль из страницы")],
    ];
    m.replies.mockResolvedValueOnce({
      items: [child("dup", "Последний дубль из ветки"), child("appended", "Добавленный")],
      nextPage: null,
    });
    await render();
    expect(host.textContent).toContain("Новый дубль из страницы");
    expect(host.textContent).not.toContain("Старый дубль");
    await more();
    const view = host.textContent ?? "";
    expect(view).toContain("Последний дубль из ветки");
    expect(view).not.toContain("Новый дубль из страницы");
    expect(view).not.toContain("Старый дубль");
    expect(view.match(/Последний дубль из ветки/g)).toHaveLength(1);
    expect(view.indexOf("Последний дубль из ветки")).toBeLessThan(view.indexOf("Средний"));
    expect(view.indexOf("Средний")).toBeLessThan(view.indexOf("Добавленный"));
    expect(m.replies).toHaveBeenCalledExactlyOnceWith("root-1", 2);
  });

  it("collapsing ordinary children keeps best nested root visible and restores appended replies", async () => {
    m.rootPages = [
      [
        rootAnswer(),
        child("child-1", "Ранний ответ"),
        { ...child("best", "Лучший ответ ветки"), best: true },
      ],
    ];
    m.replies.mockResolvedValueOnce({
      items: [child("child-2", "Поздний ответ")],
      nextPage: null,
    });
    await render();
    await more();
    expect(host.textContent).toContain("Поздний ответ");
    await act(async () => host.querySelector<HTMLElement>('[aria-label="Скрыть ответы в ветке 1 пользователя Ответ A"]')?.click());
    expect(host.textContent).not.toContain("Ранний ответ");
    expect(host.textContent).not.toContain("Поздний ответ");
    expect(host.textContent).toContain("Лучший ответ ветки");
    await act(async () =>
      host.querySelector<HTMLElement>('[aria-label="Показать ответы (3) в ветке 1 пользователя Ответ A"]')?.click(),
    );
    expect(host.textContent).toContain("Ранний ответ");
    expect(host.textContent).toContain("Поздний ответ");
    expect(m.replies).toHaveBeenCalledTimes(1);
  });

  it("selected answer menu uses the final duplicate-ID value without granting stale edit", async () => {
    m.rootPages = [
      [rootAnswer(), { ...child("same-id", "Старый редактируемый"), canEdit: true }],
      [{ ...child("same-id", "Актуальный нередактируемый"), canEdit: false }],
    ];
    await render();
    expect(host.textContent).toContain("Актуальный нередактируемый");
    expect(host.textContent).not.toContain("Старый редактируемый");
    await act(async () =>
      host.querySelectorAll<HTMLElement>('[aria-label="Ещё действия с ответом"]')[1]?.click(),
    );
    expect(host.querySelector('[data-label="Изменить"]')).toBeNull();
    expect(m.editAnswer).not.toHaveBeenCalled();
  });

  it("empty answer pages keep the existing no-answer state without nested GET", async () => {
    m.rootPages = [[], []];
    await render();
    expect(host.textContent).toContain("Пока никто не ответил");
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]')).toBeNull();
    expect(m.replies).not.toHaveBeenCalled();
  });

  it("fetches only requested root+page and publishes after successful GET", async () => {
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    expect(m.replies).toHaveBeenCalledExactlyOnceWith("root-1", 2);
    expect(host.textContent).not.toContain("Ответ подгружен");
    await act(async () =>
      gate.resolve({ items: [child("reply-1", "Ответ подгружен")], nextPage: null }),
    );
    expect(host.textContent).toContain("Ответ подгружен");
  });
  it("rapid doubletap fetches only one requested page", async () => {
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => {
      const target = host.querySelector<HTMLElement>('[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]');
      target?.click();
      target?.click();
    });
    expect(m.replies).toHaveBeenCalledOnce();
    await act(async () => gate.resolve({ items: [], nextPage: null }));
  });
  it("sort switch during in-flight GET drops old-sort children", async () => {
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    await latestSort();
    await act(async () =>
      gate.resolve({ items: [child("stale", "PRIVATE_OLD_SORT_REPLY")], nextPage: null }),
    );
    expect(host.textContent).not.toContain("PRIVATE_OLD_SORT_REPLY");
    await more();
    expect(m.replies).toHaveBeenCalledTimes(2);
  });
  it("A→B→A new epoch drops pending GET and never publishes it to new view", async () => {
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () =>
      gate.resolve({ items: [child("late", "PRIVATE_OLD_OWNER_REPLY")], nextPage: null }),
    );
    expect(host.textContent).not.toContain("PRIVATE_OLD_OWNER_REPLY");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("read error shows neutral message but allows safe retry", async () => {
    m.replies.mockRejectedValueOnce(new Error("PRIVATE_RAW_SERVER_ERROR"));
    await render();
    await more();
    expect(host.textContent).toContain("Не удалось загрузить ответы");
    expect(host.textContent).not.toContain("PRIVATE_RAW_SERVER_ERROR");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_RAW_SERVER_ERROR");
    await more();
    expect(m.replies).toHaveBeenCalledTimes(2);
  });
  it("failed nested page preserves the loaded reply and retries the same cursor locally", async () => {
    m.replies
      .mockResolvedValueOnce({ items: [child("reply-1", "Ответ сохранён")], nextPage: 3 })
      .mockRejectedValueOnce(Error("PRIVATE_NESTED_PAGE_3"))
      .mockResolvedValueOnce({ items: [child("reply-2", "Ответ после повтора")], nextPage: null });
    await render();
    await more();
    expect(m.replies).toHaveBeenNthCalledWith(1, "root-1", 2);
    expect(host.textContent).toContain("Ответ сохранён");

    await more();
    expect(m.replies).toHaveBeenNthCalledWith(2, "root-1", 3);
    expect(host.textContent).toContain("Как помочь щенку?");
    expect(host.textContent).toContain("Ответ сохранён");
    expect(host.textContent).toContain("Не удалось загрузить ответы в ветке");
    expect(host.querySelector('[aria-label="Повторить загрузку ответов в ветке 1 пользователя Ответ A"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_NESTED_PAGE_3");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_NESTED_PAGE_3");

    await act(async () =>
      host.querySelector<HTMLElement>('[aria-label="Повторить загрузку ответов в ветке 1 пользователя Ответ A"]')?.click(),
    );
    expect(m.replies).toHaveBeenNthCalledWith(3, "root-1", 3);
    expect(host.textContent).toContain("Ответ сохранён");
    expect(host.textContent).toContain("Ответ после повтора");
    expect(host.textContent).not.toContain("Не удалось загрузить ответы в ветке");
  });

  it("old-sort failed nested GET cannot show global error or block new-sort reader", async () => {
    const old = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ items: [child("fresh", "Свежий ответ")], nextPage: null });
    await render();
    await more();
    await latestSort();
    await more();
    expect(m.replies).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Свежий ответ");
    await act(async () => old.reject(Error("PRIVATE_OLD_SORT_NESTED")));
    expect(host.textContent).toContain("Свежий ответ");
    expect(host.textContent).not.toContain("Не удалось загрузить ответы");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_OLD_SORT_NESTED");
    expect(m.trace).not.toHaveBeenCalled();
  });

  it("simultaneous different-root nested reads are independent and old completion does not release a peer", async () => {
    m.rootAnswers = [rootAnswer(), { ...rootAnswer(), id: "root-2", replyCount: 2 }];
    const old = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    const second = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(old.promise).mockReturnValueOnce(second.promise);
    await render();
    await act(async () => {
      const first = host.querySelector<HTMLElement>(
        '[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]',
      );
      const second = host.querySelector<HTMLElement>(
        '[aria-label="Показать ещё ответы в ветке 2 пользователя Ответ A"]',
      );
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      first?.click();
      second?.click();
    });
    expect(m.replies).toHaveBeenCalledTimes(2);
    await act(async () => old.resolve({ items: [], nextPage: null }));
    await act(async () =>
      host.querySelector<HTMLElement>('[data-native-role="button"][aria-label="Загружаем ответы в ветке 2 пользователя Ответ A"]')?.click(),
    );
    expect(m.replies).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve({ items: [], nextPage: null }));
  });
  it("unmount before read ACK suppresses private callback", async () => {
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await more();
    await act(async () => root.unmount());
    await act(async () =>
      gate.resolve({ items: [child("late", "PRIVATE_AFTER_UNMOUNT")], nextPage: null }),
    );
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});


// SOC040: real QuestionDetailScreen RN a11y props, NOT physical screenreader
// or native focus behavior. Preserve legacy cursor/sort/actor tests above.
describe("SOC040_QUESTION_THREADS_ACCESSIBILITY", () => {
  it("names two same-author threads uniquely and exposes independent expanded states", async () => {
    m.rootAnswers = [rootAnswer(), { ...rootAnswer(), id: "root-2", body: "Другой совет", replyCount: 2 }];
    await render();
    const first = host.querySelector<HTMLElement>(
      '[aria-label="Скрыть ответы в ветке 1 пользователя Ответ A"]',
    );
    const second = host.querySelector<HTMLElement>(
      '[aria-label="Скрыть ответы в ветке 2 пользователя Ответ A"]',
    );
    expect(first?.getAttribute("data-native-role")).toBe("button");
    expect(first?.getAttribute("data-native-expanded")).toBe("true");
    expect(second?.getAttribute("data-native-expanded")).toBe("true");
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]'))
      .not.toBeNull();
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 2 пользователя Ответ A"]'))
      .not.toBeNull();
    await act(async () => first?.click());
    expect(host.querySelector('[aria-label="Показать ответы (3) в ветке 1 пользователя Ответ A"]')
      ?.getAttribute("data-native-expanded")).toBe("false");
    expect(host.querySelector('[aria-label="Скрыть ответы в ветке 2 пользователя Ответ A"]')
      ?.getAttribute("data-native-expanded")).toBe("true");
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]'))
      .toBeNull();
    await act(async () => host.querySelector<HTMLElement>(
      '[aria-label="Показать ответы (3) в ветке 1 пользователя Ответ A"]')?.click());
    expect(host.querySelector('[aria-label="Скрыть ответы в ветке 1 пользователя Ответ A"]')
      ?.getAttribute("data-native-expanded")).toBe("true");
    expect(m.replies).not.toHaveBeenCalled();
  });

  it("busy nested page announces context and disables only that branch until completion", async () => {
    m.rootAnswers = [rootAnswer(), { ...rootAnswer(), id: "root-2", replyCount: 2 }];
    const gate = deferred<{ items: ReturnType<typeof child>[]; nextPage: null }>();
    m.replies.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => host.querySelector<HTMLElement>(
      '[aria-label="Показать ещё ответы в ветке 1 пользователя Ответ A"]')?.click());
    const busy = host.querySelector<HTMLElement>(
      '[data-native-role="button"][aria-label="Загружаем ответы в ветке 1 пользователя Ответ A"]',
    );
    expect(busy?.getAttribute("data-native-busy")).toBe("true");
    expect(busy?.getAttribute("data-native-disabled")).toBe("true");
    expect(busy?.getAttribute("data-disabled")).toBe("true");
    expect(host.querySelector('[aria-label="Показать ещё ответы в ветке 2 пользователя Ответ A"]')
      ?.getAttribute("data-native-disabled")).toBe("false");
    expect(host.querySelector('[data-live="polite"][aria-label="Загружаем ответы в ветке 1 пользователя Ответ A"]'))
      .not.toBeNull();
    await act(async () => gate.resolve({ items: [child("loaded", "Уже виден")], nextPage: null }));
    expect(host.textContent).toContain("Уже виден");
    expect(m.replies).toHaveBeenCalledExactlyOnceWith("root-1", 2);
  });

  it("error announces author and human branch, retry retains cursor and old children", async () => {
    m.replies.mockResolvedValueOnce({
      items: [child("old", "Уже загружен")], nextPage: 3,
    }).mockRejectedValueOnce(Error("PRIVATE_PAGE_FAIL"))
      .mockResolvedValueOnce({ items: [child("new", "После повтора")], nextPage: null });
    await render();
    await more();
    await more();
    const retry = host.querySelector<HTMLElement>(
      '[aria-label="Повторить загрузку ответов в ветке 1 пользователя Ответ A"]',
    );
    expect(retry?.getAttribute("data-native-disabled")).toBe("false");
    expect(host.querySelector('[data-native-role="alert"]')?.getAttribute("aria-label"))
      .toContain("ветке 1 пользователя Ответ A");
    expect(host.innerHTML).not.toContain("PRIVATE_PAGE_FAIL");
    expect(host.innerHTML).not.toContain("aria-label=\"Повторить ответы в ветке root-1");
    expect(host.textContent).toContain("Уже загружен");
    await act(async () => retry?.click());
    expect(m.replies).toHaveBeenNthCalledWith(3, "root-1", 3);
    expect(host.textContent).toContain("После повтора");
    expect(host.textContent).toContain("Уже загружен");
  });
});
