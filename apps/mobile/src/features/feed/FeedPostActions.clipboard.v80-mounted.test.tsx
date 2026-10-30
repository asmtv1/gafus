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
  clipboard: vi.fn(),
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
vi.mock("expo-clipboard", () => ({ setStringAsync: (...args: unknown[]) => m.clipboard(...args) }));
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
  m.clipboard.mockReset().mockResolvedValue(undefined);
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

describe("AG3 V80 actual Feed menu public copy link", () => {
  it("copies exact encoded public post URL with existing Expo clipboard on guest", async () => {
    await mountPost({ ...syntheticPost(), id: "post/hello world" } as FeedPostDto);
    await act(async () => useAuthStore.setState({ isAuthenticated: false, user: null }));
    await openMenu();
    await click("Скопировать ссылку");
    expect(m.clipboard).toHaveBeenCalledExactlyOnceWith(
      "https://gafus.ru/feed/post%2Fhello%20world",
    );
    expect(m.alert).toHaveBeenCalledWith("Моменты", "Ссылка скопирована");
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("successful clipboard ACK survives unrelated feed-query cache invalidation failures", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("mock feed cache down"));
    await mountPost();
    await openMenu();
    await click("Скопировать ссылку");
    expect(m.clipboard).toHaveBeenCalledExactlyOnceWith("https://gafus.ru/feed/post-A");
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.alert).toHaveBeenCalledWith("Моменты", "Ссылка скопирована");
  });
  it("immediate doubletap on copy action is event-time single-flight", async () => {
    const pending = deferred<void>();
    m.clipboard.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    const copy = find("Скопировать ссылку");
    await act(async () => {
      copy?.click();
      copy?.click();
    });
    expect(m.clipboard).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(m.alert).toHaveBeenCalledExactlyOnceWith("Моменты", "Ссылка скопирована");
  });
  it("native clipboard failure shows sanitized error and does not claim success", async () => {
    const secret = "Bearer private key https://signed/private?X-Amz-Credential=unsafe";
    m.clipboard.mockRejectedValueOnce(new Error(secret));
    await mountPost();
    await openMenu();
    await click("Скопировать ссылку");
    expect(m.alert).toHaveBeenCalledWith("Моменты", "Не удалось скопировать ссылку.");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain(secret);
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("old native completion after unmount never opens a stale success alert", async () => {
    const pending = deferred<void>();
    m.clipboard.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    await click("Скопировать ссылку");
    await act(async () => root.unmount());
    await act(async () => pending.resolve());
    expect(m.alert).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("old clipboard completion after actor A->B->A does not emit old toast", async () => {
    const pending = deferred<void>();
    m.clipboard.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    await click("Скопировать ссылку");
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    await act(async () => pending.resolve());
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
});
