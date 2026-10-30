import { describe, it, expect, vi } from "vitest";
import { projectV2Timer, readOwnRestoredTimer } from "./newOnlyV2TimerRestore";
import type { NewOnlyV2Queues, V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";
const epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
const binding: V2SessionBinding = { schemaVersion: 2, principalId: "A", authEpoch: epoch };
const base = 100000;
const ev = (
  kind: string,
  at: number,
  other: Record<string, unknown> = {},
  daily = false,
): V2PendingEvent => ({
  eventId: kind,
  createdAt: at,
  kind,
  payload: {
    ...(daily ? { scheduleId: "schedule" } : { courseId: "course", dayOnCourseId: "day" }),
    stepIndex: 0,
    ...other,
  },
});
const ordinary = { courseId: "course", dayId: "day", stepIndex: 0, daily: false };
const daily = { courseId: "daily-course:schedule", dayId: "schedule", stepIndex: 0, daily: true };
describe("AG3 owner-attested v2 restart timer", () => {
  it("elapsed time counts only running, not paused, and pause->resume survives restart", () => {
    const start = ev("startStep", base, { durationSec: 60 });
    expect(projectV2Timer([start], ordinary, base + 10000)).toEqual({
      status: "RUNNING",
      remainingSec: 50,
    });
    const pause = ev("pauseStep", base + 15000, { timeLeftSec: 45 });
    expect(projectV2Timer([start, pause], ordinary, base + 60000)).toEqual({
      status: "PAUSED",
      remainingSec: 45,
    });
    expect(
      projectV2Timer([start, pause, ev("resumeStep", base + 65000)], ordinary, base + 75000),
    ).toEqual({ status: "RUNNING", remainingSec: 35 });
  });
  it("daily restart, reset->complete, schedule isolation and expired local timer", () => {
    const first = ev("dailyCourseStartStep", base, { durationSec: 20 }, true);
    const series = [
      first,
      ev("dailyCoursePauseStep", base + 5000, { timeLeftSec: 17 }, true),
      ev("dailyCourseResumeStep", base + 6000, {}, true),
    ];
    expect(projectV2Timer(series, daily, base + 7000)).toEqual({
      status: "RUNNING",
      remainingSec: 16,
    });
    expect(
      projectV2Timer(
        [...series, ev("dailyCourseResetStep", base + 8000, {}, true)],
        daily,
        base + 10000,
      ),
    ).toEqual({ status: "STOPPED", remainingSec: 0 });
    expect(
      projectV2Timer(
        [
          ...series,
          ev("dailyCourseResetStep", base + 8000, {}, true),
          ev("dailyCourseCompleteStep", base + 9000, {}, true),
        ],
        daily,
        base + 10000,
      ),
    ).toEqual({ status: "STOPPED", remainingSec: 0 });
    expect(projectV2Timer(series, ordinary, base + 7000)).toBeNull();
    expect(
      projectV2Timer([ev("startStep", base, { durationSec: 2 })], ordinary, base + 3000),
    ).toEqual({ status: "STOPPED", remainingSec: 0 });
  });
  it("rejects inconsistent order, future clock and corrupt durations", () => {
    expect(projectV2Timer([ev("resumeStep", base)], ordinary, base + 1000)).toBeNull();
    expect(
      projectV2Timer([ev("startStep", base + 10000, { durationSec: 10 })], ordinary, base),
    ).toBeNull();
    expect(
      projectV2Timer([ev("startStep", base, { durationSec: -1 })], ordinary, base + 100),
    ).toBeNull();
    expect(
      projectV2Timer(
        [
          ev("startStep", base + 3000, { durationSec: 10 }),
          ev("pauseStep", base + 1000, { timeLeftSec: 8 }),
        ],
        ordinary,
        base + 5000,
      ),
    ).toBeNull();
  });
  it("uses time after delayed storage read rather than stale pre-await time", async () => {
    let currentNow = base + 1000;
    const queue = {
      getVerifiedBinding: () => binding,
      getPending: async () => {
        currentNow = base + 10000;
        return [ev("startStep", base, { durationSec: 20 })];
      },
    } as unknown as NewOnlyV2Queues;
    expect(await readOwnRestoredTimer(queue, "A", ordinary, () => currentNow)).toEqual({
      status: "RUNNING",
      remainingSec: 10,
    });
  });
  it("fences unknown owner, epoch change during read, storage failure and recovery", async () => {
    let current: V2SessionBinding | null = binding;
    const getPending = vi.fn(async () => [ev("startStep", base, { durationSec: 20 })]);
    const queue = { getVerifiedBinding: () => current, getPending } as unknown as NewOnlyV2Queues;
    expect(await readOwnRestoredTimer(queue, "B", ordinary, base + 1000)).toBeNull();
    expect(getPending).not.toHaveBeenCalled();
    getPending.mockImplementationOnce(async () => {
      current = { ...binding, authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029" };
      return [ev("startStep", base, { durationSec: 20 })];
    });
    expect(await readOwnRestoredTimer(queue, "A", ordinary, base + 1000)).toBeNull();
    current = binding;
    getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnRestoredTimer(queue, "A", ordinary, base + 1000)).rejects.toThrow(
      "V2_QUARANTINED",
    );
    expect(await readOwnRestoredTimer(queue, "A", ordinary, base + 1000)).toEqual({
      status: "RUNNING",
      remainingSec: 19,
    });
  });
});
