import { describe, expect, it, vi } from "vitest";
import { persistNewOnlyVideoProgress, readOwnPendingVideoProgress } from "./newOnlyV2VideoWriter";
import type { NewOnlyV2Queues } from "./newOnlyV2Queues";
const binding = {
  schemaVersion: 2 as const,
  principalId: "USER_A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
function store() {
  let active: typeof binding | null = binding;
  const enqueue = vi.fn(async () => ({ eventId: "event" }));
  return {
    writer: { getVerifiedBinding: () => active, enqueue } as unknown as NewOnlyV2Queues,
    enqueue,
    switchTo: (next: typeof binding | null) => {
      active = next;
    },
  };
}
describe("AG3 Phase1 video new-only writer boundary", () => {
  it("persists exact owner-scoped v2 event without network", async () => {
    const s = store();
    await persistNewOnlyVideoProgress(s.writer, "video_1", 73, 1000);
    expect(s.enqueue).toHaveBeenCalledWith("progress", "saveVideoProgress", {
      videoId: "video_1",
      positionSec: 73,
      updatedAt: 1000,
    });
  });
  it("rejects unverified owner without storage writes", async () => {
    const s = store();
    s.switchTo(null);
    await expect(persistNewOnlyVideoProgress(s.writer, "video_1", 73, 1000)).rejects.toThrow(
      "V2_SESSION_UNVERIFIED",
    );
    expect(s.enqueue).not.toHaveBeenCalled();
  });
  it("rejects invalid ID and position", async () => {
    const s = store();
    await expect(persistNewOnlyVideoProgress(s.writer, "../private", 73, 1000)).rejects.toThrow(
      "V2_INVALID_PAYLOAD",
    );
    await expect(persistNewOnlyVideoProgress(s.writer, "video_1", -1, 1000)).rejects.toThrow(
      "V2_INVALID_PAYLOAD",
    );
    expect(s.enqueue).not.toHaveBeenCalled();
  });
  it("propagates an awaited epoch rotation and disk failure", async () => {
    const s = store();
    s.enqueue.mockRejectedValueOnce(new Error("V2_SESSION_CHANGED"));
    await expect(persistNewOnlyVideoProgress(s.writer, "video_1", 73, 1000)).rejects.toThrow(
      "V2_SESSION_CHANGED",
    );
    s.enqueue.mockRejectedValueOnce(new Error("disk full"));
    await expect(persistNewOnlyVideoProgress(s.writer, "video_1", 73, 1000)).rejects.toThrow(
      "disk full",
    );
  });
});

const sample = {
  eventId: "event",
  createdAt: 1,
  kind: "saveVideoProgress",
  payload: { videoId: "videoA", positionSec: 33, updatedAt: 1000 },
};
function reader() {
  let binding: { schemaVersion: 2; principalId: string; authEpoch: string } | null = {
    schemaVersion: 2,
    principalId: "A",
    authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  };
  const getPending = vi.fn(async () => [sample]);
  const queue = { getVerifiedBinding: () => binding, getPending } as unknown as NewOnlyV2Queues;
  return {
    queue,
    getPending,
    change: (next: typeof binding) => {
      binding = next;
    },
  };
}
describe("AG3 Phase1 video verified-owner restart-only reader", () => {
  it("restores most recent matching pending event for verified owner", async () => {
    const s = reader();
    s.getPending.mockResolvedValueOnce([
      sample,
      {
        ...sample,
        eventId: "next",
        payload: { ...sample.payload, positionSec: 44, updatedAt: 2000 },
      },
      { ...sample, eventId: "other", payload: { ...sample.payload, videoId: "videoB" } },
    ]);
    expect(await readOwnPendingVideoProgress(s.queue, "videoA")).toEqual({
      positionSec: 44,
      updatedAt: 2000,
    });
    expect(s.getPending).toHaveBeenCalledWith("progress");
  });
  it("fails closed when owner missing, never reads queue", async () => {
    const s = reader();
    s.change(null);
    expect(await readOwnPendingVideoProgress(s.queue, "videoA")).toBeNull();
    expect(s.getPending).not.toHaveBeenCalled();
  });
  it("discards in-flight read after A to B principal switch", async () => {
    const s = reader();
    s.getPending.mockImplementationOnce(async () => {
      s.change({
        schemaVersion: 2,
        principalId: "B",
        authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
      });
      return [sample];
    });
    expect(await readOwnPendingVideoProgress(s.queue, "videoA")).toBeNull();
  });
  it("discards same-owner authEpoch rotation during read", async () => {
    const s = reader();
    s.getPending.mockImplementationOnce(async () => {
      s.change({
        schemaVersion: 2,
        principalId: "A",
        authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029",
      });
      return [sample];
    });
    expect(await readOwnPendingVideoProgress(s.queue, "videoA")).toBeNull();
  });
  it("does not restore corrupt positions or another video's data", async () => {
    const s = reader();
    s.getPending.mockResolvedValueOnce([
      { ...sample, payload: { videoId: "videoA", positionSec: -3, updatedAt: 1000 } },
      { ...sample, payload: { videoId: "videoB", positionSec: 4, updatedAt: 1000 } },
    ]);
    expect(await readOwnPendingVideoProgress(s.queue, "videoA")).toBeNull();
  });
  it("propagates queue quarantine without revealing previous owner", async () => {
    const s = reader();
    s.getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnPendingVideoProgress(s.queue, "videoA")).rejects.toThrow("V2_QUARANTINED");
  });
});
