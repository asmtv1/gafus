// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  end: null as null | ((event: { translationY: number; velocityY: number }) => void),
  offsetX: [] as number[],
  offsetY: [] as number[],
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-gesture-handler", async () => {
  const React = await import("react");
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    Gesture: { Pan: () => ({
      enabled() { return this; },
      activeOffsetY(offset: number[]) { m.offsetY = offset; return this; },
      failOffsetX(offset: number[]) { m.offsetX = offset; return this; },
      onUpdate() { return this; },
      onEnd(callback: (event: { translationY: number; velocityY: number }) => void) {
        m.end = callback;
        return this;
      },
      onFinalize() { return this; },
    }) },
  };
});
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return {
    default: { View: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children) },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => unknown) => style(),
    runOnJS: (fn: () => void) => fn,
    withSpring: (value: number) => value,
    withTiming: (value: number, _config: unknown, finished: (done: boolean) => void) => {
      finished(true);
      return value;
    },
  };
});
import { SwipeDismissMedia } from "./SwipeDismissMedia";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("mounted swipe dismiss media behavior", () => {
  it("dismisses on downward swipe and reserves horizontal drags for paging", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dismiss = vi.fn();
    await act(async () => root.render(
      <SwipeDismissMedia onDismiss={dismiss}>
        <span>Фото</span>
      </SwipeDismissMedia>,
    ));
    expect(host.textContent).toContain("Фото");
    expect(m.offsetY).toEqual([-22, 22]);
    expect(m.offsetX).toEqual([-24, 24]);
    await act(async () => m.end?.({ translationY: -160, velocityY: -1100 }));
    await act(async () => m.end?.({ translationY: 80, velocityY: 50 }));
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => m.end?.({ translationY: 125, velocityY: 200 }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
