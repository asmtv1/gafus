export const frameSurfaces = ["moments", "chat", "training", "preview"] as const;
export const framePlatforms = ["web", "ios", "android"] as const;
export type FrameSurface = typeof frameSurfaces[number];
export type FramePlatform = typeof framePlatforms[number];
export type FrameEvent = {
  surface: FrameSurface; platform: FramePlatform;
  outcome: "rendered" | "unsupported" | "abandoned";
  elapsedMs?: number;
};
const bounds = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 30, 60, 120];
const outcomes = ["rendered", "unsupported", "abandoned"] as const;
const maxElapsed = 120_000;
export function parseFrameEvent(value: unknown): FrameEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!frameSurfaces.includes(v.surface as FrameSurface) ||
      !framePlatforms.includes(v.platform as FramePlatform) ||
      !outcomes.includes(v.outcome as FrameEvent["outcome"])) return null;
  const rendered = v.outcome === "rendered";
  if (Object.keys(v).sort().join(",") !== (rendered ? "elapsedMs,outcome,platform,surface" : "outcome,platform,surface"))
    return null;
  if (rendered && (typeof v.elapsedMs !== "number" || !Number.isSafeInteger(v.elapsedMs) ||
      v.elapsedMs < 0 || v.elapsedMs > maxElapsed)) return null;
  if (v.outcome === "unsupported" && v.platform !== "web") return null;
  return v as FrameEvent;
}
export function createFirstFrameMetrics() {
  // At most 12 series groups, preinitialized to distinguish no observations
  // from missing exporter. Counts are observations, not unique people/views.
  const groups = frameSurfaces.flatMap(surface => framePlatforms.map(platform => ({
    surface, platform, counts: { rendered: 0, unsupported: 0, abandoned: 0 },
    buckets: bounds.map(() => 0), sum: 0,
  })));
  function record(event: FrameEvent) {
    const valid = parseFrameEvent(event);
    if (!valid) return false;
    const group = groups.find(g => g.surface === valid.surface && g.platform === valid.platform)!;
    group.counts[valid.outcome]++;
    if (valid.outcome === "rendered") {
      const seconds = valid.elapsedMs! / 1000;
      group.sum += seconds;
      bounds.forEach((b, i) => { if (seconds <= b) group.buckets[i]++; });
    }
    return true;
  }
  function render() {
    const lines = [
      "# HELP gafus_video_first_frame_observations_total Terminal first-frame observations; not unique plays",
      "# TYPE gafus_video_first_frame_observations_total counter",
      "# HELP gafus_video_first_frame_seconds Time from source load or native view attachment to first presented frame",
      "# TYPE gafus_video_first_frame_seconds histogram",
    ];
    for (const g of groups) {
      const label = 'surface="' + g.surface + '",platform="' + g.platform + '"';
      for (const outcome of outcomes)
        lines.push("gafus_video_first_frame_observations_total{" + label + ',outcome="' + outcome + '"} ' + g.counts[outcome]);
      bounds.forEach((b,i) => lines.push("gafus_video_first_frame_seconds_bucket{" + label + ',le="' + b + '"} ' + g.buckets[i]));
      lines.push("gafus_video_first_frame_seconds_bucket{" + label + ',le="+Inf"} ' + g.counts.rendered);
      lines.push("gafus_video_first_frame_seconds_count{" + label + "} " + g.counts.rendered);
      lines.push("gafus_video_first_frame_seconds_sum{" + label + "} " + g.sum);
    }
    return lines.join("\n") + "\n";
  }
  return { record, render };
}
export const firstFrameMetrics = createFirstFrameMetrics();
