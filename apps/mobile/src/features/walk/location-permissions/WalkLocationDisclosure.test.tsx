// @vitest-environment jsdom
import React, { act, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WalkJournal } from "../walkStorage";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, user: { id: "walk-owner" }, verifiedSessionEpoch: "session" },
  action: undefined as string | undefined,
  router: { setParams: vi.fn(), back: vi.fn() },
  appState: { currentState: "active" },
  listeners: new Set<(state: string) => void>(),
  location: { foreground: false, background: false },
  askForeground: vi.fn(),
  askBackground: vi.fn(),
  startGps: vi.fn(),
  stopGps: vi.fn(),
  startSteps: vi.fn(),
  pauseSteps: vi.fn(),
  schedule: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("react-native", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    AppState: {
      get currentState() { return mocks.appState.currentState; },
      addEventListener: (_event: string, listener: (state: string) => void) => {
        mocks.listeners.add(listener);
        return { remove: () => mocks.listeners.delete(listener) };
      },
    },
    Platform: { OS: "android", Version: 31 },
    View: Container,
    ScrollView: Container,
    TextInput: () => null,
    StyleSheet: { create: (value: unknown) => value },
    Pressable: ({
      children, onPress, accessibilityLabel, disabled,
    }: PropsWithChildren<{
      onPress: () => void;
      accessibilityLabel?: string;
      disabled?: boolean;
    }>) => (
      <button type="button" onClick={onPress} aria-label={accessibilityLabel} disabled={disabled}>
        {children}
      </button>
    ),
    Modal: ({ children, onRequestClose }: PropsWithChildren<{ onRequestClose: () => void }>) => (
      <div role="dialog" onKeyDown={(event) => event.key === "Escape" && onRequestClose()}>
        {children}
      </div>
    ),
  };
});
vi.mock("react-native-paper", () => ({
  Text: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/shared/components/ui/Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>{label}</button>
  ),
}));
vi.mock("@/shared/components", () => ({
  TexturedSafeAreaView: ({ children }: PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("expo-router", () => ({
  useRouter: () => mocks.router,
  useLocalSearchParams: () => ({ action: mocks.action }),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "walk-id" }));
vi.mock("expo-sensors", () => ({
  Pedometer: { requestPermissionsAsync: async () => ({ granted: true }) },
}));
vi.mock("expo-location", () => ({
  hasServicesEnabledAsync: async () => true,
  getForegroundPermissionsAsync: async () => ({
    granted: mocks.location.foreground, canAskAgain: true,
  }),
  getBackgroundPermissionsAsync: async () => ({
    granted: mocks.location.background, canAskAgain: true,
  }),
  requestForegroundPermissionsAsync: mocks.askForeground,
  requestBackgroundPermissionsAsync: mocks.askBackground,
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (select: (value: typeof mocks.auth) => unknown) => select(mocks.auth),
    { getState: () => mocks.auth },
  ),
}));
vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));
vi.mock("../walkGpsTask", () => ({ startWalkGps: mocks.startGps, stopWalkGps: mocks.stopGps }));
vi.mock("../walkGpsStorage", () => ({ gpsWalkMeters: async () => null }));
vi.mock("../walkStorage", () => ({
  loadWalkJournal: mocks.load,
  saveWalkJournal: mocks.save,
  emptyWalkJournal: () => ({
    active: null,
    completed: [],
    preference: { mode: "stopwatch", countdownMinutes: 30 },
  }),
}));
vi.mock("../WalkRouteMap", () => ({
  WalkRouteMap: ({ live }: { live: boolean }) => <div data-live={String(live)} />,
}));
vi.mock("../walkWidgetSnapshot", () => ({ publishWalkWidgetSnapshot: async () => undefined }));
vi.mock("../walkSync", () => ({ syncDogWalkHistory: async () => undefined, reportWalkSyncIssue: vi.fn() }));
vi.mock("../walkNotifications", () => ({
  configureWalkAlertPermission: async () => true,
  syncWalkNotifications: mocks.schedule,
}));
vi.mock("../androidBackgroundSteps", () => ({
  getAndroidWalkStepSnapshot: async () => null,
  getAndroidWalkStepAvailability: async () => "counter",
  startAndroidWalkSteps: mocks.startSteps,
  pauseAndroidWalkSteps: mocks.pauseSteps,
  reconcileAndroidWalkSteps: (walk: unknown) => walk,
}));

import DogWalkScreen from "../../../../app/(main)/walk";
import { startWalk } from "../walkModel";
import { emptyWalkJournal } from "../walkStorage";

let host: HTMLDivElement;
let root: Root;
let journal: WalkJournal;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.action = undefined;
  mocks.appState.currentState = "active";
  mocks.auth = {
    isAuthenticated: true,
    isLoading: false,
    user: { id: "walk-owner" },
    verifiedSessionEpoch: "session",
  };
  mocks.location = { foreground: false, background: false };
  mocks.askForeground.mockImplementation(async () => {
    mocks.location.foreground = true;
    return { granted: true };
  });
  mocks.askBackground.mockImplementation(async () => {
    mocks.location.background = true;
    return { granted: true };
  });
  mocks.startGps.mockImplementation(async () =>
    mocks.location.foreground && mocks.location.background,
  );
  journal = emptyWalkJournal();
  mocks.load.mockImplementation(async () => structuredClone(journal));
  mocks.save.mockImplementation(async (_owner, next) => { journal = structuredClone(next); });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const dialog = () => host.querySelector('[role="dialog"]');
const retryLabel = "Включить GPS-маршрут прогулки";

async function press(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function renderWalk() {
  await act(async () => root.render(<DogWalkScreen />));
}

async function returnToApp() {
  await act(async () => {
    for (const state of ["background", "active"]) {
      mocks.appState.currentState = state;
      for (const listener of mocks.listeners) listener(state);
    }
  });
}

it("starts timer and steps, shows disclosure, and requests location only after consent", async () => {
  await renderWalk();
  expect(dialog()).toBeNull();
  await press("Начать прогулку");
  expect(dialog()?.textContent).toContain("в фоновом режиме");
  expect(dialog()?.textContent).toContain("сервере GAFUS");
  expect(mocks.startSteps).toHaveBeenCalledOnce();
  expect(journal.active?.runningSinceMs).toBeTypeOf("number");
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(mocks.startGps).not.toHaveBeenCalled();

  await press("Продолжить");
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).toHaveBeenCalledOnce();
  expect(mocks.askForeground.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.askBackground.mock.invocationCallOrder[0]!,
  );
  expect(mocks.startGps).toHaveBeenCalledOnce();
  expect(journal.active?.gpsEnabled).toBe(true);
});

it.each(["Не сейчас", "Назад"])("keeps walking without GPS after %s and supports a deliberate retry", async (action) => {
  await renderWalk();
  await press("Начать прогулку");
  if (action === "Назад") {
    await act(async () => {
      dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  } else {
    await press(action);
  }
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(mocks.startGps).not.toHaveBeenCalled();
  expect(journal.active?.runningSinceMs).toBeTypeOf("number");
  await press("Пауза прогулки");
  await press("Продолжить прогулку");
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  await press(retryLabel);
  expect(dialog()).not.toBeNull();
  await press("Продолжить");
  expect(journal.active?.gpsEnabled).toBe(true);
});

it("handles denial after settings without opening the dialog again or resetting the walk", async () => {
  mocks.askBackground.mockResolvedValue({ granted: false });
  await renderWalk();
  await press("Начать прогулку");
  const startedAtMs = journal.active?.startedAtMs;
  await press("Продолжить");
  await returnToApp();
  expect(dialog()).toBeNull();
  expect(mocks.askBackground).toHaveBeenCalledOnce();
  expect(mocks.startGps).not.toHaveBeenCalled();
  expect(journal.active?.startedAtMs).toBe(startedAtMs);
  expect(host.querySelector(`[aria-label="${retryLabel}"]`)).not.toBeNull();
});

it("restores a recorded walk silently and keeps its route available after revocation", async () => {
  journal.active = {
    ...startWalk("stopwatch", Date.now() - 1000),
    clientId: "restored-walk", gpsEnabled: true, gpsMeters: 42,
  };
  mocks.location = { foreground: true, background: true };
  await renderWalk();
  expect(mocks.startGps).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-live="true"]')).not.toBeNull();
  mocks.location.background = false;
  await returnToApp();
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(host.querySelector('[data-live="false"]')).not.toBeNull();
  expect(host.querySelector(`[aria-label="${retryLabel}"]`)).not.toBeNull();
  expect(journal.active).toMatchObject({ clientId: "restored-walk", gpsEnabled: true, gpsMeters: 42 });
  await press("Пауза прогулки");
  expect(mocks.stopGps).toHaveBeenCalledWith("walk-owner", "restored-walk");
  expect(mocks.pauseSteps).toHaveBeenLastCalledWith("walk-owner", expect.any(Object), false);
  await press("Завершить прогулку");
  expect(mocks.pauseSteps).toHaveBeenLastCalledWith("walk-owner", expect.any(Object), true);
  expect(mocks.schedule).toHaveBeenLastCalledWith("walk-owner", null, false);
  expect(journal.active).toBeNull();
  expect(journal.completed[0]).toMatchObject({ gpsEnabled: true, gpsMeters: 42 });
});

it("does not initiate location permission from a launcher link on mount", async () => {
  mocks.action = "start";
  await renderWalk();
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(journal.active?.runningSinceMs).toBeTypeOf("number");
});

it("starts directly when both permissions already exist", async () => {
  mocks.location = { foreground: true, background: true };
  await renderWalk();
  await press("Начать прогулку");
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(mocks.startGps).toHaveBeenCalledOnce();
  expect(journal.active?.gpsEnabled).toBe(true);
});

it("dismisses a pending disclosure when the verified account changes", async () => {
  await renderWalk();
  await press("Начать прогулку");
  expect(dialog()).not.toBeNull();
  journal = emptyWalkJournal();
  mocks.auth = { ...mocks.auth, user: { id: "another-owner" }, verifiedSessionEpoch: "other-session" };
  await renderWalk();
  expect(dialog()).toBeNull();
  expect(mocks.askForeground).not.toHaveBeenCalled();
  expect(mocks.askBackground).not.toHaveBeenCalled();
  expect(mocks.startGps).not.toHaveBeenCalled();
  expect(journal.active).toBeNull();
});
