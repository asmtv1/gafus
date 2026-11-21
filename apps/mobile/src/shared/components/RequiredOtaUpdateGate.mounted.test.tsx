// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  username: "admin",
  authenticated: true,
  serverSuccess: true,
  serverReady: true,
  cachedPolicy: false,
  progress: 0.32,
  required: true,
  version: "1.7.5-ota.6",
  check: vi.fn(),
  fetch: vi.fn(),
  reload: vi.fn(),
  refetch: vi.fn(),
  grant: vi.fn(),
  optionalHook: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const node = (tag: string) => (p: { children?: ReactNode; testID?: string; onPress?: () => void }) =>
    React.createElement(tag, { "data-testid": p.testID, onClick: p.onPress }, p.children);
  return {
    View: node("div"), Text: node("span"), ScrollView: node("div"), Image: node("div"),
    ActivityIndicator: () => React.createElement("span", null, "loading"),
    Platform: { OS: "android" },
    StyleSheet: { create: (x: unknown) => x, absoluteFill: {} },
    useWindowDimensions: () => ({ height: 960, width: 430 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 16 }) }));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#333", error: "red", textSecondary: "#777" },
  FONTS: { montserrat: "Arial", montserratBold: "Arial", montserratMedium: "Arial" },
  SPACING: { lg: 16, md: 12 },
}));
vi.mock("@/shared/components/ui", async () => {
  const React = await import("react");
  return { Button: (p: { label: string; onPress: () => void }) => React.createElement("button", { onClick: p.onPress }, p.label) };
});
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.7.5" }));
vi.mock("expo-updates", () => ({
  isEnabled: true, runtimeVersion: "1.7.5", channel: "production",
  useUpdates: () => ({ isUpdatePending: false, downloadProgress: state.progress }),
  checkForUpdateAsync: state.check, fetchUpdateAsync: state.fetch, reloadAsync: state.reload,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: state.getItem, setItem: state.setItem },
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({
    user: { id: "server-verified-actor", username: state.username }, isAuthenticated: state.authenticated,
    isLoading: false, verifiedSessionEpoch: state.authenticated ? "epoch" : null,
  }),
}));
vi.mock("@/shared/lib/ota/mandatoryPolicyQuery", () => ({
  useMandatoryOtaCohortDecision: () => ({
    isSuccess: state.serverReady && state.serverSuccess,
    isError: state.serverReady && !state.serverSuccess,
    data: (state.serverReady && state.serverSuccess) || state.cachedPolicy ? {
      required: state.required, version: state.required ? state.version : null,
      selectedRevision: state.required ? 6 : 5,
    } : undefined,
    refetch: state.refetch,
  }),
}));
vi.mock("@/shared/lib/otaPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/otaPolicy")>();
  return { ...actual, activeOtaRevision: () => 5 };
});
vi.mock("@/shared/hooks/useOtaAutoApply", () => ({ useOtaAutoApply: state.optionalHook }));
vi.mock("@/shared/lib/ota/installationIdentity", () => ({
  refreshOtaTesterGrant: state.grant, selfHostedOtaActive: () => true,
}));
vi.mock("@/shared/lib/ota/telemetry", () => ({ trackOtaEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/shared/lib/otaDownloadSize", () => ({
  formatOtaMegabytes: (b: number) => String(Math.round(b / 1_000_000)),
  getOtaMainBundleBytes: vi.fn().mockResolvedValue(8_500_000),
}));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));

import { RequiredOtaUpdateGate } from "./RequiredOtaUpdateGate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const render = () => act(async () => root.render(createElement(RequiredOtaUpdateGate, {
  children: createElement("div", { "data-testid": "main-courses-screen" }, "Курсы открыты"),
})));

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  vi.clearAllMocks();
  state.username = "admin";
  state.authenticated = true;
  state.serverSuccess = true;
  state.serverReady = true;
  state.cachedPolicy = false;
  state.progress = 0.32;
  state.required = true;
  state.version = "1.7.5-ota.6";
  state.check.mockResolvedValue({ isAvailable: false });
  state.fetch.mockResolvedValue({});
  state.reload.mockResolvedValue(undefined);
  state.grant.mockResolvedValue(undefined);
  state.getItem.mockResolvedValue(null);
  state.setItem.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("mandatory 1.7.5 OTA runtime gate", () => {
  it("never mounts main navigation on unavailable required OTA or a fetch error", async () => {
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.querySelector('[data-testid="required-ota-screen"]')).not.toBeNull();
    expect(host.textContent).toContain("Повторить загрузку");
    expect(state.optionalHook).toHaveBeenCalledWith(false);
    expect(state.grant).toHaveBeenCalledOnce();
  });
  it("retry button starts another OTA check and immediately shows checking instead of the old error", async () => {
    await render();
    expect(state.check).toHaveBeenCalledTimes(1);
    state.check.mockImplementation(() => new Promise(() => {}));
    const button = Array.from(host.querySelectorAll("button")).find(el =>
      el.textContent?.includes("Повторить загрузку"));
    expect(button).toBeDefined();
    await act(async () => { button?.click(); });
    expect(state.check).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Проверяем обновление");
    expect(host.textContent).not.toContain("Обновление пока недоступно");
  });
  it("shows resource finalization instead of a frozen 99% during slow asset fetch", async () => {
    state.progress = 0.99;
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "22222222-2222-4222-8222-222222222222" } });
    state.fetch.mockImplementation(() => new Promise(() => {}));
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.querySelector('[data-testid="ota-finalizing-hint"]')).not.toBeNull();
    expect(host.textContent).toContain("Завершаем загрузку и проверку ресурсов");
    expect(host.textContent).not.toContain("99%");
  });
  it("keeps the main screen blocked while an available OTA is downloading", async () => {
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "11111111-1111-4111-8111-111111111111" } });
    state.fetch.mockImplementation(() => new Promise(() => {}));
    await render();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.textContent).toContain("Загружаем обновление");
    expect(state.reload).not.toHaveBeenCalled();
  });
  it("does not lock out a valid native release after a transient mandatory-policy failure", async () => {
    state.serverReady = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.querySelector('[data-testid="required-ota-screen"]')).not.toBeNull();
    expect(state.check).not.toHaveBeenCalled();
    state.serverReady = true;
    state.serverSuccess = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).not.toBeNull();
    expect(state.optionalHook).toHaveBeenCalledWith(false);
  });
  it("still blocks when a previously confirmed mandatory revision is cached", async () => {
    state.serverSuccess = false;
    state.cachedPolicy = true;
    await render();
    expect(host.querySelector('[data-testid="required-ota-screen"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
  });
  it("does not lock out users outside the selected rollout cohort, including at 0%", async () => {
    state.username = "visitor";
    state.required = false; // server selected revision 5, below required revision 6
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).not.toBeNull();
    expect(state.check).not.toHaveBeenCalled();
  });
  it("blocks an ordinary account when the server selected it for a staged mandatory rollout", async () => {
    state.username = "visitor";
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.textContent).toContain("ОБЯЗАТЕЛЬНОЕ ОБНОВЛЕНИЕ");
  });
  it("unblocks only after the newly compiled revision is current", async () => {
    state.required = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="required-ota-screen"]')).toBeNull();
  });
});
