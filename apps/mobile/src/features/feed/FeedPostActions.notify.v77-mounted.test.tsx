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
  m.guardedHidden.mockReset().mockResolvedValue({ hidden: false, notify: true });
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
describe("AG3 V77 actual mounted author notification preference", () => {
  it("two taps in the same turn issue just one guarded notify:true PATCH", async () => {
    const pending = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    const button = find("Уведомлять о постах");
    await act(async () => {
      button?.click();
      button?.click();
    });
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
    expect(m.guardedHidden.mock.calls[0].slice(0, 2)).toEqual(["AUTHOR", { notify: true }]);
    expect((m.guardedHidden.mock.calls[0][2] as () => boolean)()).toBe(true);
    await act(async () => pending.resolve({ hidden: false, notify: true }));
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("Подписка включена");
  });
  it("positive notification ACK survives broken cache and flips displayed menu to disable", async () => {
    m.invalidate.mockRejectedValueOnce(new Error("fake cache failure"));
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("Подписка включена");
    await openMenu();
    expect(find("Отключить уведомления")).not.toBeNull();
    expect(find("Уведомлять о постах")).toBeNull();
  });
  it("explicit disable after positive notify ACK issues only one notify:false PATCH", async () => {
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    m.guardedHidden.mockResolvedValueOnce({ hidden: false, notify: false });
    await openMenu();
    await click("Отключить уведомления");
    expect(m.guardedHidden).toHaveBeenCalledTimes(2);
    expect(m.guardedHidden.mock.calls[1].slice(0, 2)).toEqual(["AUTHOR", { notify: false }]);
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("Уведомления отключены");
  });
  it("timeout/malformed notify result UNKNOWN never repeats or logs backend secrets", async () => {
    m.guardedHidden.mockRejectedValueOnce(new Error("Bearer secret-private-signed-url"));
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(JSON.stringify(m.alert.mock.calls)).not.toContain("secret-private");
    await openMenu();
    await click("Уведомлять о постах");
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
  });
  it("ACK notify false on requested true cannot claim success", async () => {
    m.guardedHidden.mockResolvedValueOnce({ hidden: false, notify: false });
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    expect(m.alert.mock.calls.at(-1)?.[1]).toContain("неизвестен");
    expect(m.guardedHidden).toHaveBeenCalledTimes(1);
  });
  it("stale A->B->A during pending notify PATCH never reports success or cache update", async () => {
    const pending = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    const guard = m.guardedHidden.mock.calls[0][2] as () => boolean;
    await switchActor("B", "BE1");
    await switchActor("A", "E2");
    expect(guard()).toBe(false);
    await act(async () => pending.resolve({ hidden: false, notify: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("unmount with pending notification PATCH ignores late ACK", async () => {
    const pending = deferred<{ hidden: boolean; notify: boolean }>();
    m.guardedHidden.mockReturnValueOnce(pending.promise);
    await mountPost();
    await openMenu();
    await click("Уведомлять о постах");
    await act(async () => root.unmount());
    await act(async () => pending.resolve({ hidden: false, notify: true }));
    expect(m.alert).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
