import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => state.values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      state.values.set(key, value);
    }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import { finishWalk, pauseWalk, resumeWalk, startWalk } from "./walkModel";
import { emptyWalkJournal, loadWalkJournal, saveWalkJournal } from "./walkStorage";

beforeEach(() => state.values.clear());
describe("per-account persisted dog walk journal", () => {
  it("isolates one account from another, persisting mode and paused state", async () => {
    const active = pauseWalk(startWalk("countdown", 1_000, 900), 301_000);
    await saveWalkJournal("alice", {
      ...emptyWalkJournal(),
      active,
      preference: { mode: "countdown", countdownMinutes: 15 },
    });
    expect((await loadWalkJournal("alice")).active?.runningSinceMs).toBeNull();
    expect((await loadWalkJournal("alice")).preference.countdownMinutes).toBe(15);
    expect(await loadWalkJournal("bob")).toEqual(emptyWalkJournal());
  });

  it("restores and completes paused walks, keeping their final elapsed time", async () => {
    const walk = resumeWalk(pauseWalk(startWalk("stopwatch", 0), 90_000), 300_000);
    await saveWalkJournal("alice", { ...emptyWalkJournal(), active: walk });
    const restored = (await loadWalkJournal("alice")).active!;
    expect(finishWalk(restored, 330_000).elapsedBeforePauseMs).toBe(120_000);
  });

  it("migrates old records without preferences and filters malformed items", async () => {
    state.values.set(
      "gafus:dog-walk:v1:alice",
      JSON.stringify({
        active: { startedAtMs: 100, finishedAtMs: null, steps: 0, incompleteSteps: false },
        completed: [{ startedAtMs: 50, finishedAtMs: 75, steps: 10, incompleteSteps: false }, null],
      }),
    );
    const loaded = await loadWalkJournal("alice");
    expect(loaded.active?.runningSinceMs).toBe(100);
    expect(loaded.active?.clientId).toBe("00000000-0000-4000-8000-000000000064");
    expect(loaded.completed).toHaveLength(1);
    expect(loaded.preference.mode).toBe("stopwatch");
    expect(loaded.completed[0]?.elapsedBeforePauseMs).toBe(25);
    expect(loaded.completed[0]?.clientId).toBe("00000000-0000-4000-8000-000000000032");
  });
});
