// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ change: vi.fn(), settings: vi.fn() }));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "olive", cardBackground: "white", borderLight: "gray", text: "black" },
  FONTS: { montserratBold: "serif" },
  SPACING: { lg: 12, md: 8 },
  BORDER_RADIUS: { lg: 10 },
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return {
    Button: ({
      onPress,
      accessibilityLabel,
    }: {
      onPress: () => void;
      accessibilityLabel?: string;
    }) =>
      R.createElement(
        "button",
        { onClick: onPress, "aria-label": accessibilityLabel },
        "Сортировка",
      ),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Container = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    StyleSheet: { create: (x: unknown) => x, absoluteFillObject: {} },
    Text: Container,
    View: Container,
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? R.createElement("div", null, children) : null,
    Pressable: ({
      onPress,
      children,
      accessibilityLabel,
      accessibilityRole,
    }: {
      onPress?: () => void;
      children?: React.ReactNode;
      accessibilityLabel?: string;
      accessibilityRole?: string;
    }) =>
      R.createElement(
        accessibilityLabel === "Закрыть сортировку" ? "div" : "button",
        {
          "aria-label": accessibilityLabel,
          "data-role": accessibilityRole,
          "data-overlay": accessibilityLabel === "Закрыть сортировку" ? "true" : undefined,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onPress?.();
          },
        },
        children,
      ),
  };
});
import { FeedSortControl } from "./FeedSortControl";
import type { FeedSort } from "@gafus/types";
let root: Root;
let host: HTMLDivElement;
const state: { value: FeedSort; smartEnabled: boolean; settingsEnabled: boolean } = {
  value: "new",
  smartEnabled: false,
  settingsEnabled: true,
};
async function render() {
  await act(async () =>
    root.render(
      createElement(FeedSortControl, {
        value: state.value,
        smartEnabled: state.smartEnabled,
        onChange: m.change,
        onSettings: state.settingsEnabled ? m.settings : undefined,
      }),
    ),
  );
}
const click = async (name: string) => {
  await act(async () => {
    const target = Array.from(host.querySelectorAll("button, [data-overlay]")).find(
      (b) =>
        b.getAttribute("aria-label") === name ||
        (b.getAttribute("data-role") === "radio" && b.textContent?.includes(name)) ||
        (b.getAttribute("data-role") === "button" && b.textContent?.trim() === name),
    );
    expect(target).toBeDefined();
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  state.value = "new";
  state.smartEnabled = false;
  state.settingsEnabled = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 Moments native sort control contract", () => {
  it("smart disabled with stale smart value proactively selects valid new ordering", async () => {
    state.value = "smart";
    await render();
    expect(m.change).toHaveBeenCalledExactlyOnceWith("new");
  });
  it("no repeated correction when parent has not acknowledged fallback yet", async () => {
    state.value = "smart";
    await render();
    await render();
    expect(m.change).toHaveBeenCalledExactlyOnceWith("new");
  });
  it("smart disabled excludes disabled option from accessible modal", async () => {
    state.value = "smart";
    await render();
    await click("Сортировка: Сначала новые");
    expect(host.textContent).not.toContain("Для вас");
    expect(host.textContent).toContain("Сначала новые");
  });
  it("smart allowed renders the personalized option", async () => {
    state.smartEnabled = true;
    state.value = "smart";
    await render();
    await click("Сортировка: Для вас");
    expect(host.textContent).toContain("Для вас");
    expect(m.change).not.toHaveBeenCalled();
  });
  it("tapping already selected option closes without redundant side effect", async () => {
    await render();
    await click("Сортировка: Сначала новые");
    await click("Сначала новые");
    expect(m.change).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Сначала популярные");
  });
  it("changing option forwards exact value and dismisses modal", async () => {
    await render();
    await click("Сортировка: Сначала новые");
    await click("Сначала популярные");
    expect(m.change).toHaveBeenCalledExactlyOnceWith("popular");
    expect(host.textContent).not.toContain("Сначала резонансные");
  });
  it("settings action only visible when smart enabled", async () => {
    await render();
    await click("Сортировка: Сначала новые");
    expect(host.textContent).not.toContain("Настроить ленту");
    state.smartEnabled = true;
    await render();
    expect(host.textContent).toContain("Настроить ленту");
    await click("Настроить ленту");
    expect(m.settings).toHaveBeenCalledOnce();
  });
  it("overlay close changes neither sort nor preferences", async () => {
    await render();
    await click("Сортировка: Сначала новые");
    await click("Закрыть сортировку");
    expect(m.change).not.toHaveBeenCalled();
    expect(m.settings).not.toHaveBeenCalled();
  });
});
