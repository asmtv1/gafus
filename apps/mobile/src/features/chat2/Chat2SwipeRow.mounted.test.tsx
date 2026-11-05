// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "./api";

vi.mock("react-native", async () => {
  const React = await import("react");
  const node = (tag: string) => (props: Record<string, unknown>) =>
    React.createElement(tag, {
      "aria-label": props.accessibilityLabel,
      disabled: props.disabled,
      onClick: props.onPress,
    }, props.children as React.ReactNode);
  return { Pressable: node("button"), View: node("div"), Text: node("span"),
    StyleSheet: { create: (styles: unknown) => styles } };
});
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", async () => {
  const React = await import("react");
  return { default: ({ renderRightActions, children }: {
    renderRightActions: (progress: unknown, translation: unknown,
      methods: { close: () => void }) => React.ReactNode;
    children: React.ReactNode;
  }) => React.createElement("div", null, children,
    renderRightActions(null, null, { close: () => undefined })) };
});
import { Chat2SwipeRow } from "./Chat2SwipeRow";
const room = { id: "r", lastSequence: "12", unreadCount: 3, muted: false } as Conversation;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("mounted chat list swipe actions", () => {
  it("reveals read and mute actions without deleting or leaving a chat", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const read = vi.fn(), mute = vi.fn();
    await act(async () => root.render(<Chat2SwipeRow room={room} busy={false}
      onRead={read} onMute={mute}><span>Моя переписка</span></Chat2SwipeRow>));
    expect(host.textContent).toContain("Моя переписка");
    expect(host.querySelector('[aria-label="Отметить чат прочитанным"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Отключить уведомления чата"]')).not.toBeNull();
    await act(async () => {
      (host.querySelector('[aria-label="Отметить чат прочитанным"]') as HTMLButtonElement).click();
      (host.querySelector('[aria-label="Отключить уведомления чата"]') as HTMLButtonElement).click();
    });
    expect(read).toHaveBeenCalledOnce(); expect(mute).toHaveBeenCalledOnce();
    await act(async () => root.render(<Chat2SwipeRow
      room={{ ...room, unreadCount: 0, muted: true }} busy={false}
      onRead={read} onMute={mute}><span>Моя переписка</span></Chat2SwipeRow>));
    expect(host.querySelector('[aria-label="Отметить чат прочитанным"]')).toBeNull();
    expect(host.querySelector('[aria-label="Включить уведомления чата"]')).not.toBeNull();
    await act(async () => root.unmount()); host.remove();
  });
});
