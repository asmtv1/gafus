// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: true,
  toggle: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/config", () => ({
  COLORS: { textSecondary: "gray" },
  FONTS: { montserrat: "a" },
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("react-native", async () => {
  const R = await import("react");
  class Value {
    private value: number;
    constructor(initial: number) {
      this.value = initial;
    }
    stopAnimation() {
      return this.value;
    }
    setValue(next: number) {
      this.value = next;
    }
  }
  return {
    Animated: {
      Value,
      View: ({ children }: { children?: React.ReactNode }) =>
        R.createElement("span", null, children),
      timing: () => ({}),
      spring: () => ({}),
      sequence: () => ({ start: () => undefined }),
    },
    Easing: { cubic: () => null, out: (v: unknown) => v },
    Pressable: ({
      children,
      disabled,
      onPress,
      accessibilityLabel,
      accessibilityState,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    }) =>
      R.createElement(
        "button",
        {
          disabled,
          onClick: onPress,
          "aria-label": accessibilityLabel,
          "aria-pressed": accessibilityState?.selected,
        },
        children,
      ),
    StyleSheet: { create: (v: unknown) => v },
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
import { QuestionAnswerHeart } from "./QuestionAnswerHeart";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const button = () => host.querySelector<HTMLButtonElement>("button")!;
async function render(disabled = false) {
  await act(async () =>
    root.render(
      createElement(QuestionAnswerHeart, {
        liked: false,
        hearts: 3,
        disabled,
        onToggle: (v: boolean) => m.toggle(v),
        onSuccess: () => m.refresh(),
        onError: (e: unknown) => m.error(e),
        isActorCurrent: () => m.current,
      }),
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.current = true;
  m.toggle.mockResolvedValue(undefined);
  m.refresh.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 SOC032 mounted actual QuestionAnswerHeart single mutation", () => {
  it("disabled actor cannot send reaction", async () => {
    await render(true);
    expect(button().disabled).toBe(true);
    await act(async () => button().click());
    expect(m.toggle).not.toHaveBeenCalled();
  });
  it("single-flight optimistic heart changes only once before deferred ACK", async () => {
    const ack = deferred<void>();
    m.toggle.mockReturnValueOnce(ack.promise);
    await render();
    await act(async () => {
      button().click();
      button().click();
    });
    expect(m.toggle).toHaveBeenCalledExactlyOnceWith(true);
    expect(m.refresh).not.toHaveBeenCalled();
    expect(button().getAttribute("aria-label")).toBe("Убрать сердечко");
    expect(button().disabled).toBe(true);
    expect(host.textContent).toContain("4");
    await act(async () => ack.resolve(undefined));
    expect(m.refresh).toHaveBeenCalledOnce();
    expect(m.error).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });
  it("cache failure AFTER acknowledged write must not roll back heart", async () => {
    m.refresh.mockRejectedValueOnce(new Error("PRIVATE_CACHE_EXCEPTION"));
    await render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-label")).toBe("Убрать сердечко");
    expect(host.textContent).toContain("4");
    expect(m.error).not.toHaveBeenCalled();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_CACHE_EXCEPTION");
    expect(m.trace).toHaveBeenCalledOnce();
  });
  it("ambiguous reaction failure restores displayed count but locks retransmit", async () => {
    m.toggle.mockRejectedValueOnce(new Error("RAW_SERVER_PRIVATE_ERROR"));
    await render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-label")).toBe("Поставить сердечко");
    expect(host.textContent).toContain("3");
    expect(button().disabled).toBe(true);
    await act(async () => button().click());
    expect(m.toggle).toHaveBeenCalledOnce();
    expect(m.error).toHaveBeenCalledOnce();
    expect(String(m.error.mock.calls[0][0])).toContain("неизвестен");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("RAW_SERVER_PRIVATE_ERROR");
    expect(JSON.stringify(m.error.mock.calls)).not.toContain("RAW_SERVER_PRIVATE_ERROR");
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it("late ACK after actor change invokes neither cache refresh nor error", async () => {
    const ack = deferred<void>();
    m.toggle.mockReturnValueOnce(ack.promise);
    await render();
    await act(async () => button().click());
    m.current = false;
    await act(async () => ack.resolve(undefined));
    expect(m.refresh).not.toHaveBeenCalled();
    expect(m.error).not.toHaveBeenCalled();
  });
  it("unmount before ACK suppresses late callbacks", async () => {
    const ack = deferred<void>();
    m.toggle.mockReturnValueOnce(ack.promise);
    await render();
    await act(async () => button().click());
    await act(async () => root.unmount());
    await act(async () => ack.resolve(undefined));
    expect(m.refresh).not.toHaveBeenCalled();
    expect(m.error).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
