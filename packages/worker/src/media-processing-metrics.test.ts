import { describe, expect, it, vi } from "vitest";

const render = vi.hoisted(() => vi.fn());
vi.mock("@gafus/statistics", () => ({
  renderMediaProcessingMetricsPrometheus: render,
}));
import { renderMediaProcessingMetricsPrometheus } from "./media-processing-metrics";

describe("media metrics infrastructure adapter", () => {
  it("preserves the infrastructure service export", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    render.mockResolvedValueOnce("metrics\n");
    expect(renderMediaProcessingMetricsPrometheus).toBe(render);
    await expect(renderMediaProcessingMetricsPrometheus(now)).resolves.toBe("metrics\n");
    expect(render).toHaveBeenCalledWith(now);
  });
});
