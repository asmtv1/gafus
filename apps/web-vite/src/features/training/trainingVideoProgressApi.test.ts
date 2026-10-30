import { afterEach, describe, expect, it, vi } from "vitest";
import {
  safeTrainingVideoId, readTrainingVideoProgress, writeTrainingVideoProgress,
} from "./trainingVideoProgressApi";

const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
afterEach(() => vi.unstubAllGlobals());

describe("Hono owner-scoped training video position", () => {
  it("validates signed Hono video ID; rejects forged IDs before network", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(safeTrainingVideoId("clwVid_01234")).toBe("clwVid_01234");
    expect(safeTrainingVideoId("../secret")).toBeNull();
    await expect(readTrainingVideoProgress("../secret"))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_ID");
    await expect(writeTrainingVideoProgress("../secret", 7))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_POSITION");
    await expect(writeTrainingVideoProgress("video1", -1))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_POSITION");
    await expect(writeTrainingVideoProgress("video1", 0.7))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_POSITION");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("GET returns only strict progress; null is a valid never-watched state", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok({ lastPositionSec: 38 }))
      .mockResolvedValueOnce(ok({ lastPositionSec: "38" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await readTrainingVideoProgress("trainerVideo1")).toBeNull();
    expect(await readTrainingVideoProgress("trainerVideo1")).toBe(38);
    await expect(readTrainingVideoProgress("trainerVideo1"))
      .rejects.toThrow("INVALID_TRAINING_VIDEO_PROGRESS");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/training/video/trainerVideo1/progress");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET", credentials: "include", cache: "no-store",
    });
  });
  it("progress POST contains only bounded integer seconds, no signed URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(undefined));
    vi.stubGlobal("fetch", fetcher);
    await writeTrainingVideoProgress("trainerVideo1", 73);
    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe("/api/v1/training/video/trainerVideo1/progress");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({ positionSec: 73 });
    expect(options.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
  });
});
