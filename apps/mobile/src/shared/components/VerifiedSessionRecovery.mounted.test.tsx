// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offline: false,
  checkAuth: vi.fn(),
  logout: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const node = (tag: string) => (props: Record<string, unknown>) =>
    React.createElement(tag, {
      onClick: props.onPress,
      disabled: props.disabled,
      "aria-label": props.accessibilityLabel,
    }, props.children as React.ReactNode);
  return {
    Alert: { alert: mocks.alert },
    Pressable: node("button"),
    StyleSheet: { create: (v: unknown) => v },
    Text: node("span"),
    View: node("div"),
  };
});
vi.mock("@/shared/config", () => ({
  COLORS: { background: "#eee", text: "#111", textSecondary: "#777", primary: "#687" },
  SPACING: { md: 16 },
}));
vi.mock("@/shared/components/TexturedSafeAreaView", async () => {
  const React = await import("react");
  return { TexturedSafeAreaView: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children) };
});
vi.mock("@/shared/components/ui/Loading", async () => {
  const React = await import("react");
  return { Loading: ({ message }: { message: string }) => React.createElement("div", null, message) };
});
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ checkAuth: mocks.checkAuth, logout: mocks.logout }) },
}));
vi.mock("@/shared/stores/networkStatusStore", () => ({
  useNetworkStatusStore: (selector: (value: { isOffline: boolean }) => boolean) =>
    selector({ isOffline: mocks.offline }),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { VerifiedSessionRecovery } from "./VerifiedSessionRecovery";

let root: Root;
let host: HTMLDivElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function render() {
  await act(async () => root.render(createElement(VerifiedSessionRecovery)));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.offline = false;
  mocks.checkAuth.mockResolvedValue(undefined);
  mocks.logout.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("post-upgrade session recovery screen", () => {
  it("does not hang forever or silently log out; offers retry after the grace period", async () => {
    await render();
    expect(host.textContent).toContain("Проверяем сессию после обновления");
    expect(mocks.logout).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(5100));
    expect(host.textContent).toContain("Восстанавливаем доступ");
    expect(host.textContent).toContain("Ваши данные сохранены");
    await act(async () => {
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Повторить восстановление сессии"]')?.click();
    });
    expect(mocks.checkAuth).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("retries verification automatically when connectivity returns", async () => {
    mocks.offline = true;
    await render();
    await act(async () => vi.advanceTimersByTime(5100));
    expect(host.textContent).toContain("Для завершения обновления требуется интернет");
    mocks.offline = false;
    await render();
    expect(mocks.checkAuth).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("requires an explicit confirmation before signing out", async () => {
    await render();
    await act(async () => vi.advanceTimersByTime(5100));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Войти заново"]')?.click();
    });
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
    const options = mocks.alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => options.find((o) => o.text === "Выйти")?.onPress?.());
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
