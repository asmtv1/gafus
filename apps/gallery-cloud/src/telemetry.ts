export interface GalleryMetric {
  operation: "upload" | "publish" | "move" | "delete" | "vetPreview" | "maintenance" | "stage";
  stage?: string;
  outcome: "success" | "failure" | "retry" | "skipped";
  durationMs: number;
  errorCode?: string;
  expiredUploads?: number;
  recoveredCleanupJobs?: number;
  reconciledJobs?: number;
  queuedUploads?: number;
}
export type GalleryTelemetry = (metric: GalleryMetric) => void;

/** Allowlisted operational values only: never log keys, URLs, request bodies or secrets. */
export function emitGalleryTelemetry(metric: GalleryMetric) {
  console.log(
    JSON.stringify({
      event: "gallery_metric",
      operation: metric.operation,
      ...(metric.stage && /^[a-z_]{1,32}$/.test(metric.stage) ? { stage: metric.stage } : {}),
      outcome: metric.outcome,
      durationMs: Math.max(0, Math.round(metric.durationMs)),
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
      ...(metric.errorCode && /^[A-Z_]{1,64}$/.test(metric.errorCode)
        ? { errorCode: metric.errorCode }
        : {}),
      ...Object.fromEntries(
        ["expiredUploads", "recoveredCleanupJobs", "reconciledJobs", "queuedUploads"].flatMap(
          (key) => {
            const value = metric[key as keyof GalleryMetric];
            return typeof value === "number" && Number.isFinite(value)
              ? [[key, Math.max(0, Math.round(value))]]
              : [];
          },
        ),
      ),
    }),
  );
}
