import { describe, it, expect, vi } from "vitest";
import { reducePendingDailyTimers, readOwnPendingDailyTimers } from "./newOnlyV2DailyPending";
import type { NewOnlyV2Queues, V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";
const ev = (kind: string, extra: Record<string, unknown> = {}): V2PendingEvent => ({
  kind,
  eventId: kind,
  createdAt: 1,
  payload: { scheduleId: "dailyA", stepIndex: 0, ...extra },
});
const owner: V2SessionBinding = {
  schemaVersion: 2,
  principalId: "A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
function make(events: V2PendingEvent[]) {
  let binding: V2SessionBinding | null = owner;
  const getPending = vi.fn(async () => events);
  return {
    queue: { getVerifiedBinding: () => binding, getPending } as unknown as NewOnlyV2Queues,
    set: (v: V2SessionBinding | null) => {
      binding = v;
    },
    getPending,
  };
}
describe("AG3 daily pending v2 schedule isolation", () => {
  it("applies start pause resume reset complete in persisted order", () => {
    const e = [
      ev("dailyCourseStartStep", { durationSec: 80, status: "IN_PROGRESS" }),
      ev("dailyCoursePauseStep", { timeLeftSec: 24 }),
      ev("dailyCourseResumeStep"),
    ];
    expect(reducePendingDailyTimers(e, "dailyA")[0]).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 24,
    });
    expect(reducePendingDailyTimers([...e, ev("dailyCourseResetStep")], "dailyA")[0].status).toBe(
      "RESET",
    );
    expect(
      reducePendingDailyTimers(
        [...e, ev("dailyCourseResetStep"), ev("dailyCourseCompleteStep")],
        "dailyA",
      )[0].status,
    ).toBe("COMPLETED");
  });
  it("never mixes normal course/day, another schedule or malformed time", () => {
    const rows = reducePendingDailyTimers(
      [
        ev("startStep", { durationSec: 90 }),
        ev("dailyCourseStartStep", {
          scheduleId: "dailyB",
          durationSec: 88,
          status: "IN_PROGRESS",
        }),
        ev("dailyCourseStartStep", { durationSec: 70, status: "IN_PROGRESS" }),
        ev("dailyCoursePauseStep", { timeLeftSec: -2 }),
      ],
      "dailyA",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "IN_PROGRESS", remainingSec: 70 });
  });
  it("requires verified owner and rejects principal change in flight", async () => {
    const s = make([ev("dailyCourseResetStep")]);
    s.set(null);
    expect(await readOwnPendingDailyTimers(s.queue, "A", "dailyA")).toEqual([]);
    expect(s.getPending).not.toHaveBeenCalled();
    s.set(owner);
    s.getPending.mockImplementationOnce(async () => {
      s.set({ ...owner, principalId: "B" });
      return [ev("dailyCourseResetStep")];
    });
    expect(await readOwnPendingDailyTimers(s.queue, "A", "dailyA")).toEqual([]);
  });
  it("rejects epoch switch while awaiting", async () => {
    const s = make([ev("dailyCourseResetStep")]);
    s.getPending.mockImplementationOnce(async () => {
      s.set({ ...owner, authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029" });
      return [ev("dailyCourseResetStep")];
    });
    expect(await readOwnPendingDailyTimers(s.queue, "A", "dailyA")).toEqual([]);
  });
  it("storage failure rejects; safe restart read recovers durable events", async () => {
    const s = make([ev("dailyCourseResetStep")]);
    s.getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnPendingDailyTimers(s.queue, "A", "dailyA")).rejects.toThrow(
      "V2_QUARANTINED",
    );
    expect(await readOwnPendingDailyTimers(s.queue, "A", "dailyA")).toHaveLength(1);
  });
});
