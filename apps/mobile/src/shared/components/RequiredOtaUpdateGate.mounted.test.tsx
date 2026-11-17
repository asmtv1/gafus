// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  username: "admin",
  authenticated: true,
  serverSuccess: true,
  serverReady: true,
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
  useUpdates: () => ({ isUpdatePending: false, downloadProgress: 0.32 }),
  checkForUpdateAsync: state.check, fetchUpdateAsync: state.fetch, reloadAsync: state.reload,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: state.getItem, setItem: state.setItem },
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({
    user: { username: state.username }, isAuthenticated: state.authenticated,
    isLoading: false, verifiedSessionEpoch: state.authenticated ? "epoch" : null,
  }),
}));
vi.mock("@/shared/lib/api/public-config-query", () => ({
  useMobileAppPublicConfig: () => ({
    isSuccess: state.serverReady, isError: !state.serverReady,
    data: state.serverReady ? {
      success: state.serverSuccess,
      data: { ota: { required: state.required, version: state.version, platform: "android", channel: "production" } },
    } : undefined,
    refetch: state.refetch,
  }),
}));
vi.mock("@/shared/lib/otaPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/otaPolicy")>();
  return { ...actual, activeOtaRevision: () => 5 };
});
vi.mock("@/shared/hooks/useOtaAutoApply", () => ({ useOtaAutoApply: state.optionalHook }));
vi.mock("@/shared/lib/ota/installationIdentity", () => ({ refreshOtaTesterGrant: state.grant }));
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
  it("keeps the main screen blocked while an available OTA is downloading", async () => {
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "11111111-1111-4111-8111-111111111111" } });
    state.fetch.mockImplementation(() => new Promise(() => {}));
    await render();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.textContent).toContain("Загружаем обновление");
    expect(state.reload).not.toHaveBeenCalled();
  });
  it("fails closed when mandatory policy request or its response fails", async () => {
    state.serverReady = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(host.textContent).toContain("Не удалось проверить обязательные обновления");
    expect(state.check).not.toHaveBeenCalled();
    state.serverReady = true;
    state.serverSuccess = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).toBeNull();
    expect(state.check).not.toHaveBeenCalled();
  });
  it("does not lock out non-tester accounts from an OTA rollout of 0%", async () => {
    state.username = "visitor";
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).not.toBeNull();
    expect(state.check).not.toHaveBeenCalled();
  });
  it("unblocks only after the newly compiled revision is current", async () => {
    state.required = false;
    await render();
    expect(host.querySelector('[data-testid="main-courses-screen"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="required-ota-screen"]')).toBeNull();
  });
});
