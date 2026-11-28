// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import type { AppStateStatus } from "react-native";
import type * as otaPolicy from "@/shared/lib/otaPolicy";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "account-1",
  epoch: "epoch-1",
  generation: 1 as number | null,
  authenticated: true,
  loading: false,
  appState: "active" as AppStateStatus,
  platform: "android" as "android" | "ios",
  listeners: new Set<(status: AppStateStatus) => void>(),
  remove: vi.fn(),
  progress: 0.32,
  check: vi.fn(),
  nativeLogs: vi.fn(),
  telemetry: vi.fn(),
  fetch: vi.fn(),
  reload: vi.fn(),
  policy: vi.fn(),
  grant: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  type NodeProps = { children?: ReactNode; testID?: string; onPress?: () => void };
  const node = (tag: string) => (p: NodeProps) =>
    React.createElement(tag, { "data-testid": p.testID, onClick: p.onPress }, p.children);
  return {
    View: node("div"), Text: node("span"), ScrollView: node("div"), Image: node("div"),
    ActivityIndicator: () => React.createElement("span", null, "loading"),
    AppState: {
      get currentState() { return state.appState; },
      addEventListener: (_event: string, listener: (status: AppStateStatus) => void) => {
        state.listeners.add(listener);
        return { remove: () => { state.remove(); state.listeners.delete(listener); } };
      },
    },
    Platform: { get OS() { return state.platform; } },
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
  readLogEntriesAsync: state.nativeLogs,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: state.getItem, setItem: state.setItem },
}));
vi.mock("@/shared/stores/authStore", () => {
  const getState = () => ({
    user: state.authenticated ? { id: state.userId } : null,
    isAuthenticated: state.authenticated,
    isLoading: state.loading,
    verifiedSessionEpoch: state.authenticated ? state.epoch : null,
  });
  return {
    getSettledAuthSessionGeneration: () => state.generation,
    useAuthStore: Object.assign((select: (auth: ReturnType<typeof getState>) => unknown) =>
      select(getState()), { getState }),
  };
});
vi.mock("@/shared/lib/ota/mandatoryPolicyQuery", () => ({
  fetchMandatoryOtaCohortDecision: state.policy,
}));
vi.mock("@/shared/lib/otaPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof otaPolicy>();
  return { ...actual, activeOtaRevision: () => 5 };
});
vi.mock("@/shared/lib/ota/installationIdentity", () => ({
  refreshOtaTesterGrant: state.grant, selfHostedOtaActive: () => true,
}));
vi.mock("@/shared/lib/ota/telemetry", () => ({
  trackOtaEvent: state.telemetry,
  trackOtaLaunch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/shared/lib/otaDownloadSize", () => ({
  formatOtaMegabytes: (b: number) => String(Math.round(b / 1_000_000)),
  getOtaMainBundleBytes: async () => 8_500_000,
}));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));

import { RequiredOtaUpdateGate } from "./RequiredOtaUpdateGate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let settleRequest: (() => void) | undefined;
const screen = (id: string) => host.querySelector('[data-testid="' + id + '"]');
const render = (route = "courses") => act(async () => root.render(createElement(RequiredOtaUpdateGate, {
  children: createElement("div", { key: route, "data-testid": route }, route),
})));
const emit = (...statuses: AppStateStatus[]) => act(async () => {
  for (const status of statuses) {
    state.appState = status;
    for (const listener of state.listeners) listener(status);
  }
});

function holdRequest<T>(result: T) {
  return new Promise<T>(resolve => { settleRequest = () => resolve(result); });
}

const required = { required: true, version: "1.7.5-ota.6", selectedRevision: 6 };
const optional = { required: false, version: null, selectedRevision: 5 };

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  vi.resetAllMocks();
  state.authenticated = true;
  state.loading = false;
  state.userId = "account-1";
  state.epoch = "epoch-1";
  state.generation = 1;
  state.appState = "active";
  state.platform = "android";
  state.progress = 0.32;
  state.policy.mockResolvedValue(required);
  state.check.mockResolvedValue({ isAvailable: false });
  state.fetch.mockResolvedValue({});
  state.reload.mockResolvedValue(undefined);
  state.nativeLogs.mockResolvedValue([]);
  state.telemetry.mockResolvedValue(undefined);
  state.grant.mockResolvedValue(undefined);
  state.getItem.mockResolvedValue(null);
  state.setItem.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await act(async () => { settleRequest?.(); });
  settleRequest = undefined;
  vi.useRealTimers();
  host.remove();
});

describe("OTA checks on app openings", () => {
  beforeEach(() => {
    state.policy.mockResolvedValue(optional);
  });

  it("checks policy and availability once on launch and stays quiet for 60 seconds", async () => {
    vi.useFakeTimers();
    await render();
    expect(state.policy).toHaveBeenCalledOnce();
    expect(state.check).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(state.policy).toHaveBeenCalledOnce();
    expect(state.check).toHaveBeenCalledOnce();
    expect(state.listeners.size).toBe(1);
  });

  it("checks the public rollout when opened signed out without requesting private policy", async () => {
    state.authenticated = false;
    await render("sign-in");
    expect(state.policy).toHaveBeenCalledWith(expect.objectContaining({userId:null}));
    expect(state.check).toHaveBeenCalledOnce();
  });

  it("runs once after each background return, even across repeated active notifications", async () => {
    await render();
    await emit("active", "inactive", "active");
    expect(state.check).toHaveBeenCalledOnce();

    await emit("inactive", "background", "inactive", "active", "active", "active");
    expect(state.policy).toHaveBeenCalledTimes(2);
    expect(state.check).toHaveBeenCalledTimes(2);

    await emit("background", "active");
    expect(state.check).toHaveBeenCalledTimes(3);
    expect(state.listeners.size).toBe(1);
  });

  it("shares the in-flight check when the user reopens during the request", async () => {
    state.check.mockImplementationOnce(() => holdRequest({ isAvailable: false }));
    await render();
    await emit("background", "active", "active");
    expect(state.policy).toHaveBeenCalledOnce();
    expect(state.check).toHaveBeenCalledOnce();
    await act(async () => { settleRequest?.(); });
    await emit("background", "active");
    expect(state.check).toHaveBeenCalledTimes(2);
  });

  it("waits for settled auth, checks a new account once, and ignores ordinary renders", async () => {
    state.loading = true;
    await render();
    expect(state.policy).not.toHaveBeenCalled();
    state.loading = false;
    await render();
    await render("profile");
    await render("feed");
    expect(screen("feed")).not.toBeNull();
    state.authenticated = false;
    await render("sign-in");
    expect(state.policy).toHaveBeenCalledTimes(2);
    state.authenticated = true;
    state.epoch = "epoch-2";
    state.generation = 2;
    await render("courses");
    expect(state.policy).toHaveBeenCalledTimes(3);
    expect(state.check).toHaveBeenCalledTimes(3);
    expect(state.listeners.size).toBe(1);
    await emit("background", "active");
    expect(state.policy).toHaveBeenCalledTimes(4);
    expect(state.policy.mock.lastCall?.[0]).toMatchObject({ epoch: "epoch-2" });
  });

  it("ignores a policy response from an earlier credential generation", async () => {
    state.policy.mockImplementationOnce(() => holdRequest(required));
    await render();
    state.generation = null;
    await render();
    await act(async () => { settleRequest?.(); });
    expect(screen("courses")).not.toBeNull();
    expect(state.grant).not.toHaveBeenCalled();
    expect(state.check).not.toHaveBeenCalled();

    state.generation = 2;
    state.epoch = "epoch-2";
    await render();
    expect(state.policy).toHaveBeenCalledTimes(2);
    await emit("background", "active");
    expect(state.policy).toHaveBeenCalledTimes(3);
    expect(state.check).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed availability check until the next opening", async () => {
    vi.useFakeTimers();
    state.check.mockRejectedValueOnce(new Error("Network request failed"));
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(state.check).toHaveBeenCalledOnce();
    expect(screen("courses")).not.toBeNull();

    await emit("background", "active");
    expect(state.check).toHaveBeenCalledTimes(2);
  });
});

describe("mandatory 1.7.5 OTA runtime gate", () => {
  it("blocks navigation when a confirmed mandatory OTA is unavailable", async () => {
    await render();
    expect(screen("courses")).toBeNull();
    expect(screen("required-ota-screen")).not.toBeNull();
    expect(host.textContent).toContain("Повторить загрузку");
    expect(state.grant).toHaveBeenCalledOnce();
  });

  it("retry button makes another Expo check and immediately shows checking", async () => {
    await render();
    expect(state.check).toHaveBeenCalledOnce();
    state.check.mockImplementationOnce(() => holdRequest({ isAvailable: false }));

    const button = Array.from(host.querySelectorAll("button")).find(el =>
      el.textContent?.includes("Повторить загрузку"));
    expect(button).toBeDefined();
    await act(async () => { button?.click(); });

    expect(state.check).toHaveBeenCalledTimes(2);
    expect(state.grant).toHaveBeenCalledTimes(2);
    expect(state.policy).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Проверяем обновление");
    expect(host.textContent).not.toContain("Обновление пока недоступно");
  });

  it("ignores a retry button from an earlier session before the next render", async () => {
    await render();
    const button = host.querySelector("button");
    expect(button?.textContent).toContain("Повторить загрузку");
    state.epoch = "epoch-2";
    state.generation = 2;

    await act(async () => { button?.click(); });

    expect(state.check).toHaveBeenCalledOnce();
    expect(state.grant).toHaveBeenCalledOnce();
  });

  it("shows resource finalization while a download remains at 99%", async () => {
    state.progress = 0.99;
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "available-update" } });
    state.fetch.mockImplementation(() => holdRequest({}));
    await render();

    expect(state.fetch).toHaveBeenCalledOnce();
    expect(screen("courses")).toBeNull();
    expect(screen("ota-finalizing-hint")).not.toBeNull();
    expect(host.textContent).toContain("Завершаем загрузку и проверку ресурсов");
    expect(host.textContent).not.toContain("99%");
    expect(state.reload).not.toHaveBeenCalled();
  });

  it("reports a verified mandatory failure separately from generic OTA errors", async () => {
    state.check.mockImplementation(async () => {
      state.nativeLogs.mockResolvedValue([{timestamp: Date.now(), code: "UpdateHasInvalidSignature"}]);
      throw new Error("Native update check failed");
    });
    await render();
    expect(screen("required-ota-screen")).not.toBeNull();
    expect(screen("courses")).toBeNull();
    const events = state.telemetry.mock.calls.map(call => call[0]);
    expect(events).toContain("MANDATORY_ATTEMPT");
    expect(events).toContain("MANDATORY_INCOMPLETE");
    expect(events).toContain("SIGNATURE_REJECTED");
    expect(events).toContain("UPDATE_ERROR");
    expect(state.reload).not.toHaveBeenCalled();
  });

  it("reports a hanging required download without changing the mandatory gate", async () => {
    vi.useFakeTimers();
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "available-update" } });
    state.fetch.mockImplementation(() => holdRequest({}));
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(state.telemetry.mock.calls.filter(call => call[0] === "MANDATORY_INCOMPLETE")).toHaveLength(1);
    expect(screen("courses")).toBeNull();
    expect(state.reload).not.toHaveBeenCalled();
  });

  it("downloads and reloads a confirmed update", async () => {
    state.check.mockResolvedValue({ isAvailable: true, manifest: { id: "available-update" } });
    await render();

    expect(screen("courses")).toBeNull();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.setItem).toHaveBeenCalledWith("@gafus/forced-ota-attempt-v1:android:1.7.5-ota.6", "reloaded");
    expect(state.reload).toHaveBeenCalledOnce();
  });

  it("leaves navigation available on a temporary policy error without scheduling a retry", async () => {
    vi.useFakeTimers();
    state.policy.mockRejectedValueOnce(new Error("Policy temporarily unavailable"));
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(screen("courses")).not.toBeNull();
    expect(screen("required-ota-screen")).toBeNull();
    expect(state.policy).toHaveBeenCalledOnce();
    expect(state.check).not.toHaveBeenCalled();
  });

  it("keeps a confirmed mandatory revision blocked when the next policy request fails", async () => {
    await render();
    state.policy.mockRejectedValueOnce(new Error("Policy temporarily unavailable"));
    await emit("background", "active");

    expect(state.policy).toHaveBeenCalledTimes(2);
    expect(state.check).toHaveBeenCalledOnce();
    expect(screen("required-ota-screen")).not.toBeNull();
    expect(screen("courses")).toBeNull();
  });

  it("respects the server's cohort decision and unblocks after a later optional decision", async () => {
    await render();
    state.policy.mockResolvedValue(optional);
    await emit("background", "active");

    expect(screen("courses")).not.toBeNull();
    expect(screen("required-ota-screen")).toBeNull();
    expect(state.check).toHaveBeenCalledTimes(2);
  });
});

describe("OTA startup and interactive login exclusion", () => {
  it.each(["android","ios"] as const)("hides sign-in on %s during guest policy, mandatory download and reload", async (platform) => {
    state.platform = platform;
    state.authenticated = false;
    state.policy.mockImplementationOnce(() => holdRequest(required));
    state.check.mockResolvedValue({isAvailable:true,manifest:{id:"public-update"}});
    state.fetch.mockImplementationOnce(() => holdRequest({}));
    await render("sign-in");
    expect(screen("sign-in")).toBeNull();
    expect(screen("required-ota-screen")).not.toBeNull();
    await act(async () => { settleRequest?.(); });
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(screen("sign-in")).toBeNull();
    expect(state.reload).not.toHaveBeenCalled();
    await act(async () => { settleRequest?.(); });
    expect(state.reload).toHaveBeenCalledOnce();
    expect(screen("sign-in")).toBeNull();
  });
  it("retries a failed public policy instead of exposing a misleading login failure", async () => {
    state.authenticated=false;
    state.policy.mockRejectedValueOnce(new Error("Policy offline")).mockResolvedValue(optional);
    await render("sign-in");
    expect(screen("sign-in")).toBeNull();
    expect(state.check).not.toHaveBeenCalled();
    await act(async () => { host.querySelector("button")?.click(); });
    expect(state.policy).toHaveBeenCalledTimes(2);
    expect(screen("sign-in")).not.toBeNull();
  });
  it("never starts a background guest check after the sign-in form opens", async () => {
    state.authenticated=false;
    state.policy.mockResolvedValue(optional);
    await render("sign-in");
    expect(screen("sign-in")).not.toBeNull();
    await emit("background","active");
    expect(state.policy).toHaveBeenCalledOnce();
    expect(state.check).toHaveBeenCalledOnce();
    expect(state.reload).not.toHaveBeenCalled();
  });
  it("shows progress for an optional guest update too", async () => {
    state.authenticated=false;
    state.policy.mockResolvedValue(optional);
    state.check.mockResolvedValue({isAvailable:true,manifest:{id:"optional-update"}});
    state.fetch.mockImplementationOnce(() => holdRequest({}));
    await render("sign-in");
    expect(screen("sign-in")).toBeNull();
    expect(screen("required-ota-screen")).not.toBeNull();
    expect(state.reload).not.toHaveBeenCalled();
    await act(async () => { settleRequest?.(); });
    expect(state.reload).toHaveBeenCalledOnce();
    expect(screen("sign-in")).toBeNull();
  });
});

it("keeps the guest sign-in hidden until a native download from a stale session has settled", async () => {
  state.authenticated=false;
  state.policy.mockResolvedValue(optional);
  await render("sign-in");
  expect(screen("sign-in")).not.toBeNull();
  state.authenticated=true;
  state.generation=2;
  state.check.mockResolvedValue({isAvailable:true,manifest:{id:"personal-update"}});
  state.fetch.mockImplementationOnce(()=>holdRequest({}));
  await render("courses");
  expect(state.fetch).toHaveBeenCalledOnce();
  state.authenticated=false;
  state.generation=3;
  await render("sign-in");
  expect(screen("sign-in")).toBeNull();
  await act(async()=>{settleRequest?.();});
  expect(state.reload).not.toHaveBeenCalled();
  expect(screen("sign-in")).not.toBeNull();
});
