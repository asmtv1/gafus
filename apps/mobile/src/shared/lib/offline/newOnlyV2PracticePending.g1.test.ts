import { describe, expect, it, vi } from "vitest";
import { readOwnPendingPractice } from "./newOnlyV2PracticePending";
import type { NewOnlyV2Queues, V2SessionBinding } from "./newOnlyV2Queues";
const A: V2SessionBinding = {
  schemaVersion: 2,
  principalId: "A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
const B: V2SessionBinding = {
  schemaVersion: 2,
  principalId: "B",
  authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029",
};
const entry = {
  eventId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
  createdAt: 1,
  kind: "completePracticeStep",
  payload: { courseId: "course-1", dayOnCourseId: "day-1", stepIndex: 2 },
};
function setup(entries: unknown[] = [entry]) {
  let binding: V2SessionBinding | null = A;
  const getPending = vi.fn(async () => entries);
  const queue = { getVerifiedBinding: () => binding, getPending } as unknown as NewOnlyV2Queues;
  return {
    queue,
    getPending,
    change: (v: V2SessionBinding | null) => {
      binding = v;
    },
  };
}
describe("AG3 OFF021 practice pending view Phase1 only", () => {
  it("reads only current course/day minimal metadata", async () => {
    const s = setup([
      entry,
      { ...entry, payload: { ...entry.payload, dayOnCourseId: "day-2" } },
      { ...entry, kind: "startStep" },
    ]);
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([
      { eventId: entry.eventId, stepIndex: 2 },
    ]);
  });
  it("does not read unverified or another owner", async () => {
    const s = setup();
    s.change(null);
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([]);
    s.change(B);
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([]);
    expect(s.getPending).not.toHaveBeenCalled();
  });
  it("drops response after owner switch in-flight", async () => {
    const s = setup();
    s.getPending.mockImplementationOnce(async () => {
      s.change(B);
      return [entry];
    });
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([]);
  });
  it("drops response after same-owner new epoch", async () => {
    const s = setup();
    s.getPending.mockImplementationOnce(async () => {
      s.change({ ...A, authEpoch: B.authEpoch });
      return [entry];
    });
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([]);
  });
  it("ignores malformed progress records", async () => {
    const s = setup([
      { ...entry, payload: { ...entry.payload, stepIndex: -1 } },
      { ...entry, payload: { ...entry.payload, stepIndex: "2" } },
    ]);
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toEqual([]);
  });
  it("fails closed on damaged queue and permits next restart/read", async () => {
    const s = setup();
    s.getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).rejects.toThrow(
      "V2_QUARANTINED",
    );
    expect(await readOwnPendingPractice(s.queue, "A", "course-1", "day-1")).toHaveLength(1);
  });
});
