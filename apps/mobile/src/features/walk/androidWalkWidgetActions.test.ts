import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const empty = () => ({
    active: null as import("./walkModel").DogWalk | null,
    completed: [] as import("./walkModel").DogWalk[],
    preference: { mode: "stopwatch" as const, countdownMinutes: 30 },
  });
  return {
    owner: null as string | null,
    journal: empty(),
    empty,
    published: vi.fn(),
    notified: vi.fn(),
    synced: vi.fn(),
    startSteps: vi.fn(),
    pauseSteps: vi.fn(),
    snapshot: vi.fn(),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => mock.owner) },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000042" }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("./walkStorage", () => ({
  loadWalkJournal: vi.fn(async () => structuredClone(mock.journal)),
  saveWalkJournal: vi.fn(async (_owner: string, data: typeof mock.journal) => {
    mock.journal = structuredClone(data);
  }),
}));
vi.mock("./walkWidgetSnapshot", () => ({
  publishWalkWidgetSnapshot: (...args: unknown[]) => mock.published(...args),
}));
vi.mock("./androidBackgroundSteps", () => ({
  getAndroidWalkStepAvailability: vi.fn(async () => "counter"),
  getAndroidWalkStepSnapshot: (...args: unknown[]) => mock.snapshot(...args),
  startAndroidWalkSteps: (...args: unknown[]) => mock.startSteps(...args),
  pauseAndroidWalkSteps: (...args: unknown[]) => mock.pauseSteps(...args),
  reconcileAndroidWalkSteps: (walk: import("./walkModel").DogWalk, owner: string, native: {
    ownerId: string; walkId: string; steps: number; incomplete: boolean
  } | null) =>
    native?.ownerId === owner && native.walkId === walk.clientId
      ? { ...walk, steps: Math.max(walk.steps, native.steps), incompleteSteps: walk.incompleteSteps || native.incomplete }
      : walk,
}));
vi.mock("./walkNotifications", () => ({ syncWalkNotifications: (...args: unknown[]) => mock.notified(...args) }));
vi.mock("./walkSync", () => ({
  syncDogWalkHistory: (...args: unknown[]) => mock.synced(...args),
  reportWalkSyncIssue: vi.fn(),
}));

import { handleAndroidWalkWidgetClick } from "./androidWalkWidgetActions";

describe("native Android widget start/pause/finish background actions", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mock.owner = "owner-42";
    mock.journal = mock.empty();
    mock.published.mockReset();
    mock.notified.mockReset();
    mock.synced.mockReset().mockResolvedValue(undefined);
    mock.startSteps.mockReset().mockImplementation(async (_owner: string, walk: {clientId: string}) => ({
      ownerId: "owner-42", walkId: walk.clientId, steps: 0, incomplete: false, running: true,
    }));
    mock.pauseSteps.mockReset().mockImplementation(async (_owner: string, walk: {clientId: string}) => ({
      ownerId: "owner-42", walkId: walk.clientId, steps: 42, incomplete: false, running: false,
    }));
    mock.snapshot.mockReset().mockResolvedValue(null);
  });

  it("does not launch a private walk without a verified bound owner", async () => {
    mock.owner = null;
    await handleAndroidWalkWidgetClick("start");
    expect(mock.startSteps).not.toHaveBeenCalled();
    expect(mock.journal.active).toBeNull();
  });

  it("starts once, pauses with final sensor steps, resumes and finishes to local history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T10:00:00.000Z"));
    await handleAndroidWalkWidgetClick("start");
    await handleAndroidWalkWidgetClick("start"); // double tap must not restart
    expect(mock.startSteps).toHaveBeenCalledTimes(1);
    expect(mock.journal.active?.clientId).toBe("00000000-0000-4000-8000-000000000042");

    vi.advanceTimersByTime(60000);
    await handleAndroidWalkWidgetClick("pause");
    expect(mock.pauseSteps).toHaveBeenCalledTimes(1);
    expect(mock.journal.active?.steps).toBe(42);
    expect(mock.journal.active?.runningSinceMs).toBeNull();
    expect(mock.journal.active?.elapsedBeforePauseMs).toBe(60000);

    await handleAndroidWalkWidgetClick("pause"); // idempotent
    expect(mock.pauseSteps).toHaveBeenCalledTimes(1);
    await handleAndroidWalkWidgetClick("start");
    expect(mock.startSteps).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(20000);
    await handleAndroidWalkWidgetClick("finish");
    expect(mock.journal.active).toBeNull();
    expect(mock.journal.completed).toHaveLength(1);
    expect(mock.journal.completed[0].steps).toBe(42);
    expect(mock.journal.completed[0].elapsedBeforePauseMs).toBe(80000);
    expect(mock.synced).toHaveBeenCalledWith("owner-42");
    expect(mock.published).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("ignores unknown actions", async () => {
    await handleAndroidWalkWidgetClick("open-app");
    expect(mock.journal.active).toBeNull();
    expect(mock.startSteps).not.toHaveBeenCalled();
  });
});
