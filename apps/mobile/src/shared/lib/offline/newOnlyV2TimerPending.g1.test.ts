import { describe, it, expect, vi } from "vitest";
import { reducePendingTimers, readOwnPendingTimers } from "./newOnlyV2TimerPending";
import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";
const entry = (kind: string, extra: Record<string, unknown> = {}): V2PendingEvent => ({
  eventId: kind,
  createdAt: 1,
  kind,
  payload: { courseId: "c_one", dayOnCourseId: "c_day", stepIndex: 1, ...extra },
});
const a = {
  schemaVersion: 2 as const,
  principalId: "A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
function queue(events: V2PendingEvent[]) {
  let owner: typeof a | null = a;
  const getPending = vi.fn(async () => events);
  return {
    q: { getVerifiedBinding: () => owner, getPending } as unknown as NewOnlyV2Queues,
    getPending,
    switchOwner: (o: typeof a | null) => {
      owner = o;
    },
  };
}
describe("AG3 Phase1 ordered timer pending", () => {
  it("retains pause remaining on resume and reset→complete sequence", () => {
    const e = [
      entry("startStep", { durationSec: 50 }),
      entry("pauseStep", { timeLeftSec: 20 }),
      entry("resumeStep"),
    ];
    expect(reducePendingTimers(e, "c_one", "c_day")[0]).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 20,
    });
    expect(reducePendingTimers([...e, entry("resetStep")], "c_one", "c_day")[0].status).toBe(
      "RESET",
    );
    expect(
      reducePendingTimers(
        [...e, entry("resetStep"), entry("completeTheoryStep")],
        "c_one",
        "c_day",
      )[0].status,
    ).toBe("COMPLETED");
  });
  it("ignores corrupt payload/time and other days", () => {
    expect(
      reducePendingTimers(
        [
          entry("startStep", { durationSec: 50 }),
          entry("pauseStep", { timeLeftSec: -1 }),
          entry("resetStep", { dayOnCourseId: "else" }),
        ],
        "c_one",
        "c_day",
      )[0].status,
    ).toBe("IN_PROGRESS");
  });
  it("requires owner and rejects principal/epoch switch while awaiting", async () => {
    const s = queue([entry("startStep", { durationSec: 50 })]);
    s.switchOwner(null);
    expect(await readOwnPendingTimers(s.q, "A", "c_one", "c_day")).toEqual([]);
    expect(s.getPending).not.toHaveBeenCalled();
    s.switchOwner(a);
    s.getPending.mockImplementationOnce(async () => {
      s.switchOwner({ ...a, authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029" });
      return [entry("startStep", { durationSec: 50 })];
    });
    expect(await readOwnPendingTimers(s.q, "A", "c_one", "c_day")).toEqual([]);
  });
  it("propagates quarantine and allows new read after restart", async () => {
    const s = queue([entry("startStep", { durationSec: 50 })]);
    s.getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnPendingTimers(s.q, "A", "c_one", "c_day")).rejects.toThrow(
      "V2_QUARANTINED",
    );
    expect(await readOwnPendingTimers(s.q, "A", "c_one", "c_day")).toHaveLength(1);
  });
});
