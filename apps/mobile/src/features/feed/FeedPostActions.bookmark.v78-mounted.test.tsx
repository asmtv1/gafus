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
  feedBookmarkGuarded: (...args: unknown[]) => m.guardedBookmark(...args),
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
  m.guardedBookmark.mockReset().mockResolvedValue({ saved: true });
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
describe("AG3 V78 actual mounted feed bookmark actor guard and ACK", () => {
  it("guest cannot mutate bookmark while copy-link menu stays available", async () => {
    await mountPost();
    await openMenu();
    expect(find("Сохранить в закладках")).not.toBeNull();
    await act(async () => useAuthStore.setState({ user: null, isAuthenticated: false }));
    await openMenu();
    expect(find("Сохранить в закладках")).toBeNull();
    expect(find("Скопировать ссылку")).not.toBeNull();
    expect(m.guardedBookmark).not.toHaveBeenCalled();
  });
  it("double tap sends a single guarded bookmark PUT and exact success ACK", async () => {
    const wait = deferred<{ saved: boolean }>();
    m.guardedBookmark.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    const button = find("Сохранить в закладках");
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(m.guardedBookmark).toHaveBeenCalledTimes(1);
    expect(m.guardedBookmark.mock.calls[0].slice(0, 2)).toEqual(["post-A", true]);
    expect((m.guardedBookmark.mock.calls[0][2] as () => boolean)()).toBe(true);
    await act(async () => wait.resolve({ saved: true }));
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("сохранена");
  });
  it("positive ACK with cache failure still succeeds and label toggles to unbookmark", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("synthetic cache fault"));
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("сохранена");
    await openMenu();
    expect(find("Убрать из закладок")).not.toBeNull();
    expect(find("Сохранить в закладках")).toBeNull();
  });
  it("confirmed explicit unbookmark sends one guarded DELETE and no duplicate", async () => {
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    m.guardedBookmark.mockResolvedValueOnce({ saved: false });
    await openMenu();
    await click("Убрать из закладок");
    expect(m.guardedBookmark).toHaveBeenCalledTimes(2);
    expect(m.guardedBookmark.mock.calls[1].slice(0, 2)).toEqual(["post-A", false]);
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("убрана");
  });
  it("lost-ACK or malformed server ACK remains UNKNOWN; cannot repeat same action", async () => {
    m.guardedBookmark.mockRejectedValueOnce(new Error("Bearer leaked-private-token"));
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("leaked-private");
    await openMenu();
    await click("Сохранить в закладках");
    expect(m.guardedBookmark).toHaveBeenCalledTimes(1);
  });
  it("ack saved false for save request never claims saved", async () => {
    m.guardedBookmark.mockResolvedValueOnce({ saved: false });
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.guardedBookmark).toHaveBeenCalledTimes(1);
  });
  it("A->B->A pending bookmark old ACK cannot update menu or show success", async () => {
    const wait = deferred<{ saved: boolean }>();
    m.guardedBookmark.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    const guard = m.guardedBookmark.mock.calls[0][2] as () => boolean;
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => wait.resolve({ saved: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("unmount while bookmark pending fences late response", async () => {
    const wait = deferred<{ saved: boolean }>();
    m.guardedBookmark.mockReturnValueOnce(wait.promise);
    await mountPost();
    await openMenu();
    await click("Сохранить в закладках");
    await act(async () => root.unmount());
    await act(async () => wait.resolve({ saved: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
