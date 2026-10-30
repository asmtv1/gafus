// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  inputText: "синтетическое описание",
  report: vi.fn(),
  bookmark: vi.fn(),
  hidden: vi.fn(),
  guardedHidden: vi.fn(),
  invalidate: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const node = (tag: string) => (p: Record<string, unknown>) =>
    React.createElement(
      tag,
      {
        onClick: p.onPress,
        disabled: p.disabled,
        "data-role": p.accessibilityRole,
        "aria-label": p.accessibilityLabel,
      },
      p.children as React.ReactNode,
    );
  return {
    Alert: { alert: m.alert },
    KeyboardAvoidingView: node("div"),
    Modal: (p: Record<string, unknown>) => (p.visible === false ? null : node("section")(p)),
    Platform: { OS: "android" },
    Pressable: React.forwardRef((p: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({
        measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) =>
          cb(20, 30, 44, 44),
      }));
      return node("button")(p);
    }),
    ScrollView: node("div"),
    StyleSheet: { create: (v: unknown) => v, absoluteFill: {}, hairlineWidth: 1 },
    Text: node("span"),
    TextInput: (p: Record<string, unknown>) =>
      React.createElement(
        "button",
        {
          onClick: () => (p.onChangeText as (v: string) => void)(m.inputText),
          disabled: p.editable === false,
          "aria-label": p.accessibilityLabel,
        },
        "Изменить комментарий",
      ),
    View: node("div"),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
}));
vi.mock("@gafus/types", () => ({
  FEED_REPORT_REASONS: { spam: "Спам", abuse: "Оскорбление" },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "#455",
    text: "#000",
    textSecondary: "#777",
    cardBackground: "#fff",
    error: "#c00",
  },
  FONTS: { montserrat: "synthetic", montserratMedium: "synthetic" },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedReportGuarded: (...args: unknown[]) => m.report(...args),
  feedApi: {
    setBookmark: (...args: unknown[]) => m.bookmark(...args),
    setAuthorPreference: (...args: unknown[]) => m.hidden(...args),
  },
  feedAuthorPreferenceGuarded: (...args: unknown[]) => m.guardedHidden(...args),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.epoch ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create<{
      user: { id: string } | null;
      isAuthenticated: boolean;
      isLoading: boolean;
    }>(() => ({ user: { id: "A" }, isAuthenticated: true, isLoading: false })),
  };
});
import { useAuthStore } from "@/shared/stores";
import { FeedPostActions } from "./FeedPostActions";
import type { FeedPostDto } from "@gafus/types";
const fixtureUser = (id: string) => ({
  id,
  username: id.toLowerCase(),
  phone: null,
  email: null,
  role: "USER" as const,
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function find(text: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll("button")).find((v) => v.textContent?.includes(text)) ?? null
  );
}
async function click(text: string) {
  const button = find(text);
  expect(button, `Expected action ${text}`).not.toBeNull();
  await act(async () => button?.click());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function switchActor(owner: string, epoch: string) {
  m.owner = owner;
  m.epoch = epoch;
  await act(async () => useAuthStore.setState({ user: fixtureUser(owner), isAuthenticated: true }));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.report.mockResolvedValue({ id: "report-1" });
  m.bookmark.mockReset().mockResolvedValue({ saved: true });
  m.hidden.mockReset().mockResolvedValue({ hidden: true, notify: false });
  m.guardedHidden.mockReset().mockResolvedValue({ hidden: true, notify: false });
  m.invalidate.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ user: fixtureUser("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function syntheticPost(authorId = "AUTHOR"): FeedPostDto {
  return {
    id: "post-A",
    author: { id: authorId },
    canDelete: false,
    canEdit: false,
    bookmarked: false,
    authorNotify: false,
    recommendationReason: null,
  } as FeedPostDto;
}
async function mountPost(post = syntheticPost()) {
  await act(async () =>
    root.render(createElement(FeedPostActions, { post, onEdit: vi.fn(), onDelete: vi.fn() })),
  );
}
async function openMenu() {
  const button = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Действия с публикацией"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}
function undoAlert() {
  for (const call of m.alert.mock.calls) {
    const buttons = call[2] as undefined | { text?: string; onPress?: () => void }[];
    const undo = buttons?.find((b) => b.text === "Отменить");
    if (undo?.onPress) return undo.onPress;
  }
  return null;
}

describe("AG3 V76 mounted feed hide/unhide actor scope and ACK", () => {
  it("guest, missing binding and own author never show hide/notify menu rows", async () => {
    await mountPost();
    await openMenu();
    expect(find("Скрыть автора")).not.toBeNull();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await openMenu();
    expect(find("Скрыть автора")).toBeNull();
    await switchActor("AUTHOR", "E2");
    await mountPost(syntheticPost("AUTHOR"));
    await openMenu();
    expect(find("Скрыть автора")).toBeNull();
    expect(m.guardedHidden).not.toHaveBeenCalled();
  });
  it("double same-turn hide taps dispatch one guarded PATCH and confirmed ACK offers undo", async () => {
    const wait = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    const hide = find("Скрыть автора");
    await act(async () => {
      hide?.click();
      hide?.click();
    });
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
    expect(m.guardedHidden.mock.calls[0].slice(0, 2)).toEqual(["AUTHOR", { hidden: true }]);
    expect(m.guardedHidden.mock.calls[0][2]()).toBe(true);
    await act(async () => wait.resolve({ hidden: true, notify: false }));
    expect(undoAlert()).not.toBeNull();
  });
  it("positive ACK survives cache invalidation failure; undo sends exactly one guarded false", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("cache-failure"));
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    expect(undoAlert()).not.toBeNull();
    expect(m.alert.mock.calls[0][1]).toContain("скрыты");
    m.guardedHidden.mockResolvedValueOnce({ hidden: false, notify: false });
    const undo = undoAlert();
    await act(async () => undo?.());
    expect(m.guardedHidden).toHaveBeenCalledTimes(2);
    expect(m.guardedHidden.mock.calls[1].slice(0, 2)).toEqual(["AUTHOR", { hidden: false }]);
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("снова видны");
  });
  it("unknown timeout never replays hide, shows only static error and disables second hide", async () => {
    m.guardedHidden.mockRejectedValueOnce(new Error("Bearer synthetic-secret private-media-url"));
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("synthetic-secret");
    await openMenu();
    await click("Скрыть автора");
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
  });
  it("stale hide ACK after A->B->A must not show alert or open old menu", async () => {
    const wait = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    const guard = m.guardedHidden.mock.calls[0][2] as () => boolean;
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => wait.resolve({ hidden: true, notify: false }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(find("Скрыть автора")).toBeNull();
  });
  it("old undo alert callback after logout does not send a new PATCH", async () => {
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    const undo = undoAlert();
    expect(undo).not.toBeNull();
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    await act(async () => undo?.());
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
  });
  it("unmount during pending PATCH prevents late alert and cache effect", async () => {
    const wait = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ hidden: true, notify: false }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("mismatched ACK is UNKNOWN and old undo cannot dispatch", async () => {
    m.guardedHidden.mockResolvedValueOnce({ hidden: false, notify: false });
    await mountPost();
    await openMenu();
    await click("Скрыть автора");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(undoAlert()).toBeNull();
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
  });
});
