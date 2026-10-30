// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  logged: true,
  loading: false,
  mail: vi.fn(),
  back: vi.fn(),
  success: vi.fn(),
  tracer: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner } : null,
      }),
    {
      getState: () => ({
        isAuthenticated: m.logged,
        isLoading: m.loading,
        user: m.logged ? { id: m.owner } : null,
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
  userApi: { requestEmailChange: (...args: unknown[]) => m.mail(...args) },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.tracer(...args),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: () => m.success(), light: vi.fn() },
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
      editable,
      error,
    }: {
      value: string;
      onChangeText: (v: string) => void;
      label: string;
      editable?: boolean;
      error?: string;
    }) =>
      R.createElement(
        "div",
        null,
        R.createElement("input", {
          value,
          "aria-label": label,
          disabled: editable === false,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value),
        }),
        error ? R.createElement("span", null, error) : null,
      ),
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
import ChangeEmailScreen from "../../../app/(main)/profile/change-email";
let root: Root, host: HTMLDivElement;
const waiting = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { resolve, promise };
};
const find = (label: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
async function show(label: string) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await vi.waitFor(() => expect(host.textContent).toContain(label));
}
async function fill(email: string) {
  await act(async () => {
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Новый email"]');
    expect(field).not.toBeNull();
    const input = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    input?.call(field, email);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
    field?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function fillPassword(password: string) {
  await act(async () => {
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Текущий пароль (если установлен)"]');
    expect(field).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, password);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
    field?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function send() {
  await act(async () => find("Отправить письмо")?.click());
}
async function render() {
  await act(async () => root.render(createElement(ChangeEmailScreen)));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.logged = true;
  m.loading = false;
  m.mail.mockResolvedValue({ success: false, code: "NETWORK_ERROR" });
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
describe("AG3 V47 account email existing mounted source/mock", () => {
  it("invalid email and unverified owner never POST", async () => {
    await render();
    await send();
    await show("Введите email");
    expect(m.mail).not.toHaveBeenCalled();
  });
  it("email change one POST despite doubletap and exact owner epoch guard", async () => {
    const d = waiting<{ success: boolean }>();
    m.mail.mockReturnValueOnce(d.promise);
    await render();
    await fill("  test@example.com  ");
    await act(async () => {
      find("Отправить письмо")?.click();
      find("Отправить письмо")?.click();
    });
    expect(m.mail).toHaveBeenCalledOnce();
    expect(m.mail.mock.calls[0][0]).toBe("test@example.com");
    expect((m.mail.mock.calls[0][1] as () => boolean)()).toBe(true);
    await act(async () => d.resolve({ success: false }));
    await show("Результат отправки неизвестен");
    expect(find("Отправить письмо")?.disabled).toBe(true);
  });
  it("current password is sent only to API, known 400 allows correction", async () => {
    m.mail.mockResolvedValueOnce({ success: false, error: "Неверный текущий пароль" });
    await render();
    await fill("test@example.com");
    await fillPassword("CurrentPass123");
    await send();
    await show("Введите правильный текущий пароль.");
    expect(m.mail.mock.calls[0][2]).toBe("CurrentPass123");
    expect(find("Отправить письмо")?.disabled).toBe(false);
  });
  it("unknown 503 never surfaces untrusted backend text or auto-sends again", async () => {
    m.mail.mockResolvedValueOnce({
      success: false,
      code: "EMAIL_CHANGE_UNAVAILABLE",
      error: "private driver detail",
    });
    await render();
    await fill("test@example.com");
    await send();
    await show("Результат отправки неизвестен");
    expect(host.textContent).not.toContain("private driver detail");
    await send();
    expect(m.mail).toHaveBeenCalledOnce();
  });
  it("confirmed ACK displays sent-state and prevents a second submission", async () => {
    m.mail.mockResolvedValue({ success: true });
    await render();
    await fill("test@example.com");
    await send();
    await show("Письмо отправлено. Проверьте новый почтовый ящик.");
    expect(m.mail).toHaveBeenCalledOnce();
    expect(m.success).toHaveBeenCalledOnce();
    await send();
    expect(m.mail).toHaveBeenCalledOnce();
  });
  it("same owner new epoch while ACK pending does not show success or schedule navigation", async () => {
    const d = waiting<{ success: boolean }>();
    m.mail.mockReturnValueOnce(d.promise);
    await render();
    await fill("test@example.com");
    await send();
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    await render();
    expect((m.mail.mock.calls[0][1] as () => boolean)()).toBe(false);
    await act(async () => d.resolve({ success: true }));
    expect(m.back).not.toHaveBeenCalled();
    expect(m.success).not.toHaveBeenCalled();
  });
  it("unmount suppresses late positive ACK and navigation", async () => {
    const d = waiting<{ success: boolean }>();
    m.mail.mockReturnValueOnce(d.promise);
    await render();
    await fill("test@example.com");
    await send();
    await act(async () => root.unmount());
    await act(async () => d.resolve({ success: true }));
    expect(m.back).not.toHaveBeenCalled();
    expect(m.success).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
