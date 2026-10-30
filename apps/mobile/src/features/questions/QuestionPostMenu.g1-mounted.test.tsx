// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: true, platform: "ios", close: vi.fn(), action: vi.fn(),
  requestClose: null as null | (() => void),
}));
vi.mock("@expo/vector-icons", async () => {
  const R = await import("react");
  return { MaterialCommunityIcons: ({ accessible, importantForAccessibility, name }: {
    accessible?: boolean; importantForAccessibility?: string; name?: string;
  }) => R.createElement("span", {
    "data-icon-name": name,
    "data-icon-accessible": String(accessible),
    "data-icon-a11y": importantForAccessibility,
  }) };
});
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", cardBackground: "white", textSecondary: "gray", text: "black" },
  FONTS: { montserratMedium: "font" },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children, accessibilityViewIsModal, accessibilityLabel,
    importantForAccessibility, accessible }: {
    children?: React.ReactNode;
    accessibilityViewIsModal?: boolean;
    accessibilityLabel?: string;
    importantForAccessibility?: string;
    accessible?: boolean;
  }) => R.createElement("div", {
    "data-a11y-modal": String(!!accessibilityViewIsModal),
    "data-a11y-label": accessibilityLabel,
    "data-android-a11y": importantForAccessibility,
    "data-accessible": String(accessible),
  }, children);
  return {
    Modal: ({ children, visible, onRequestClose }: {
      children?: React.ReactNode; visible: boolean; onRequestClose?: () => void;
    }) => {
      m.requestClose = visible ? onRequestClose ?? null : null;
      return visible ? R.createElement("div", { "data-native-modal": "true" }, children) : null;
    },
    View: Box,
    Text: ({ children, accessibilityRole }: {
      children?: React.ReactNode; accessibilityRole?: string;
    }) => R.createElement("span", { "data-native-role": accessibilityRole }, children),
    Pressable: ({
      children,
      disabled,
      onPress,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { disabled?: boolean };
    }) =>
      R.createElement(
        "button",
        { "aria-label": accessibilityLabel, disabled, onClick: onPress,
          "data-native-role": accessibilityRole,
          "data-native-disabled": String(!!accessibilityState?.disabled),
        },
        children,
      ),
    Platform: {
      get OS() {
        return m.platform;
      },
    },
    StyleSheet: { create: (o: unknown) => o, absoluteFill: {} },
  };
});
import { QuestionPostMenu, type QuestionPostAction } from "./QuestionPostMenu";
let root: Root, host: HTMLDivElement;
const actions = (disabled = false): QuestionPostAction[] => [
  {
    key: "close",
    label: "Закрыть обсуждение",
    icon: "lock-outline",
    disabled,
    onPress: () => m.action(),
  },
];
async function render(visible = true, disabled = false) {
  await act(async () =>
    root.render(
      createElement(QuestionPostMenu, {
        visible,
        onClose: () => m.close(),
        actions: actions(disabled),
        isActorCurrent: () => m.current,
      }),
    ),
  );
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
async function choose() {
  await act(async () => {
    button("Закрыть обсуждение")?.click();
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.current = true;
  m.platform = "ios";
  m.requestClose = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
describe("AG3 SOC032 V54 actual question action menu mounted delayed callback", () => {
  it("one iOS action closes once and runs after 300ms, not before", async () => {
    await render();
    await act(async () => {
      button("Закрыть обсуждение")?.click();
      button("Закрыть обсуждение")?.click();
    });
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.action).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(299));
    expect(m.action).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(m.action).toHaveBeenCalledOnce();
  });
  it("menu own close rerender does not accidentally cancel selected action", async () => {
    await render();
    await choose();
    await render(false);
    await act(async () => vi.advanceTimersByTime(300));
    expect(m.action).toHaveBeenCalledOnce();
  });
  it("disabled action never schedules callbacks", async () => {
    await render(true, true);
    await choose();
    await act(async () => vi.advanceTimersByTime(900));
    expect(m.close).not.toHaveBeenCalled();
    expect(m.action).not.toHaveBeenCalled();
  });
  it("unmount cancels pending delayed destructive action", async () => {
    await render();
    await choose();
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTime(300));
    expect(m.action).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("stale owner before delayed callback skips action", async () => {
    await render();
    await choose();
    m.current = false;
    await act(async () => vi.advanceTimersByTime(300));
    expect(m.action).not.toHaveBeenCalled();
  });
  it("owner stale even before choosing cannot schedule", async () => {
    await render();
    m.current = false;
    await choose();
    await act(async () => vi.advanceTimersByTime(500));
    expect(m.close).not.toHaveBeenCalled();
    expect(m.action).not.toHaveBeenCalled();
  });
  it("Android delay zero still waits for queued callback and current actor", async () => {
    m.platform = "android";
    await render();
    await choose();
    expect(m.action).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(0));
    expect(m.action).toHaveBeenCalledOnce();
  });
});


// SOC040: Only RN prop semantics and already-wired dismissals; this mock does
// not emulate VoiceOver/TalkBack focus or invoke external Share/native Alert.
describe("SOC040_QUESTION_POST_MENU_ACCESSIBILITY lifecycle", () => {
  it("exposes a named modal sheet, heading, and independent accessible actions", async () => {
    await render();
    const sheet = host.querySelector(
      '[data-a11y-modal="true"][data-a11y-label="Действия с вопросом"][data-android-a11y="yes"]',
    );
    expect(sheet).not.toBeNull();
    // Grouping as one accessible item would swallow the individual controls.
    expect(sheet?.getAttribute("data-accessible")).not.toBe("true");
    expect(sheet?.querySelector('[data-native-role="header"]')?.textContent)
      .toBe("Действия с вопросом");
    expect(sheet?.querySelector('button[aria-label="Закрыть обсуждение"]')
      ?.getAttribute("data-native-role")).toBe("button");
    expect(sheet?.querySelector('button[aria-label="Отмена"]')
      ?.getAttribute("data-native-role")).toBe("button");
    expect(button("Закрыть меню действий")?.getAttribute("data-native-role"))
      .toBe("button");
    expect(m.action).not.toHaveBeenCalled();
  });

  it("excludes decorative handle and icon while preserving destructive and disabled action semantics", async () => {
    await act(async () => root.render(createElement(QuestionPostMenu, {
      visible: true, onClose: () => m.close(), isActorCurrent: () => m.current,
      actions: [
        { key: "close", label: "Закрыть обсуждение", icon: "lock-outline" as const,
          destructive: true, onPress: () => m.action() },
        { key: "off", label: "Удалить вопрос", icon: "delete-outline" as const,
          destructive: true, disabled: true, onPress: () => m.action() },
      ],
    })));
    const handle = host.querySelector("[data-android-a11y=\"no-hide-descendants\"]");
    expect(handle?.getAttribute("data-accessible")).toBe("false");
    const icons = Array.from(host.querySelectorAll("[data-icon-name]"));
    expect(icons).toHaveLength(2);
    expect(icons.every(icon => icon.getAttribute("data-icon-accessible") === "false" &&
      icon.getAttribute("data-icon-a11y") === "no")).toBe(true);
    expect(button("Закрыть обсуждение")?.disabled).toBe(false);
    expect(button("Закрыть обсуждение")?.getAttribute("data-native-disabled"))
      .toBe("false");
    expect(button("Удалить вопрос")?.disabled).toBe(true);
    expect(button("Удалить вопрос")?.getAttribute("data-native-disabled"))
      .toBe("true");
    await act(async () => button("Удалить вопрос")?.click());
    await act(async () => vi.advanceTimersByTime(400));
    expect(m.close).not.toHaveBeenCalled();
    expect(m.action).not.toHaveBeenCalled();
  });

  it.each(["cancel", "backdrop", "native-request"])(
    "%s dismisses without choosing or scheduling action", async mode => {
      await render();
      await act(async () => {
        if (mode === "cancel") button("Отмена")?.click();
        if (mode === "backdrop") button("Закрыть меню действий")?.click();
        if (mode === "native-request") m.requestClose?.();
      });
      expect(m.close).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTime(400));
      expect(m.action).not.toHaveBeenCalled();
    },
  );
});
