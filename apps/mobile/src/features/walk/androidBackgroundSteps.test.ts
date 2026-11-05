import { beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  availability: vi.fn(),
  snapshot: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  finish: vi.fn(),
  pauseAny: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: { GafusDogWalkSteps: native },
}));
import {
  getAndroidWalkStepAvailability,
  getAndroidWalkStepSnapshot,
  startAndroidWalkSteps,
  pauseAndroidWalkSteps,
  pauseAnyAndroidWalkSteps,
  reconcileAndroidWalkSteps,
} from "./androidBackgroundSteps";
import { startWalk } from "./walkModel";
const local = { ...startWalk("stopwatch", 1000), clientId: "walk-1", steps: 17 };
const snapshot = {
  ownerId: "owner-1",
  walkId: "walk-1",
  steps: 32,
  running: true,
  incomplete: false,
  sensor: "counter" as const,
};
beforeEach(() => {
  for (const mocked of Object.values(native)) mocked.mockReset();
  native.availability.mockResolvedValue("counter");
  native.snapshot.mockResolvedValue(snapshot);
  native.start.mockResolvedValue(snapshot);
  native.pause.mockResolvedValue({ ...snapshot, running: false });
  native.finish.mockResolvedValue({ ...snapshot, running: false });
  native.pauseAny.mockResolvedValue(undefined);
});
describe("native Android walking steps", () => {
  it("adopts persisted steps after a locked screen", () => {
    expect(reconcileAndroidWalkSteps(local, "owner-1", snapshot)).toMatchObject({
      steps: 32,
      incompleteSteps: false,
    });
  });
  it("refuses another owner or another walk ID", () => {
    expect(reconcileAndroidWalkSteps(local, "owner-2", snapshot)).toBe(local);
    expect(reconcileAndroidWalkSteps(local, "owner-1", { ...snapshot, walkId: "walk-2" })).toBe(
      local,
    );
    expect(reconcileAndroidWalkSteps(local, "owner-1", null)).toBe(local);
  });
  it("keeps higher phone steps and existing incomplete flags", () => {
    const prior = { ...local, steps: 40, incompleteSteps: true };
    expect(reconcileAndroidWalkSteps(prior, "owner-1", snapshot)).toBe(prior);
    expect(
      reconcileAndroidWalkSteps(local, "owner-1", { ...snapshot, incomplete: true }),
    ).toMatchObject({ steps: 32, incompleteSteps: true });
  });
  it("starts, pauses, finishes the current session", async () => {
    expect(await getAndroidWalkStepAvailability()).toBe("counter");
    expect(await getAndroidWalkStepSnapshot()).toEqual(snapshot);
    await startAndroidWalkSteps("owner-1", local);
    expect(native.start).toHaveBeenCalledWith("owner-1", "walk-1", 17);
    await pauseAndroidWalkSteps("owner-1", local);
    expect(native.pause).toHaveBeenCalledWith("owner-1", "walk-1");
    await pauseAndroidWalkSteps("owner-1", local, true);
    expect(native.finish).toHaveBeenCalledWith("owner-1", "walk-1");
    await pauseAnyAndroidWalkSteps("owner-1");
    expect(native.pauseAny).toHaveBeenCalledWith("owner-1");
  });
  it("rejects unbound walks and surfaces native failures", async () => {
    await expect(startAndroidWalkSteps("owner-1", startWalk("stopwatch", 1000))).rejects.toThrow(
      "WALK_NATIVE_MODULE_MISSING",
    );
    expect(native.start).not.toHaveBeenCalled();
    native.pause.mockRejectedValue(new Error("WALK_ACTOR_MISMATCH"));
    await expect(pauseAndroidWalkSteps("owner-1", local)).rejects.toThrow("WALK_ACTOR_MISMATCH");
  });
});
