import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  task: undefined as undefined | ((arg: { data?: unknown; error?: Error }) => Promise<void>),
  register: vi.fn(),
  services: vi.fn(),
  fg: vi.fn(),
  bg: vi.fn(),
  already: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  active: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  deactivateAll: vi.fn(),
  persist: vi.fn(),
  getMotion: vi.fn(),
  setMotion: vi.fn(),
  report: vi.fn(),
}));
vi.mock("expo-task-manager", () => ({
  defineTask: (name: string, fn: typeof mocked.task) => {
    mocked.register(name);
    mocked.task = fn;
  },
}));
vi.mock("expo-location", () => ({
  Accuracy: { High: 5 },
  ActivityType: { Fitness: 3 },
  hasServicesEnabledAsync: mocked.services,
  getForegroundPermissionsAsync: mocked.fg,
  getBackgroundPermissionsAsync: mocked.bg,
  hasStartedLocationUpdatesAsync: mocked.already,
  startLocationUpdatesAsync: mocked.start,
  stopLocationUpdatesAsync: mocked.stop,
  requestForegroundPermissionsAsync: mocked.fg,
  requestBackgroundPermissionsAsync: mocked.bg,
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("./walkGpsStorage", () => ({
  activeGpsSession: mocked.active,
  activateGpsSession: mocked.activate,
  deactivateGpsSession: mocked.deactivate,
  deactivateAllGpsSessions: mocked.deactivateAll,
  persistGpsBatch: mocked.persist,
  readGpsMotionPolicy: mocked.getMotion,
  saveGpsMotionPolicy: mocked.setMotion,
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocked.report }));
import {
  DOG_WALK_GPS_TASK,
  requestWalkGpsPermissions,
  startWalkGps,
  stopWalkGps,
  adaptWalkGpsToMotion,
} from "./walkGpsTask";
const owner = "own-user";
const walk = "203e78bf-e7f0-4ed6-bec4-b48b0ad85068";
beforeEach(() => {
  for (const fn of [
    mocked.services,
    mocked.fg,
    mocked.bg,
    mocked.already,
    mocked.start,
    mocked.stop,
    mocked.active,
    mocked.activate,
    mocked.deactivate,
    mocked.deactivateAll,
    mocked.persist,
    mocked.getMotion,
    mocked.setMotion,
    mocked.report,
  ])
    fn.mockReset();
  mocked.services.mockResolvedValue(true);
  mocked.fg.mockResolvedValue({ granted: true });
  mocked.bg.mockResolvedValue({ granted: true });
  mocked.active.mockResolvedValue(null);
  mocked.already.mockResolvedValue(false);
  mocked.activate.mockResolvedValue(undefined);
  mocked.deactivate.mockResolvedValue(undefined);
  mocked.persist.mockResolvedValue(1);
  mocked.getMotion.mockResolvedValue({
    mode: "walking",
    candidate: null,
    candidateSinceMs: 0,
    changedAtMs: 0,
  });
  mocked.setMotion.mockResolvedValue(undefined);
});
describe("Expo TaskManager GPS background lifecycle", () => {
  it("registers a headless task and persists a batch without React screens", async () => {
    expect(mocked.register).toHaveBeenCalledWith(DOG_WALK_GPS_TASK);
    await mocked.task?.({
      data: {
        locations: [
          {
            coords: { latitude: 53.195, longitude: 50.1, accuracy: 5, speed: 1 },
            timestamp: 123456,
          },
        ],
      },
    });
    expect(mocked.persist).toHaveBeenCalledWith([
      { latitude: 53.195, longitude: 50.1, accuracy: 5, speed: 1, timestamp: 123456 },
    ]);
  });
  it("never starts GPS without foreground + background permission", async () => {
    mocked.bg.mockResolvedValue({ granted: false });
    expect(await requestWalkGpsPermissions()).toBe(false);
    expect(await startWalkGps(owner, walk)).toBe(false);
    expect(mocked.activate).not.toHaveBeenCalled();
    expect(mocked.start).not.toHaveBeenCalled();
  });
  it("starts owner-scoped GPS before invoking native location service", async () => {
    expect(await startWalkGps(owner, walk)).toBe(true);
    expect(mocked.activate).toHaveBeenCalledWith(owner, walk);
    expect(mocked.start).toHaveBeenCalledWith(
      DOG_WALK_GPS_TASK,
      expect.objectContaining({
        distanceInterval: 5,
        timeInterval: 4000,
        foregroundService: expect.objectContaining({
          notificationTitle: expect.stringContaining("прогулка"),
        }),
      }),
    );
    expect(mocked.activate.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.start.mock.invocationCallOrder[0],
    );
  });
  it("does not restart an already active task on repeated start", async () => {
    mocked.active.mockResolvedValue({ ownerId: owner, walkId: walk });
    mocked.already.mockResolvedValue(true);
    expect(await startWalkGps(owner, walk)).toBe(true);
    expect(mocked.start).not.toHaveBeenCalled();
  });
  it("ensures pause persists before stopping native updates", async () => {
    await stopWalkGps(owner, walk);
    expect(mocked.deactivate).toHaveBeenCalledWith(owner, walk);
    expect(mocked.stop).not.toHaveBeenCalled();
    mocked.already.mockResolvedValue(true);
    await stopWalkGps(owner, walk);
    expect(mocked.deactivate.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      mocked.stop.mock.invocationCallOrder.at(-1)!,
    );
  });
  it("starts a new segment after a killed OS task and deactivates on native start failure", async () => {
    mocked.active.mockResolvedValue({ ownerId: owner, walkId: walk });
    mocked.start.mockRejectedValue(new Error("location denied"));
    await expect(startWalkGps(owner, walk)).rejects.toThrow("location denied");
    expect(mocked.deactivate).toHaveBeenCalledTimes(2);
    expect(mocked.activate).toHaveBeenCalledWith(owner, walk);
  });
});

describe("adaptive Expo location updates", () => {
  const p = (speed: number, timestamp: number) => ({
    latitude: 53.1,
    longitude: 50.1,
    timestamp,
    accuracy: 5,
    speed,
  });
  it("reconfigures native delivery after sustained stationarity", async () => {
    mocked.active.mockResolvedValue({ ownerId: owner, walkId: walk });
    mocked.already.mockResolvedValue(true);
    await adaptWalkGpsToMotion([p(0, 60_000)]);
    expect(mocked.setMotion).toHaveBeenCalledWith(
      owner,
      walk,
      expect.objectContaining({ candidate: "stationary" }),
    );
    mocked.getMotion.mockResolvedValue({
      mode: "walking",
      candidate: "stationary",
      candidateSinceMs: 60_000,
      changedAtMs: 0,
    });
    await adaptWalkGpsToMotion([p(0, 110_000)]);
    expect(mocked.start).toHaveBeenCalledWith(
      DOG_WALK_GPS_TASK,
      expect.objectContaining({ distanceInterval: 25, timeInterval: 20_000 }),
    );
    expect(mocked.setMotion).toHaveBeenLastCalledWith(
      owner,
      walk,
      expect.objectContaining({ mode: "stationary" }),
    );
  });
  it("does not reactivate tracking after pause", async () => {
    mocked.active.mockResolvedValue(null);
    await adaptWalkGpsToMotion([p(1.5, 60_000)]);
    expect(mocked.start).not.toHaveBeenCalled();
  });
  it("keeps original GPS persistence successful when adaptation errors", async () => {
    mocked.active.mockRejectedValue(new Error("motion read unavailable"));
    await mocked.task?.({
      data: {
        locations: [
          {
            timestamp: 90_000,
            coords: { latitude: 53.1, longitude: 50.1, accuracy: 5, speed: 1.2 },
          },
        ],
      },
    });
    expect(mocked.persist).toHaveBeenCalledTimes(1);
    expect(mocked.report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ issueKey: "DogWalkGpsAdaptiveMode" }),
    );
  });
});

describe("Android launcher widget starts the Expo background location service", () => {
  it("only tags explicit widget clicks as user-initiated foreground-service requests", async () => {
    expect(await startWalkGps(owner, walk, true)).toBe(true);
    expect(mocked.start).toHaveBeenCalledWith(
      DOG_WALK_GPS_TASK,
      expect.objectContaining({ widgetInitiated: true, foregroundService: expect.any(Object) }),
    );
    mocked.start.mockClear();
    expect(await startWalkGps(owner, walk)).toBe(true);
    expect(mocked.start.mock.calls[0]?.[1]?.widgetInitiated).toBeUndefined();
  });
});
