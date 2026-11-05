// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  end: null as null | ((event: {
    translationX: number; translationY: number; velocityX: number; velocityY: number;
  }) => void),
  allowed: true,
  selection: vi.fn(),
  xOffset: null as number | number[] | null,
  yOffset: null as number | number[] | null,
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  return { StyleSheet: { create: (styles: unknown) => styles },
    View: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) };
});
vi.mock("react-native-gesture-handler", async () => {
  const React = await import("react");
  return { GestureDetector: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children), Gesture: { Pan: () => ({
    enabled(value: boolean) { m.allowed = value; return this; },
    activeOffsetX(v: number | number[]) { m.xOffset = v; return this; },
    activeOffsetY(v: number | number[]) { m.yOffset = v; return this; },
    failOffsetY() { return this; }, failOffsetX() { return this; },
    onUpdate() { return this; },
    onEnd(callback: typeof m.end) { m.end = callback; return this; },
    onFinalize() { return this; },
  }) } };
});
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return { default: { View: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children) },
    useSharedValue: (v: number) => React.useRef({ value: v }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    runOnJS: (fn: () => void) => fn,
    withSpring: (v: number) => v };
});
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/lib/utils/haptics", () => ({ hapticFeedback: { selection: m.selection } }));
import { SwipeDismissHandle } from "@/shared/components/gestures/SwipeDismissHandle";
import { SwipeReplyMessage } from "./SwipeReplyMessage";
import { Chat2ImageBrowse } from "./Chat2ImageBrowse";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const swipe = (x: number, y: number, vx = 0, vy = 0) => {
  m.end?.({ translationX: x, translationY: y, velocityX: vx, velocityY: vy });
};
beforeEach(() => { m.end = null; m.selection.mockReset(); });

describe("mounted native gesture callbacks", () => {
  it("slides a message to quote it on right swipe, not while vertically scrolling", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const reply = vi.fn();
    await act(async () => root.render(<SwipeReplyMessage onReply={reply}>
      <span>message</span>
    </SwipeReplyMessage>));
    expect(host.textContent).toBe("message"); expect(m.xOffset).toBe(24);
    swipe(10, 2); swipe(-120, 3, -120); swipe(120, 100, 200);
    expect(reply).not.toHaveBeenCalled();
    swipe(100, 2, 200);
    expect(reply).toHaveBeenCalledOnce(); expect(m.selection).toHaveBeenCalledOnce();
    await act(async () => root.unmount()); host.remove();
  });
  it("closes a bottom sheet only on a deliberate swipe down, not when busy", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const close = vi.fn();
    await act(async () => root.render(<SwipeDismissHandle close={close} />));
    expect(m.allowed).toBe(true); expect(m.yOffset).toEqual([-18, 18]);
    swipe(0, 45, 0, 120); expect(close).not.toHaveBeenCalled();
    swipe(0, 100); expect(close).toHaveBeenCalledOnce();
    await act(async () => root.render(<SwipeDismissHandle close={close} disabled />));
    expect(m.allowed).toBe(false);
    await act(async () => root.unmount()); host.remove();
  });
  it("moves to adjacent chat images only on horizontal swipes", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const next = vi.fn();
    await act(async () => root.render(<Chat2ImageBrowse enabled onNavigate={next}>
      <span>gallery</span></Chat2ImageBrowse>));
    expect(m.xOffset).toEqual([-22, 22]);
    swipe(-120, 90); swipe(20, 0);
    expect(next).not.toHaveBeenCalled();
    swipe(-100, 0); swipe(100, 0);
    expect(next.mock.calls.map((args: unknown[]) => args[0])).toEqual([1, -1]);
    await act(async () => root.unmount()); host.remove();
  });
});
