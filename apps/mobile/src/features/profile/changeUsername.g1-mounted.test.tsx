// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authenticated: true,
  api: vi.fn(),
  setUser: vi.fn(),
  haptic: vi.fn(),
  back: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
}));
vi.mock("zustand/react/shallow", () => ({ useShallow: (selector: unknown) => selector }));
vi.mock("@/shared/stores", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        user: m.authenticated ? { id: m.owner, username: "before", role: "USER" } : null,
        isAuthenticated: m.authenticated,
        isLoading: false,
        setUser: m.setUser,
      }),
    {
      getState: () => ({
        user: m.authenticated ? { id: m.owner, username: "before", role: "USER" } : null,
        isAuthenticated: m.authenticated,
        isLoading: false,
      }),
    },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/user", () => ({
  userApi: { changeUsername: (...args: unknown[]) => m.api(...args) },
}));
vi.mock("@/shared/hooks", () => ({
  useUsernameAvailability: () => ({ status: "available" }),
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.error(...args),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: () => m.haptic(), light: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...args: unknown[]) => m.invalidate(...args) }),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: () => m.back() }),
}));
vi.mock("@/features/profile", () => ({ ProfileIcon: () => null }));
vi.mock("@/shared/config", () => ({
  BORDER_RADIUS: { xl: 10, lg: 8 },
  COLORS: {
    background: "white",
    text: "black",
    textSecondary: "gray",
    cardBackground: "white",
    border: "gray",
    borderLight: "gray",
    error: "red",
    success: "green",
  },
  SPACING: { md: 12, sm: 8, xl: 20, xs: 4 },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return {
    TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return { StyleSheet: { create: (x: unknown) => x }, ScrollView: Box, View: Box };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  const Text = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("span", null, children);
  const Snackbar = ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
    visible ? R.createElement("div", null, children) : null;
  return { Text, Snackbar };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  const Card = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  Object.assign(Card, {
    Content: ({ children }: { children?: React.ReactNode }) =>
      R.createElement("div", null, children),
  });
  return {
    Card,
    Input: ({
      value,
      onChangeText,
      label,
    }: {
      value: string;
      onChangeText: (v: string) => void;
      label: string;
    }) =>
      R.createElement("input", {
        value,
        "aria-label": label,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value),
      }),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled: boolean;
    }) => R.createElement("button", { onClick: onPress, disabled }, label),
  };
});
import ChangeUsernameScreen from "../../../app/(main)/profile/change-username";

let root: Root;
let host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const click = (part: string) =>
  Array.from(host.querySelectorAll("button"))
    .find((b) => b.textContent?.includes(part))
    ?.click();
async function render() {
  await act(async () => root.render(createElement(ChangeUsernameScreen)));
}
async function fill(value: string) {
  await act(async () => {
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Новый логин"]');
    expect(field).not.toBeNull();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
    field?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authenticated = true;
  m.invalidate.mockResolvedValue(undefined);
  m.api.mockResolvedValue({ success: false, code: "USERNAME_RESULT_UNCONFIRMED" });
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
describe("AG3 G1 username-change existing native screen", () => {
  it("requires verified owner and a valid login", async () => {
    m.authenticated = false;
    await render();
    await fill("valid_name");
    await act(async () => click("Сохранить"));
    expect(m.api).not.toHaveBeenCalled();
  });
  it("one POST after rapid doubletap, with 401 retry actor fence", async () => {
    const d = deferred<{ success: boolean; code: string }>();
    m.api.mockReturnValueOnce(d.promise);
    await render();
    await fill("next_name");
    await act(async () => {
      click("Сохранить");
      click("Сохранить");
    });
    expect(m.api).toHaveBeenCalledOnce();
    expect(m.api.mock.calls[0][0]).toBe("next_name");
    expect((m.api.mock.calls[0][1] as () => boolean)()).toBe(true);
    await act(async () => d.resolve({ success: false, code: "USERNAME_RESULT_UNCONFIRMED" }));
  });
  it("400 USERNAME_TAKEN is editable; unknown 503 is locked without exposing raw errors", async () => {
    m.api.mockResolvedValueOnce({ success: false, code: "USERNAME_TAKEN", error: "private trace" });
    await render();
    await fill("next_name");
    await act(async () => click("Сохранить"));
    expect(host.textContent).toContain("Логин уже занят");
    await act(async () => click("Сохранить"));
    expect(m.api).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Результат смены логина неизвестен");
    expect(host.textContent).not.toContain("private trace");
    await act(async () => click("Сохранить"));
    expect(m.api).toHaveBeenCalledTimes(2);
  });
  it("only matching server user/name ACK may update store and navigate", async () => {
    m.api.mockResolvedValueOnce({
      success: true,
      data: { user: { id: "B", username: "next_name", role: "USER" } },
    });
    await render();
    await fill("next_name");
    await act(async () => click("Сохранить"));
    expect(m.setUser).not.toHaveBeenCalled();
    expect(m.haptic).not.toHaveBeenCalled();
  });
  it("exact server ACK updates the same user once and keeps success if cache refresh fails", async () => {
    m.api.mockResolvedValueOnce({
      success: true,
      data: { user: { id: "A", username: "next_name", role: "USER" } },
    });
    m.invalidate.mockRejectedValueOnce(new Error("cache stale"));
    await render();
    await fill("next_name");
    await act(async () => click("Сохранить"));
    expect(m.setUser).toHaveBeenCalledExactlyOnceWith({
      id: "A",
      username: "next_name",
      role: "USER",
    });
    expect(m.haptic).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Логин изменён");
    await act(async () => click("Сохранить"));
    expect(m.api).toHaveBeenCalledOnce();
  });
  it("stale same-owner new auth epoch never writes another session's identity", async () => {
    const d = deferred<{
      success: boolean;
      data: { user: { id: string; username: string; role: string } };
    }>();
    m.api.mockReturnValueOnce(d.promise);
    await render();
    await fill("next_name");
    await act(async () => click("Сохранить"));
    m.epoch = "E2";
    expect((m.api.mock.calls[0][1] as () => boolean)()).toBe(false);
    await act(async () =>
      d.resolve({
        success: true,
        data: { user: { id: "A", username: "next_name", role: "USER" } },
      }),
    );
    expect(m.setUser).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
  });
  it("unmount suppresses late positive response", async () => {
    const d = deferred<{
      success: boolean;
      data: { user: { id: string; username: string; role: string } };
    }>();
    m.api.mockReturnValueOnce(d.promise);
    await render();
    await fill("next_name");
    await act(async () => click("Сохранить"));
    await act(async () => root.unmount());
    await act(async () =>
      d.resolve({
        success: true,
        data: { user: { id: "A", username: "next_name", role: "USER" } },
      }),
    );
    expect(m.setUser).not.toHaveBeenCalled();
    expect(m.back).not.toHaveBeenCalled();
  });
});
