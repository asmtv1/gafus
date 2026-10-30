// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, accessibilityRole }: {
      children?: React.ReactNode; accessibilityRole?: string;
    }) => React.createElement("span", { role: accessibilityRole }, children),
    View: ({ children, accessibilityLabel }: {
      children?: React.ReactNode; accessibilityLabel?: string;
    }) => React.createElement("section", { "aria-label": accessibilityLabel }, children),
    TouchableOpacity: ({ children, onPress, disabled, accessibilityLabel }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => React.createElement("button", {
      onClick: onPress, disabled, "aria-label": accessibilityLabel,
    }, children),
  };
});
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) =>
    createElement("i", { "data-icon": name }),
}));

import { Chat2ListNavigation } from "./Chat2ListNavigation";

let host: HTMLDivElement;
let root: Root;
const discover = vi.fn();
const cynologist = vi.fn();
const courses = vi.fn();
const moderation = vi.fn();

async function render(loading = false, staff = false) {
  await act(async () => root.render(createElement(Chat2ListNavigation, {
    onDiscover: discover,
    onCynologist: cynologist,
    onCourses: courses,
    onModeration: staff ? moderation : undefined,
    loading,
  })));
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Chat2 navigation is visually and semantically separate from conversations", () => {
  it("places discovery and services under a section, without duplicate General chat CTA", async () => {
    await render();
    expect(host.querySelector('[aria-label="Другие разделы чатов"]')).not.toBeNull();
    expect(host.textContent).toContain("Другие разделы");
    expect(host.textContent).toContain("Найти сообщества");
    expect(host.textContent).toContain("Чат с кинологом");
    expect(host.textContent).toContain("Чаты доступных курсов");
    expect(host.textContent).not.toContain("Общий чат GAFUS");
    expect(host.textContent).not.toContain("Модерация жалоб");
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Найти сообщества"]',
    )?.click());
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Чат с кинологом"]',
    )?.click());
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Чаты доступных курсов"]',
    )?.click());
    expect(discover).toHaveBeenCalledOnce();
    expect(cynologist).toHaveBeenCalledOnce();
    expect(courses).toHaveBeenCalledOnce();
  });

  it("disables chat-creation shortcuts while a request is in flight", async () => {
    await render(true);
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Чат с кинологом"]',
    )?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Чаты доступных курсов"]',
    )?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Найти сообщества"]',
    )?.disabled).toBe(false);
  });

  it("shows moderation only when staff action is supplied", async () => {
    await render(false, true);
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Модерация жалоб"]',
    )?.click());
    expect(moderation).toHaveBeenCalledOnce();
  });
});
