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
  feedback: vi.fn(),
  guardedFeedback: vi.fn(),
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
    setPostFeedback: (...args: unknown[]) => m.feedback(...args),
  },
  feedAuthorPreferenceGuarded: (...args: unknown[]) => m.guardedHidden(...args),
  feedBookmarkGuarded: (...args: unknown[]) => m.guardedBookmark(...args),
  feedPostFeedbackGuarded: (...args: unknown[]) => m.guardedFeedback(...args),
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
vi.mock("@/shared/components/gestures/SwipeDismissHandle", () => ({
  SwipeDismissHandle: () => null,
}));
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
  m.feedback.mockReset().mockResolvedValue({ saved: true });
  m.guardedFeedback.mockReset().mockResolvedValue({ saved: true });
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

function recommendedPost(authorId = "AUTHOR"): FeedPostDto {
  return { ...syntheticPost(authorId), recommendationReason: "discovery" } as FeedPostDto;
}

describe("AG3 V79 actual mounted not_interested feedback", () => {
  it("guest or lost verified actor hides feedback action, retains explanation and public link", async () => {
    await mountPost(recommendedPost());
    await openMenu();
    expect(find("Не интересно")).not.toBeNull();
    await act(async () => useAuthStore.setState({ isAuthenticated: false, user: null }));
    await openMenu();
    expect(find("Не интересно")).toBeNull();
    expect(find("Скопировать ссылку")).not.toBeNull();
    expect(m.guardedFeedback).not.toHaveBeenCalled();
    await switchActor("A", "E2");
    m.epoch = "";
    await act(async () => useAuthStore.setState({ user: fixtureUser("A") }));
    await openMenu();
    expect(find("Не интересно")).toBeNull();
  });
  it("keeps original recommendation-only semantics; ordinary and own posts have no feedback", async () => {
    await mountPost(syntheticPost());
    await openMenu();
    expect(find("Не интересно")).toBeNull();
    await mountPost({ ...recommendedPost("A"), canDelete: true } as FeedPostDto);
    await openMenu();
    expect(find("Не интересно")).toBeNull();
    expect(m.guardedFeedback).not.toHaveBeenCalled();
  });
  it("same-batch double tap performs one guarded existing feedback POST and exact ACK", async () => {
    const pending = deferred<{ saved: boolean }>();
    m.guardedFeedback.mockReturnValueOnce(pending.promise);
    await mountPost(recommendedPost());
    await openMenu();
    const button = find("Не интересно");
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(m.guardedFeedback).toHaveBeenCalledExactlyOnceWith("post-A", expect.any(Function));
    expect((m.guardedFeedback.mock.calls[0][1] as () => boolean)()).toBe(true);
    await act(async () => pending.resolve({ saved: true }));
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("больше не будет");
  });
  it("confirmed server saved true persists through cache invalidation failure without another feedback call", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("synthetic cache read error"));
    await mountPost(recommendedPost());
    await openMenu();
    await click("Не интересно");
    expect(m.guardedFeedback).toHaveBeenCalledTimes(1);
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("больше не будет");
    await openMenu();
    expect(find("Не интересно")).toBeNull();
    expect(m.guardedFeedback).toHaveBeenCalledTimes(1);
  });
  it("unknown timeout has privacy-safe alert, disables repeated mutation without auto replay", async () => {
    const secret = "Bearer raw-private-data https://signed-image/?token=private";
    m.guardedFeedback.mockRejectedValueOnce(new Error(secret));
    await mountPost(recommendedPost());
    await openMenu();
    await click("Не интересно");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    await openMenu();
    await click("Не интересно");
    expect(m.guardedFeedback).toHaveBeenCalledTimes(1);
  });
  it("positive-looking but saved false/malformed ACK cannot claim accepted recommendation", async () => {
    m.guardedFeedback.mockResolvedValueOnce({ saved: false });
    await mountPost(recommendedPost());
    await openMenu();
    await click("Не интересно");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.alert.mock.calls.at(-1)?.[1]).not.toContain("больше не будет");
    expect(m.guardedFeedback).toHaveBeenCalledTimes(1);
  });
  it("A->B->A authEpoch fence discards late ACK, old actor cache and toast", async () => {
    const pending = deferred<{ saved: boolean }>();
    m.guardedFeedback.mockReturnValueOnce(pending.promise);
    await mountPost(recommendedPost());
    await openMenu();
    await click("Не интересно");
    const oldGuard = m.guardedFeedback.mock.calls[0][1] as () => boolean;
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    expect(oldGuard()).toBe(false);
    await act(async () => pending.resolve({ saved: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(find("Не интересно")).toBeNull();
  });
  it("unmount before ACK never invalidates cache or shows a success", async () => {
    const pending = deferred<{ saved: boolean }>();
    m.guardedFeedback.mockReturnValueOnce(pending.promise);
    await mountPost(recommendedPost());
    await openMenu();
    await click("Не интересно");
    await act(async () => root.unmount());
    await act(async () => pending.resolve({ saved: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
