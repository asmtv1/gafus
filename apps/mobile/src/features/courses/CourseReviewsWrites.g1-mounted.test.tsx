// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  authLoading: false,
  courseType: "basics",
  loading: false,
  error: false,
  rows: [] as {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { id: string; username: string; profile: null };
  }[],
  keys: [] as unknown[][],
  options: [] as { queryKey: unknown[]; queryFn: () => Promise<unknown> }[],
  refetch: vi.fn(),
  getReviews: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  trace: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  client: { invalidateQueries: (...v: unknown[]) => m.invalidate(...v) },
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authed ? { id: m.owner } : null,
    isAuthenticated: m.authed,
    isLoading: m.authLoading,
  });
  return {
    useAuthStore: Object.assign((f: (s: ReturnType<typeof state>) => unknown) => f(state()), {
      getState: state,
    }),
  };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
vi.mock("@/shared/lib/api/courses", () => ({
  coursesApi: {
    getReviews: (...v: unknown[]) => m.getReviews(...v),
    createReview: (...v: unknown[]) => m.create(...v),
    updateReview: (...v: unknown[]) => m.update(...v),
    deleteReview: (...v: unknown[]) => m.remove(...v),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => m.client,
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    m.options.push(options);
    m.keys.push(options.queryKey);
    return {
      data:
        m.loading || m.error
          ? undefined
          : {
              data: {
                courseName: "Базовый курс",
                reviews: m.rows,
                userStatus: {
                  hasCompleted: true,
                  userReview: m.rows.find((review) => review.user.id === m.owner) ?? null,
                },
              },
            },
      isLoading: m.loading,
      isError: m.error,
      refetch: () => m.refetch(),
    };
  },
  useMutation: () => ({ isPending: false, mutate: (...v: unknown[]) => m.mutate(...v) }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: () => m.back() }),
  useLocalSearchParams: () => ({ courseType: m.courseType }),
  Stack: { Screen: () => null },
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "white",
    text: "black",
    textSecondary: "gray",
    primary: "olive",
    cardBackground: "white",
  },
  FONTS: { montserrat: "a", impact: "c" },
  SPACING: { md: 12, sm: 8, xs: 4 },
}));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { success: vi.fn() } }));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
    AppBackButton: ({ onPress }: { onPress: () => void }) =>
      R.createElement("button", { onClick: onPress }, "Назад"),
  };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Loading: () => R.createElement("span", null, "Загрузка отзывов..."),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => R.createElement("button", { "aria-label": label, onClick: onPress, disabled }, label),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children, accessible }: { children?: React.ReactNode; accessible?: boolean }) =>
      R.createElement("span", { "aria-hidden": accessible === false ? true : undefined }, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children, accessible, accessibilityRole, accessibilityLabel }: {
    children?: React.ReactNode; accessible?: boolean;
    accessibilityRole?: string; accessibilityLabel?: string;
  }) => R.createElement("div", {
    role: accessible ? accessibilityRole : undefined,
    "aria-label": accessible ? accessibilityLabel : undefined,
  }, children);
  return {
    View: Box,
    ScrollView: Box,
    StyleSheet: { create: (v: unknown) => v },
    Alert: { alert: (...v: unknown[]) => m.alert(...v) },
    Pressable: ({
      children, onPress, disabled, accessibilityRole, accessibilityLabel, accessibilityState,
    }: {
      children?: React.ReactNode; onPress?: () => void; disabled?: boolean;
      accessibilityRole?: string; accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean; disabled?: boolean };
    }) => R.createElement("button", {
      disabled, onClick: onPress, role: accessibilityRole,
      "aria-label": accessibilityLabel,
      "aria-checked": accessibilityState?.selected,
    }, children),
    TextInput: ({
      value, onChangeText, editable, multiline, accessibilityLabel, accessibilityHint,
    }: {
      value?: string; onChangeText?: (value: string) => void; editable?: boolean;
      multiline?: boolean; accessibilityLabel?: string; accessibilityHint?: string;
    }) => R.createElement(multiline ? "textarea" : "input", {
      value, disabled: editable === false, "aria-label": accessibilityLabel,
      "data-accessibility-hint": accessibilityHint,
      "aria-multiline": multiline ? true : undefined,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
        onChangeText?.(event.currentTarget.value),
    }),
  };
});
import ReviewsScreen from "../../../app/(main)/training/[courseType]/reviews";
let root: Root, host: HTMLDivElement;
const gate = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(ReviewsScreen)));
}
beforeEach(() => {
  vi.resetAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.authLoading = false;
  m.courseType = "basics";
  m.loading = false;
  m.error = false;
  m.rows = [];
  m.keys = [];
  m.options = [];
  m.refetch.mockResolvedValue(undefined);
  m.invalidate.mockResolvedValue(undefined);
  m.create.mockResolvedValue({ success: true });
  m.update.mockResolvedValue({ success: true });
  m.remove.mockResolvedValue({ success: true });
  m.getReviews.mockResolvedValue({
    success: true,
    data: {
      courseName: "Базовый курс",
      reviews: [],
      userStatus: {
        hasCompleted: true,
        userReview: m.rows.find((review) => review.user.id === m.owner) ?? null,
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const ownReview = () => ({
  id: "review-1",
  rating: 3,
  comment: "Отлично",
  createdAt: "2026-10-20T10:00:00Z",
  user: { id: "A", username: "owner-A", profile: null },
});
const chooseRating = async (value: number) =>
  act(async () => {
    const hearts = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter(
      (b) => b.textContent === "♡" || b.textContent === "♥",
    );
    expect(hearts).toHaveLength(5);
    hearts[value - 1]?.click();
  });
const send = async () =>
  act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Отправить"]')?.click());
const edit = async () =>
  act(async () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent?.includes("✏️"))
      ?.click(),
  );
const remove = async () =>
  act(async () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent?.includes("🗑️"))
      ?.click(),
  );
describe("AG3 V68 actual course review mutations mounted", () => {
  it("positive create ACK follows one POST despite doubletap", async () => {
    const pending = gate<{ success: boolean }>();
    m.create.mockReturnValueOnce(pending.promise);
    await render();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Отправить"]')?.disabled).toBe(
      true,
    );
    await chooseRating(4);
    await act(async () => {
      const b = host.querySelector<HTMLButtonElement>('button[aria-label="Отправить"]');
      b?.click();
      b?.click();
    });
    expect(m.create).toHaveBeenCalledExactlyOnceWith("basics", 4, "");
    expect(m.invalidate).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true }));
    expect(m.invalidate).toHaveBeenCalledTimes(2);
    expect(m.alert.mock.calls.some((v) => v[0] === "Успех")).toBe(true);
    await send();
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("API success false is UNKNOWN and no optimistic success or cache ACK", async () => {
    m.create.mockResolvedValueOnce({ success: false, error: "PRIVATE_400" });
    await render();
    await chooseRating(3);
    await send();
    await send();
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат изменения неизвестен");
    expect(m.alert.mock.calls.some((v) => v[0] === "Успех")).toBe(false);
    expect(host.textContent).not.toContain("PRIVATE_400");
  });
  it("transport failure locks retry and hides private stack", async () => {
    m.create.mockRejectedValueOnce(Error("PRIVATE_STACK"));
    await render();
    await chooseRating(5);
    await send();
    await send();
    expect(m.create).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_STACK");
    expect(host.textContent).toContain("Результат изменения неизвестен");
  });
  it("cache error following ACK is a successful write", async () => {
    m.invalidate.mockRejectedValueOnce(Error("PRIVATE_CACHE"));
    await render();
    await chooseRating(2);
    await send();
    expect(m.create).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Изменение сохранено");
    expect(host.textContent).not.toContain("Результат изменения неизвестен");
  });
  it("old A POST ACK after A→B→A does not update new actor cache", async () => {
    const pending = gate<{ success: boolean }>();
    m.create.mockReturnValueOnce(pending.promise);
    await render();
    await chooseRating(4);
    await send();
    m.owner = "B";
    m.epoch = "B1";
    await render();
    m.owner = "A";
    m.epoch = "E2";
    await render();
    await act(async () => pending.resolve({ success: true }));
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert.mock.calls.some((v) => v[0] === "Успех")).toBe(false);
  });
  it("edit own review PATCH and block duplicate after ACK", async () => {
    m.rows = [ownReview()];
    await render();
    await edit();
    expect(host.textContent).toContain("Редактировать отзыв");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Сохранить"]')?.click(),
    );
    expect(m.update).toHaveBeenCalledExactlyOnceWith("review-1", 3, "Отлично");
    expect(m.invalidate).toHaveBeenCalledTimes(2);
    await edit();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Сохранить"]')?.click(),
    );
    expect(m.update).toHaveBeenCalledOnce();
  });
  it("delete needs confirmation and duplicate confirmation sends one DELETE", async () => {
    m.rows = [ownReview()];
    const pending = gate<{ success: boolean }>();
    m.remove.mockReturnValueOnce(pending.promise);
    await render();
    await remove();
    expect(m.remove).not.toHaveBeenCalled();
    const actions = m.alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const ok = actions.find((x) => x.text === "Удалить")!;
    await act(async () => {
      ok.onPress?.();
      ok.onPress?.();
    });
    expect(m.remove).toHaveBeenCalledExactlyOnceWith("review-1");
    await act(async () => pending.resolve({ success: true }));
    expect(m.invalidate).toHaveBeenCalledTimes(2);
    await act(async () => ok.onPress?.());
    expect(m.remove).toHaveBeenCalledOnce();
  });
  it("stale delete confirmation after epoch switch cannot write", async () => {
    m.rows = [ownReview()];
    await render();
    await remove();
    const actions = m.alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    m.epoch = "E2";
    await act(async () => actions.find((x) => x.text === "Удалить")?.onPress?.());
    expect(m.remove).not.toHaveBeenCalled();
  });
});


// ACCESSIBLE_COURSE_REVIEW_RATING: RN props projected into nearest mounted DOM harness.
const semanticRadios = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
const labeledComment = () => host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Комментарий"]');
const fillAccessibleComment = async (text: string) => {
  const input = labeledComment();
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
describe("ACCESSIBLE_COURSE_REVIEW_RATING create and edit semantics", () => {
  it("five named, selected radio controls permit rating and explicitly labelled multiline comment submission", async () => {
    await render();
    const radios = semanticRadios();
    expect(radios).toHaveLength(5);
    expect(radios.map(r => r.getAttribute("aria-label"))).toEqual([
      "Оценка 1 из 5", "Оценка 2 из 5", "Оценка 3 из 5",
      "Оценка 4 из 5", "Оценка 5 из 5",
    ]);
    expect(radios.map(r => r.getAttribute("aria-checked")))
      .toEqual(["false", "false", "false", "false", "false"]);
    expect(labeledComment()?.getAttribute("aria-multiline")).toBe("true");
    await act(async () => radios[3]?.click());
    expect(semanticRadios().map(r => r.getAttribute("aria-checked")))
      .toEqual(["false", "false", "false", "true", "false"]);
    await fillAccessibleComment("Понятный курс и хорошие упражнения");
    expect(labeledComment()?.value).toBe("Понятный курс и хорошие упражнения");
    await send();
    expect(m.create).toHaveBeenCalledExactlyOnceWith(
      "basics", 4, "Понятный курс и хорошие упражнения",
    );
  });

  it("edit exposes preselected stored rating and labelled prefilled comment, then preserves PATCH arguments", async () => {
    m.rows = [ownReview()];
    await render();
    expect(host.querySelector('[role="text"][aria-label="Оценка 3 из 5"]')).not.toBeNull();
    await edit();
    expect(semanticRadios()).toHaveLength(5);
    expect(semanticRadios().map(r => r.getAttribute("aria-checked")))
      .toEqual(["false", "false", "true", "false", "false"]);
    expect(labeledComment()?.value).toBe("Отлично");
    await act(async () => semanticRadios()[4]?.click());
    await fillAccessibleComment("Дополненный отзыв");
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Сохранить"]')?.click());
    expect(m.update).toHaveBeenCalledExactlyOnceWith("review-1", 5, "Дополненный отзыв");
  });
});
