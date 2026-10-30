// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  pending: false,
  isError: false,
  pageError: false,
  canPublish: true,
  hasNextPage: false,
  items: [] as { id: string; title: string }[],
  queryKeys: [] as unknown[][],
  refresh: vi.fn(),
  next: vi.fn(),
  push: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: false,
  });
  return {
    useAuthStore: Object.assign((s: (x: unknown) => unknown) => s(state()), { getState: state }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/api/questions", () => ({ questionsApi: { list: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    m.queryKeys.push(queryKey);
    return {
      data:
        m.pending || (m.isError && !m.pageError)
          ? undefined
          : {
              pages: [
                { items: m.items, canPublish: m.canPublish, blockReason: null, nextPage: null },
              ],
            },
      isPending: m.pending,
      isError: m.isError,
      isFetchNextPageError: m.pageError,
      isRefetchError: false,
      error: Error("PRIVATE_API_ERROR"),
      isFetchingNextPage: false,
      hasNextPage: m.hasNextPage,
      isRefetching: false,
      refetch: () => m.refresh(),
      fetchNextPage: () => m.next(),
    };
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: (v: unknown) => m.push(v) }) }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", text: "black", textSecondary: "gray" },
  FONTS: { montserrat: "a", montserratMedium: "b", montserratBold: "c" },
  SPACING: { md: 10 },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return { Loading: () => null, MascotSpinner: () => null, TexturedSafeAreaView: Box };
});
vi.mock("@/shared/components/ui/Button", async () => {
  const R = await import("react");
  return {
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => R.createElement("button", { disabled, "data-label": label, onClick: onPress }, label),
  };
});
vi.mock("./ui", async () => {
  const R = await import("react");
  return {
    QAuthor: () => null,
    QStatus: () => null,
    QButton: ({
      label,
      disabled,
      onPress,
      selected,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
      selected?: boolean;
    }) => R.createElement("button", {
      disabled, "data-label": label, "data-selected": String(!!selected), onClick: onPress,
    }, label),
    st: {
      error: {},
      notice: {},
      group: {},
      content: {},
      card: {},
      title: {},
      body: {},
      listCard: {},
      listTitle: {},
      listPreview: {},
      label: {},
      compactBody: {},
    },
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children, accessibilityRole, accessibilityLabel,
    accessibilityViewIsModal, importantForAccessibility }: {
    children?: React.ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityViewIsModal?: boolean;
    importantForAccessibility?: string;
  }) => R.createElement("div", {
    "data-a11y-role": accessibilityRole,
    "data-a11y-label": accessibilityLabel,
    "data-a11y-modal": String(!!accessibilityViewIsModal),
    "data-android-a11y": importantForAccessibility,
  }, children);
  return {
    Keyboard: { dismiss: () => undefined },
    View: Box,
    Modal: ({ visible, children, onRequestClose }: {
      visible: boolean; children?: React.ReactNode; onRequestClose?: () => void;
    }) => visible ? R.createElement("div", { "data-rn-modal": "true" },
      children,
      R.createElement("button", { "data-label": "Android onRequestClose", onClick: onRequestClose },
        "Android onRequestClose"),
    ) : null,
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityRole,
      accessibilityHint,
      accessibilityState,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityHint?: string;
      accessibilityState?: { expanded?: boolean; selected?: boolean };
    }) =>
      R.createElement("button", {
        "aria-label": accessibilityLabel,
        "data-a11y-role": accessibilityRole,
        "data-a11y-hint": accessibilityHint,
        "data-expanded": String(!!accessibilityState?.expanded),
        onClick: onPress,
      }, children),
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement("button", { "data-label": "pull", onClick: onRefresh }, "pull"),
    ScrollView: ({
      children,
      refreshControl,
    }: {
      children?: React.ReactNode;
      refreshControl?: React.ReactNode;
    }) => R.createElement("div", null, refreshControl, children),
    StyleSheet: { create: (x: unknown) => x, absoluteFill: {} },
    Text: ({ children, accessibilityRole }: {
      children?: React.ReactNode; accessibilityRole?: string;
    }) => R.createElement("span", { "data-a11y-role": accessibilityRole }, children),
    TextInput: ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (v: string) => void;
      accessibilityLabel: string;
    }) =>
      R.createElement("input", {
        value,
        "aria-label": accessibilityLabel,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value),
      }),
  };
});
import { QuestionsScreen } from "./QuestionsScreen";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
async function mount() {
  await act(async () => root.render(createElement(QuestionsScreen)));
}
async function press(label: string) {
  await act(async () => button(label)?.click());
}
async function search(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Поиск вопросов"]')!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.pending = false;
  m.isError = false;
  m.pageError = false;
  m.canPublish = true;
  m.hasNextPage = false;
  m.items = [];
  m.queryKeys = [];
  m.refresh.mockResolvedValue(undefined);
  m.next.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V55 mounted actual QuestionsScreen source/mock", () => {
  it("guest renders safe message without private query", async () => {
    m.authed = false;
    await mount();
    expect(host.textContent).toContain("войдите в аккаунт");
    expect(m.queryKeys).toHaveLength(0);
  });
  it("A→B→A new epoch uses separate cache identity and resets search", async () => {
    await mount();
    await search("секрет");
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    expect(m.queryKeys.at(-1)?.slice(1, 3)).toEqual(["A", "E2"]);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Поиск вопросов"]')?.value).toBe(
      "",
    );
  });
  it("unproven publication access cannot open form", async () => {
    m.pending = true;
    await mount();
    expect(button("Задать вопрос")?.disabled).toBe(true);
    m.pending = false;
    m.canPublish = false;
    await mount();
    expect(button("Задать вопрос")?.disabled).toBe(true);
    m.canPublish = true;
    await mount();
    await press("Задать вопрос");
    expect(m.push).toHaveBeenCalledWith("/questions/new");
  });
  it("query errors are neutral and publishing remains disabled", async () => {
    m.isError = true;
    await mount();
    expect(host.textContent).toContain("Не удалось загрузить вопросы");
    expect(host.textContent).not.toContain("PRIVATE_API_ERROR");
    expect(button("Задать вопрос")?.disabled).toBe(true);
  });
  it("failed next page preserves existing questions and gives a page-specific retry", async () => {
    m.items = [{ id: "existing-q", title: "Знакомый вопрос" }];
    m.hasNextPage = true;
    m.pageError = true;
    m.isError = true;
    await mount();
    expect(host.textContent).toContain("Знакомый вопрос");
    expect(host.textContent).not.toContain("Не удалось загрузить вопросы");
    expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).not.toContain("Вопросов пока нет");
    await press("Повторить загрузку");
    expect(m.next).toHaveBeenCalledOnce();
    m.pageError = false;
    m.isError = false;
    await mount();
    expect(host.textContent).not.toContain("Не удалось загрузить следующую страницу");
    expect(host.textContent).toContain("Знакомый вопрос");
  });

  it("simultaneous refresh requests use one flight; stale completion cannot touch view", async () => {
    const d = deferred<void>();
    m.refresh.mockReturnValueOnce(d.promise);
    await mount();
    await act(async () => {
      button("pull")?.click();
      button("pull")?.click();
    });
    expect(m.refresh).toHaveBeenCalledOnce();
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    await act(async () => d.resolve(undefined));
    expect(m.trace).not.toHaveBeenCalled();
  });
  it("rapid pagination makes one request and stale response has no callback", async () => {
    m.hasNextPage = true;
    const d = deferred<void>();
    m.next.mockReturnValueOnce(d.promise);
    await mount();
    await act(async () => {
      button("Ещё вопросы")?.click();
      button("Ещё вопросы")?.click();
    });
    expect(m.next).toHaveBeenCalledOnce();
    m.epoch = "E2";
    await mount();
    await act(async () => d.resolve(undefined));
    expect(m.trace).not.toHaveBeenCalled();
  });
  it("failed pull refresh traces only fixed code", async () => {
    m.refresh.mockRejectedValueOnce(Error("PRIVATE_API_ERROR"));
    await mount();
    await press("pull");
    expect(m.trace).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_API_ERROR");
  });
  it("stale item press cannot navigate after actor switch", async () => {
    m.items = [{ id: "q-A", title: "Секрет A" }];
    await mount();
    m.epoch = "E2";
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Секрет A"]')?.click(),
    );
    expect(m.push).not.toHaveBeenCalled();
  });
});

// SOC040_QUESTIONS_FILTER_ACCESSIBILITY — existing actual native composer and sheet.
const a11yTrigger = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const a11yGroup = (label: string) =>
  host.querySelector<HTMLElement>(`[data-a11y-role="radiogroup"][data-a11y-label="${label}"]`);

describe("SOC040_QUESTIONS_FILTER_ACCESSIBILITY native search, filter sheet and selections", () => {
  it("named search and expanded filter triggers expose named modal heading and three groups", async () => {
    await mount();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Поиск вопросов"]'))
      .not.toBeNull();
    const trigger = a11yTrigger("Фильтры вопросов");
    expect(trigger?.getAttribute("data-a11y-role")).toBe("button");
    expect(trigger?.getAttribute("data-expanded")).toBe("false");
    expect(a11yTrigger("Порядок вопросов")?.getAttribute("data-expanded")).toBe("false");
    await act(async () => trigger?.click());
    expect(a11yTrigger("Фильтры вопросов")?.getAttribute("data-expanded")).toBe("true");
    expect(a11yTrigger("Порядок вопросов")?.getAttribute("data-expanded")).toBe("true");
    expect(host.querySelector('[data-rn-modal="true"]')).not.toBeNull();
    expect(host.querySelector('[data-a11y-modal="true"][data-a11y-label="Фильтры вопросов"]'))
      .not.toBeNull();
    expect(host.querySelector('[data-a11y-modal="true"]')?.getAttribute("data-android-a11y"))
      .toBe("yes");
    expect(Array.from(host.querySelectorAll('[data-a11y-role="header"]'))
      .some(node => node.textContent === "Фильтры")).toBe(true);
    for (const group of ["Показывать", "Категория", "Статус"]) {
      expect(a11yGroup(group)).not.toBeNull();
    }
  });

  it("named groups preserve selected QButton state, immediate query keys, reset and apply", async () => {
    await mount();
    await act(async () => a11yTrigger("Порядок вопросов")?.click());
    expect(a11yGroup("Показывать")?.querySelector('[data-label="Новые"]')
      ?.getAttribute("data-selected")).toBe("true");
    await press("Активные");
    await press("Поведение");
    await press("Ждёт ответа");
    expect(a11yGroup("Показывать")?.querySelector('[data-label="Активные"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(a11yGroup("Категория")?.querySelector('[data-label="Поведение"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(a11yGroup("Статус")?.querySelector('[data-label="Ждёт ответа"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(m.queryKeys.at(-1)?.at(-1)).toMatchObject({
      sort: "active", category: "Поведение", status: "waiting",
    });
    const reset = a11yTrigger("Сбросить фильтры");
    expect(reset?.getAttribute("data-a11y-role")).toBe("button");
    await act(async () => reset?.click());
    expect(a11yGroup("Показывать")?.querySelector('[data-label="Новые"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(a11yGroup("Категория")?.querySelector('[data-label="Все категории"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(a11yGroup("Статус")?.querySelector('[data-label="Все"]')
      ?.getAttribute("data-selected")).toBe("true");
    expect(m.queryKeys.at(-1)?.at(-1)).toMatchObject({
      sort: "new", category: "", status: "",
    });
    await press("Показать вопросы");
    expect(host.querySelector('[data-rn-modal="true"]')).toBeNull();
    expect(a11yTrigger("Фильтры вопросов")?.getAttribute("data-expanded")).toBe("false");
  });

  it("backdrop, X and Android onRequestClose dismiss sheet without clearing selected filters", async () => {
    await mount();
    for (const mode of ["overlay", "close", "android"] as const) {
      await act(async () => a11yTrigger("Фильтры вопросов")?.click());
      expect(host.querySelector('[data-rn-modal="true"]')).not.toBeNull();
      await press("Активные");
      const dismiss = mode === "android"
        ? button("Android onRequestClose")
        : host.querySelectorAll<HTMLButtonElement>('button[aria-label="Закрыть фильтры"]')[
          mode === "overlay" ? 0 : 1
        ];
      expect(dismiss).toBeDefined();
      await act(async () => dismiss?.click());
      expect(host.querySelector('[data-rn-modal="true"]')).toBeNull();
      expect(a11yTrigger("Фильтры вопросов")?.getAttribute("data-expanded")).toBe("false");
      expect(m.queryKeys.at(-1)?.at(-1)).toMatchObject({ sort: "active" });
    }
  });
});
