// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "owner-A", epoch: "epoch-A",
  list: vi.fn(), read: vi.fn(), mute: vi.fn(), push: vi.fn(),
  report: vi.fn(), scrollToEnd: vi.fn(),
  keyboardListener: null as (() => void) | null,
  keyboardUnsubscribe: vi.fn(),
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const node = (tag: string) => (p: Record<string, unknown>) => R.createElement(tag, {
    onClick: p.onPress, disabled: p.disabled, "aria-label": p.accessibilityLabel,
    onTouchStart: p.onTouchStart, onTouchEnd: p.onTouchEnd,
  }, p.children as React.ReactNode);
  return {
    ScrollView: R.forwardRef(({ children, refreshControl }: {
      children: React.ReactNode; refreshControl?: React.ReactNode;
    }, ref: React.ForwardedRef<unknown>) => {
      R.useImperativeHandle(ref, () => ({ scrollToEnd: m.scrollToEnd }));
      return R.createElement("div", null, refreshControl, children);
    }),
    KeyboardAvoidingView: ({ children, behavior }: { children: React.ReactNode; behavior?: string }) =>
      R.createElement("div", { "data-keyboard-behavior": behavior }, children),
    Keyboard: { addListener: (_name: string, callback: () => void) => {
      m.keyboardListener = callback;
      return { remove: m.keyboardUnsubscribe };
    } },
    View: node("div"), TouchableOpacity: node("button"),
    Text: node("span"), TextInput: (props: {
      placeholder?: string; placeholderTextColor?: string;
      accessibilityLabel?: string; onFocus?: () => void; onBlur?: () => void;
      style?: Record<string, string>;
    }) => R.createElement("input", {
      placeholder: props.placeholder,
      "aria-label": props.accessibilityLabel,
      "data-placeholder-color": props.placeholderTextColor,
      "data-text-color": props.style?.color,
      onFocus: props.onFocus, onBlur: props.onBlur,
    }),
    Image: () => null, ActivityIndicator: () => null,
    Alert: { alert: vi.fn() }, StyleSheet: { create: (x: unknown) => x },
    RefreshControl: ({ onRefresh }: { onRefresh: () => void }) =>
      R.createElement("button", { onClick: onRefresh, "data-testid": "refresh" }, "Обновить"),
  };
});
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("expo-router", async () => {
  const R = await import("react");
  return { useRouter: () => ({ push: m.push }),
    useFocusEffect: (callback: () => void) => { R.useEffect(callback, [callback]); } };
});
vi.mock("@/shared/stores", async () => {
  const { create } = await import("zustand");
  return { useAuthStore: create(() => ({ isAuthenticated: true, isLoading: false,
    user: { id: "owner-A", role: "USER" } })) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...args: unknown[]) => m.report(...args) }));
vi.mock("@/shared/components/TexturedSafeAreaView", async () => {
  const R = await import("react");
  return { TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
    R.createElement("div", null, children) };
});
vi.mock("./Chat2SwipeRow", async () => {
  const R = await import("react");
  return { Chat2SwipeRow: ({ children, onRead, onMute }: {
    children: React.ReactNode; onRead: () => void; onMute: () => void;
  }) => R.createElement("div", null, children,
    R.createElement("button", { "aria-label": "read-action", onClick: onRead }, "Прочитано"),
    R.createElement("button", { "aria-label": "mute-action", onClick: onMute }, "Без звука")) };
});
vi.mock("./Chat2ListNavigation", () => ({ Chat2ListNavigation: () => null }));
vi.mock("./Chat2StaffQueue", () => ({ Chat2StaffQueue: () => null }));
vi.mock("./Chat2Avatar", async () => {
  const R = await import("react");
  return { Chat2Avatar: ({ children }: { children: React.ReactNode }) =>
    R.createElement("div", null, children) };
});
vi.mock("./api", () => ({
  nameFor: () => "Группа GAFUS",
  chat2: {
    list: (...args: unknown[]) => m.list(...args),
    read: (...args: unknown[]) => m.read(...args),
    mute: (...args: unknown[]) => m.mute(...args),
  },
}));
import Chat2ListScreen from "./Chat2ListScreen";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks(); m.owner = "owner-A"; m.epoch = "epoch-A";
  m.keyboardListener = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  m.list.mockResolvedValue([{ id: "conversation-1", kind: "GROUP", name: "Группа GAFUS",
    members: [], unreadCount: 4, lastSequence: "123", lastMessage: null, muted: false }]);
  m.read.mockResolvedValue({ lastReadSequence: "123" }); m.mute.mockResolvedValue({ muted: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  host.remove();
});
const click = async (label: string) => {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
};

describe("mounted Chat2 list swipe actions and pull to refresh", () => {
  it("calls authorized read with the real last sequence and mute with the inverted flag", async () => {
    await act(async () => root.render(<Chat2ListScreen />));
    expect(host.textContent).toContain("Группа GAFUS");
    await click("read-action");
    expect(m.read).toHaveBeenCalledExactlyOnceWith("conversation-1", "123");
    await click("mute-action");
    expect(m.mute).toHaveBeenCalledExactlyOnceWith("conversation-1", true);
    expect(m.list.mock.calls.length).toBeGreaterThanOrEqual(3);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="refresh"]')?.click());
    expect(m.list.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it("refuses to mutate when the native auth epoch changes", async () => {
    await act(async () => root.render(<Chat2ListScreen />));
    m.epoch = "epoch-B";
    await click("read-action"); await click("mute-action");
    expect(m.read).not.toHaveBeenCalled(); expect(m.mute).not.toHaveBeenCalled();
  });
});

describe("mounted Chat2 search and group keyboard", () => {
  it("shows black text for both chat search and user search", async () => {
    await act(async () => root.render(<Chat2ListScreen />));
    const search = () => host.querySelector<HTMLInputElement>('input[aria-label="Поиск"]');
    expect(search()?.placeholder).toBe("Поиск по чатам");
    expect(search()?.getAttribute("data-placeholder-color")).toBe("#000000");
    expect(search()?.getAttribute("data-text-color")).toBe("#000000");
    await click("Новое сообщение");
    expect(search()?.placeholder).toBe("Поиск пользователя");
    expect(search()?.getAttribute("data-placeholder-color")).toBe("#000000");
  });
  it("keeps group description above keyboard by scrolling on focus and keyboard show", async () => {
    await act(async () => root.render(<Chat2ListScreen />));
    await click("Создать групповой чат");
    expect(host.querySelector('[data-keyboard-behavior="padding"]')).not.toBeNull();
    const description = host.querySelector<HTMLInputElement>('input[aria-label="Описание группы"]');
    expect(description).not.toBeNull();
    await act(async () => description?.focus());
    expect(m.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    m.scrollToEnd.mockClear();
    await act(async () => m.keyboardListener?.());
    expect(m.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    await act(async () => description?.blur());
    m.scrollToEnd.mockClear();
    await act(async () => m.keyboardListener?.());
    expect(m.scrollToEnd).not.toHaveBeenCalled();
    expect(m.keyboardUnsubscribe).not.toHaveBeenCalled();
  });
});
