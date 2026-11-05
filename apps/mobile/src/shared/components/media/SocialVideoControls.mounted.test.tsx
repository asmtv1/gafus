// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoPlayer } from "expo-video";

vi.mock("@expo/vector-icons", async () => {
  const R = await import("react");
  return { MaterialCommunityIcons: ({ name }: { name: string }) => R.createElement("span", { "data-icon": name }) };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const View = ({ children, accessibilityLabel, onLayout, onResponderGrant, onResponderMove,
    onResponderRelease, onAccessibilityAction }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
    onResponderGrant?: (event: unknown) => void;
    onResponderMove?: (event: unknown) => void;
    onResponderRelease?: (event: unknown) => void;
    onAccessibilityAction?: (event: unknown) => void;
  }) => {
    R.useEffect(() => { onLayout?.({ nativeEvent: { layout: { width: 200 } } }); }, [onLayout]);
    const dragEvent = (event: React.MouseEvent) => ({
      stopPropagation: () => event.stopPropagation(), nativeEvent: { locationX: event.clientX },
    });
    return R.createElement("div", {
      "aria-label": accessibilityLabel,
      onMouseDown: (e: React.MouseEvent) => onResponderGrant?.(dragEvent(e)),
      onMouseMove: (e: React.MouseEvent) => onResponderMove?.(dragEvent(e)),
      onMouseUp: (e: React.MouseEvent) => onResponderRelease?.(dragEvent(e)),
      onKeyDown: (e: React.KeyboardEvent) => onAccessibilityAction?.({
        nativeEvent: { actionName: e.key === "ArrowRight" ? "increment" : "decrement" },
      }),
    }, children);
  };
  return {
    StyleSheet: { absoluteFillObject: {}, create: (styles: object) => styles },
    View,
    Text: ({ children }: { children: React.ReactNode }) => R.createElement("span", null, children),
    Pressable: ({ children, onPress, accessibilityLabel }: { children: React.ReactNode;
      onPress?: (event: unknown) => void; accessibilityLabel?: string }) =>
      R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
  };
});

import { SocialVideoControls } from "./SocialVideoControls";

const listeners = new Map<string, (event: { currentTime: number }) => void>();
const player = {
  currentTime: 12, duration: 120, timeUpdateEventInterval: 0,
  addListener: vi.fn((type: string, fn: (event: { currentTime: number }) => void) => {
    listeners.set(type, fn);
    return { remove: () => { listeners.delete(type); } };
  }),
} as unknown as VideoPlayer;
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
  player.currentTime = 12;
  player.timeUpdateEventInterval = 0;
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); listeners.clear(); });

describe("shared native video gestures", () => {
  it("taps video to pause, hides floating pause button, and updates playback progress", async () => {
    const toggle = vi.fn();
    await act(async () => root.render(<SocialVideoControls player={player} playing
      onToggle={toggle} label="Ролик" />));
    expect(player.timeUpdateEventInterval).toBe(0.2);
    expect(host.querySelector('[aria-label="Пауза"]')).not.toBeNull();
    expect(host.querySelector('[data-icon="pause"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Пауза"]')?.click());
    expect(toggle).toHaveBeenCalledOnce();
    await act(async () => listeners.get("timeUpdate")?.({ currentTime: 45 }));
    expect(host.textContent).toContain("0:45");
    expect(host.textContent).toContain("2:00");
  });
  it("drags the full-width timeline and seeks only when the finger is released", async () => {
    await act(async () => root.render(<SocialVideoControls player={player} playing={false}
      onToggle={vi.fn()} />));
    const seek = host.querySelector<HTMLElement>('[aria-label="Перемотка видео"]')!;
    await act(async () => {
      seek.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 40 }));
      seek.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100 }));
    });
    expect(player.currentTime).toBe(12);
    expect(host.textContent).toContain("1:00");
    await act(async () => seek.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 100 })));
    expect(player.currentTime).toBe(60);
    await act(async () => seek.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, key: "ArrowRight",
    })));
    expect(player.currentTime).toBe(70);
  });
});
