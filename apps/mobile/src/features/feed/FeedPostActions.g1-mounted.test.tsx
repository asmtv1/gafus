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
  guardedBookmark: vi.fn(),
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
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
  feedBookmarkGuarded: (...args: unknown[]) => m.guardedBookmark(...args),
  feedApi: { setBookmark: (...args: unknown[]) => m.bookmark(...args) },
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
import { FeedPostActions, FeedReportButton } from "./FeedPostActions";
import { reportClientError } from "@/shared/lib/tracer";
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
async function render() {
  await act(async () =>
    root.render(createElement(FeedReportButton, { type: "comment", id: "c1", authorId: "AUTHOR" })),
  );
}
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
  m.guardedBookmark.mockReset().mockResolvedValue({ saved: true });
  useAuthStore.setState({ user: fixtureUser("A"), isAuthenticated: true, isLoading: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("actual mounted Feed report action with verified actor", () => {
  it("unverified guest and same-author report buttons cannot initiate POST", async () => {
    await render();
    expect(find("Пожаловаться")).not.toBeNull();
    await act(async () => useAuthStore.setState({ isAuthenticated: false, user: null }));
    expect(find("Пожаловаться")).toBeNull();
    await act(async () =>
      useAuthStore.setState({ isAuthenticated: true, user: fixtureUser("AUTHOR") }),
    );
    m.owner = "AUTHOR";
    expect(find("Пожаловаться")).toBeNull();
    expect(m.report).not.toHaveBeenCalled();
  });
  it("valid ACK closes once with fixed success and verified request guard", async () => {
    let guardAtDispatch = false;
    m.report.mockImplementation(async (_type, _id, _body, guard: () => boolean) => {
      guardAtDispatch = guard();
      return { id: "report-1" };
    });
    await render();
    await click("Пожаловаться");
    await click("Изменить комментарий");
    await click("Отправить жалобу");
    expect(m.report).toHaveBeenCalledOnce();
    expect(m.report.mock.calls[0].slice(0, 3)).toEqual([
      "comment",
      "c1",
      { reason: "spam", comment: m.inputText },
    ]);
    expect(guardAtDispatch).toBe(true);
    // The successful ACK closed and unmounted the actor-bound sheet.
    expect(m.report.mock.calls[0][3]()).toBe(false);
    expect(m.alert).toHaveBeenCalledWith("Жалоба отправлена", "Мы рассмотрим её. Спасибо.");
  });
  it("double tap in same React batch dispatches one POST; close disabled while pending", async () => {
    const wait = deferred<{ id: string }>();
    m.report.mockReturnValueOnce(wait.promise);
    await render();
    await click("Пожаловаться");
    const send = find("Отправить жалобу");
    await act(async () => {
      send?.click();
      send?.click();
    });
    expect(m.report).toHaveBeenCalledOnce();
    await click("Закрыть");
    expect(host.textContent).toContain("Отправляем");
    await act(async () => wait.resolve({ id: "report-2" }));
    expect(m.alert).toHaveBeenCalledOnce();
  });
  it("network unknown never shows raw exception or dispatches second POST", async () => {
    const secret = "Bearer sensitive-private-marker https://signed.url/?key=secret";
    m.report.mockRejectedValue(new Error(secret));
    await render();
    await click("Пожаловаться");
    await click("Отправить жалобу");
    expect(host.textContent).toContain("Результат отправки жалобы неизвестен");
    expect(host.textContent).not.toContain(secret);
    await click("Отправить жалобу");
    expect(m.report).toHaveBeenCalledOnce();
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("malformed positive ACK is UNKNOWN, not fabricated confirmation", async () => {
    m.report.mockResolvedValue({});
    await render();
    await click("Пожаловаться");
    await click("Отправить жалобу");
    expect(host.textContent).toContain("Результат отправки жалобы неизвестен");
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("A->B->A fresh auth epoch during pending POST fences old completion", async () => {
    const wait = deferred<{ id: string }>();
    m.report.mockReturnValueOnce(wait.promise);
    await render();
    await click("Пожаловаться");
    await click("Отправить жалобу");
    const oldGuard = m.report.mock.calls[0][3] as () => boolean;
    await switchActor("B", "BE1");
    expect(host.textContent).not.toContain("Отправить жалобу");
    await switchActor("A", "E2");
    // No modal state from A/E1 may be restored into A/E2 automatically.
    expect(host.textContent).not.toContain("Отправить жалобу");
    expect(oldGuard()).toBe(false);
    await act(async () => wait.resolve({ id: "old-ack" }));
    expect(m.alert).not.toHaveBeenCalled();
  });
  it("unmount before late ACK never emits success or unhandled mutation callback", async () => {
    const wait = deferred<{ id: string }>();
    m.report.mockReturnValueOnce(wait.promise);
    await render();
    await click("Пожаловаться");
    await click("Отправить жалобу");
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ id: "old-ack" }));
    expect(m.alert).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("actual post menu routes report through guarded sheet", async () => {
    const post = {
      id: "p1",
      bookmarked: false,
      canDelete: false,
      canEdit: false,
      author: { id: "AUTHOR" },
      recommendationReason: null,
    } as FeedPostDto;
    await act(async () =>
      root.render(createElement(FeedPostActions, { post, onEdit: vi.fn(), onDelete: vi.fn() })),
    );
    const menu = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Действия с публикацией"]',
    );
    expect(menu).not.toBeNull();
    await act(async () => menu?.click());
    await click("Пожаловаться");
    await click("Отправить жалобу");
    expect(m.report).toHaveBeenCalledExactlyOnceWith(
      "post",
      "p1",
      { reason: "spam" },
      expect.any(Function),
    );
    expect(m.alert).toHaveBeenCalledWith("Жалоба отправлена", "Мы рассмотрим её. Спасибо.");
  });
  it("post menu failure never displays provider error or signed URL", async () => {
    const post = {
      id: "p1",
      bookmarked: false,
      canDelete: true,
      canEdit: false,
      author: { id: "A" },
      recommendationReason: null,
    } as FeedPostDto;
    const secret = "Bearer provider-private https://signed.file/?token=unsafe";
    m.guardedBookmark.mockRejectedValueOnce(new Error(secret));
    await act(async () =>
      root.render(createElement(FeedPostActions, { post, onEdit: vi.fn(), onDelete: vi.fn() })),
    );
    const menu = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Действия с публикацией"]',
    );
    await act(async () => menu?.click());
    await click("Сохранить в закладках");
    expect(m.guardedBookmark).toHaveBeenCalledExactlyOnceWith("p1", true, expect.any(Function));
    expect((m.guardedBookmark.mock.calls[0][2] as () => boolean)()).toBe(true);
    expect(m.alert).toHaveBeenCalledWith(
      "Моменты",
      "Результат сохранения в закладках неизвестен. Проверьте результат перед повторной попыткой.",
    );
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toContain(secret);
  });
  it("verified actor switch to missing epoch prevents submission", async () => {
    await render();
    await click("Пожаловаться");
    m.epoch = "";
    await act(async () => useAuthStore.setState({ user: fixtureUser("A") }));
    await click("Отправить жалобу");
    expect(m.report).not.toHaveBeenCalled();
  });
});
