import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({ prisma: { $queryRaw: query } }));
import { renderMediaProcessingMetricsPrometheus } from "./mediaProcessingMetrics";

beforeEach(() => { query.mockReset(); });

describe("durable media metrics", () => {
  it("reads all four pipelines in one snapshot with strict expired lease criteria", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    query.mockResolvedValue([
      { pipeline: "gallery", stalled: 5, failed: 0 },
      { pipeline: "chat2", stalled: 2, failed: 1 },
      { pipeline: "questions", stalled: 3, failed: 0 },
      { pipeline: "feed", stalled: 4, failed: 0 },
    ]);
    const body = await renderMediaProcessingMetricsPrometheus(now);
    expect(body).toContain('gafus_media_stalled_processing{pipeline="chat2"} 2');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="questions"} 3');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="feed"} 4');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="gallery"} 5');
    expect(body).toContain('gafus_media_failed_tasks{pipeline="chat2"} 1');
    expect(body).not.toContain("ownerId");
    expect(body).not.toContain("sourceKey");
    expect(query).toHaveBeenCalledTimes(1);
    const [parts, ...params] = query.mock.calls[0];
    const sql = parts.join("?");
    expect(params).toEqual([now, now, now, now]);
    expect(sql.match(/"leaseUntil" IS NULL OR "leaseUntil" < \?/g)).toHaveLength(4);
    expect(sql.match(/status = 'PROCESSING'/g)).toHaveLength(2);
    expect(sql.match(/status = 'processing'/g)).toHaveLength(2);
    expect(sql.match(/status = 'FAILED'/g)).toHaveLength(2);
    expect(sql.match(/status = 'failed'/g)).toHaveLength(2);
  });

  it("fails the entire scrape on database failure", async () => {
    query.mockRejectedValueOnce(new Error("database temporarily unavailable"));
    await expect(renderMediaProcessingMetricsPrometheus()).rejects.toThrow("database temporarily unavailable");
  });

  it("fails closed if a pipeline is missing or duplicated", async () => {
    query.mockResolvedValueOnce([{ pipeline: "chat2", stalled: 0, failed: 0 }]);
    await expect(renderMediaProcessingMetricsPrometheus()).rejects.toThrow("MEDIA_PROCESSING_METRICS_INCOMPLETE");
    query.mockResolvedValueOnce(["chat2","chat2","feed","gallery"].map(pipeline=>({pipeline,stalled:0,failed:0})));
    await expect(renderMediaProcessingMetricsPrometheus()).rejects.toThrow("MEDIA_PROCESSING_METRICS_INCOMPLETE");
  });
});
