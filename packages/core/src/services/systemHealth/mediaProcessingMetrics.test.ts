import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = vi.hoisted(() => ({
  chat2: vi.fn(),
  questions: vi.fn(),
  feed: vi.fn(),
  gallery: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    chat2V2MediaTask: { count: counts.chat2 },
    questionV2MediaTask: { count: counts.questions },
    feedUpload: { count: counts.feed },
    galleryUpload: { count: counts.gallery },
  },
}));
import { renderMediaProcessingMetricsPrometheus } from "./mediaProcessingMetrics";

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(counts)) fn.mockResolvedValue(0);
});

describe("durable media metrics", () => {
  it("counts four pipelines, using strict expired lease criteria and no account identifiers", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    counts.chat2.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    counts.questions.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    counts.feed.mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    counts.gallery.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    const body = await renderMediaProcessingMetricsPrometheus(now);
    expect(body).toContain('gafus_media_stalled_processing{pipeline="chat2"} 2');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="questions"} 3');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="feed"} 4');
    expect(body).toContain('gafus_media_stalled_processing{pipeline="gallery"} 5');
    expect(body).toContain('gafus_media_failed_tasks{pipeline="chat2"} 1');
    expect(body).not.toContain("ownerId");
    expect(body).not.toContain("sourceKey");
    for (const [name, fn] of Object.entries(counts)) {
      const expected = name === "chat2" || name === "questions" ? "PROCESSING" : "processing";
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn.mock.calls[0][0].where).toEqual({
        status: expected,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      });
    }
  });

  it("fails the entire scrape instead of returning misleading zero counts when a DB query fails", async () => {
    counts.questions.mockRejectedValueOnce(new Error("database temporarily unavailable"));
    await expect(renderMediaProcessingMetricsPrometheus()).rejects.toThrow(
      "database temporarily unavailable",
    );
  });
});
