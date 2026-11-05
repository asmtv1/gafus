import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  get: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  pending: vi.fn(),
  ack: vi.fn(),
  setOwner: vi.fn(),
  startGps: vi.fn(),
  stopGps: vi.fn(),
  meters: vi.fn(),
  publish: vi.fn(),
  pedometer: vi.fn(),
  permissions: vi.fn(),
  sync: vi.fn(),
  report: vi.fn(),
  notificationPermissions: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("expo", () => ({
  requireNativeModule: () => ({
    pendingDogWalkCommands: mocked.pending,
    setVerifiedDogWalkWidgetOwner: mocked.setOwner,
    ackDogWalkCommand: mocked.ack,
  }),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "203e78bf-e7f0-4ed6-bec4-b48b0ad85068" }));
vi.mock("expo-sensors", () => ({
  Pedometer: { getStepCountAsync: mocked.pedometer, getPermissionsAsync: mocked.permissions },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: mocked.get } }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isLoading: false,
      isAuthenticated: true,
      verifiedSessionEpoch: "valid",
      user: { id: "owner" },
    }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocked.report }));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: mocked.notificationPermissions }));
vi.mock("./walkNotifications", () => ({ syncWalkNotifications: mocked.notify }));
vi.mock("./walkStorage", () => ({ loadWalkJournal: mocked.load, saveWalkJournal: mocked.save }));
vi.mock("./walkGpsStorage", () => ({ gpsWalkMeters: mocked.meters }));
vi.mock("./walkGpsTask", () => ({ startWalkGps: mocked.startGps, stopWalkGps: mocked.stopGps }));
vi.mock("./walkWidgetSnapshot", () => ({ publishWalkWidgetSnapshot: mocked.publish }));
vi.mock("./androidWalkWidgetActions", () => ({ WALK_WIDGET_OWNER_KEY: "owner-key" }));
vi.mock("./walkSync", () => ({
  syncDogWalkHistory: mocked.sync,
  reportWalkSyncIssue: mocked.report,
}));
import type { WalkJournal } from "./walkStorage";
import { processPendingIosWalkCommands } from "./iosWalkWidgetActions";
const command = (action: "start" | "pause" | "finish", id: string) => ({
  action,
  id,
  ownerId: "owner",
  timestamp: Date.now(),
});
const base = (): WalkJournal => ({
  active: null,
  completed: [],
  preference: { mode: "stopwatch", countdownMinutes: 30 },
});
beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.get.mockResolvedValue("owner");
  mocked.load.mockResolvedValue(base());
  mocked.save.mockResolvedValue(undefined);
  mocked.pending.mockReturnValue([]);
  mocked.pedometer.mockResolvedValue({ steps: 30 });
  mocked.permissions.mockResolvedValue({ granted: true });
  mocked.startGps.mockResolvedValue(true);
  mocked.stopGps.mockResolvedValue(undefined);
  mocked.meters.mockResolvedValue(125);
  mocked.publish.mockResolvedValue(undefined);
  mocked.sync.mockResolvedValue(undefined);
  mocked.notificationPermissions.mockResolvedValue({ granted: true });
  mocked.notify.mockResolvedValue(undefined);
});
describe("iOS AppIntent home screen commands", () => {
  it("starts directly from a durable widget command without a navigation link", async () => {
    mocked.pending.mockReturnValue([command("start", "da0bfb64-ae93-4474-acb8-81b6cb489f7a")]);
    await processPendingIosWalkCommands();
    expect(mocked.startGps).toHaveBeenCalledWith("owner", "203e78bf-e7f0-4ed6-bec4-b48b0ad85068");
    expect(mocked.save).toHaveBeenCalled();
    expect(mocked.ack).toHaveBeenCalledTimes(1);
  });
  it("stops tracking at pause and finish and includes GPS meters in completed walk", async () => {
    const { startWalk } = await import("./walkModel");
    const active = {
      ...startWalk("stopwatch", Date.now() - 120000),
      clientId: "203e78bf-e7f0-4ed6-bec4-b48b0ad85068",
      gpsEnabled: true,
    };
    mocked.load.mockResolvedValue({
      active,
      completed: [],
      preference: { mode: "stopwatch", countdownMinutes: 30 },
    });
    mocked.pending.mockReturnValue([command("pause", "da0bfb64-ae93-4474-acb8-81b6cb489f7a")]);
    await processPendingIosWalkCommands();
    expect(mocked.stopGps).toHaveBeenCalledTimes(1);
    const paused = mocked.save.mock.calls.at(-1)![1];
    expect(paused.active.runningSinceMs).toBeNull();
    mocked.load.mockResolvedValue({
      active,
      completed: [],
      preference: { mode: "stopwatch", countdownMinutes: 30 },
    });
    mocked.pending.mockReturnValue([command("finish", "da0bfb64-ae93-4474-acb8-81b6cb489f7a")]);
    await processPendingIosWalkCommands();
    const finished = mocked.save.mock.calls.at(-1)![1];
    expect(finished.active).toBeNull();
    expect(finished.completed[0].gpsMeters).toBe(125);
  });
  it("never changes a private walk without a verified stored owner", async () => {
    mocked.get.mockResolvedValue(null);
    mocked.pending.mockReturnValue([command("start", "da0bfb64-ae93-4474-acb8-81b6cb489f7a")]);
    await processPendingIosWalkCommands();
    expect(mocked.startGps).not.toHaveBeenCalled();
    expect(mocked.save).not.toHaveBeenCalled();
  });
});

describe("iOS widget account isolation", () => {
  it("acknowledges stale commands without executing another account private session", async () => {
    mocked.pending.mockReturnValue([
      {
        action: "start",
        ownerId: "former-user",
        id: "da0bfb64-ae93-4474-acb8-81b6cb489f7a",
        timestamp: Date.now(),
      },
    ]);
    await processPendingIosWalkCommands();
    expect(mocked.startGps).not.toHaveBeenCalled();
    expect(mocked.ack).toHaveBeenCalledTimes(1);
  });
});

describe("iOS widget ordered transition acceptance", () => {
  it("applies start → pause → resume → finish in a single durable command drain", async () => {
    let saved: WalkJournal = base();
    mocked.load.mockImplementation(async () => saved);
    mocked.save.mockImplementation(async (_ownerId: string, next: typeof saved) => {
      saved = structuredClone(next);
    });
    mocked.pending.mockReturnValue([
      command("start", "da0bfb64-ae93-4474-acb8-81b6cb489f71"),
      command("pause", "da0bfb64-ae93-4474-acb8-81b6cb489f72"),
      command("start", "da0bfb64-ae93-4474-acb8-81b6cb489f73"),
      command("finish", "da0bfb64-ae93-4474-acb8-81b6cb489f74"),
    ]);
    await processPendingIosWalkCommands();
    expect(saved.active).toBeNull();
    expect(saved.completed).toHaveLength(1);
    expect(saved.completed[0].gpsMeters).toBe(125);
    expect(saved.completed[0].steps).toBe(60);
    expect(mocked.startGps).toHaveBeenCalledTimes(2);
    expect(mocked.stopGps).toHaveBeenCalledTimes(2);
    expect(mocked.ack).toHaveBeenCalledTimes(4);
    expect(mocked.publish).toHaveBeenCalledTimes(4);
  });
});
