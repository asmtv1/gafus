/** Read-only, low-cardinality observability for the four durable media pipelines.
 * One snapshot and one DB round trip; preserve each existing indexed count
 * predicate rather than scanning all rows to compute conditional aggregates.
 */
import { prisma } from "@gafus/prisma";

const pipelines = ["chat2", "questions", "feed", "gallery"] as const;
type Pipeline = (typeof pipelines)[number];
type MediaHealth = { pipeline: Pipeline; stalled: number; failed: number };

export async function renderMediaProcessingMetricsPrometheus(now = new Date()): Promise<string> {
  const rows = await prisma.$queryRaw<MediaHealth[]>`
    SELECT 'chat2' AS pipeline,
      (SELECT count(*)::int FROM "Chat2V2MediaTask" WHERE status = 'PROCESSING' AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})) AS stalled,
      (SELECT count(*)::int FROM "Chat2V2MediaTask" WHERE status = 'FAILED') AS failed
    UNION ALL
    SELECT 'questions',
      (SELECT count(*)::int FROM "QuestionV2MediaTask" WHERE status = 'PROCESSING' AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})),
      (SELECT count(*)::int FROM "QuestionV2MediaTask" WHERE status = 'FAILED')
    UNION ALL
    SELECT 'feed',
      (SELECT count(*)::int FROM "FeedUpload" WHERE status = 'processing' AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})),
      (SELECT count(*)::int FROM "FeedUpload" WHERE status = 'failed')
    UNION ALL
    SELECT 'gallery',
      (SELECT count(*)::int FROM "GalleryUpload" WHERE status = 'processing' AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})),
      (SELECT count(*)::int FROM "GalleryUpload" WHERE status = 'failed')
  `;
  const byPipeline = new Map(rows.map(row => [row.pipeline, row]));
  if (rows.length !== pipelines.length || byPipeline.size !== pipelines.length ||
      pipelines.some(name => !byPipeline.has(name))) {
    throw new Error("MEDIA_PROCESSING_METRICS_INCOMPLETE");
  }
  const lines = [
    "# HELP gafus_media_stalled_processing PROCESSING rows with expired or missing leases",
    "# TYPE gafus_media_stalled_processing gauge",
    "# HELP gafus_media_failed_tasks Durable media rows in terminal FAILED state",
    "# TYPE gafus_media_failed_tasks gauge",
  ];
  for (const name of pipelines) {
    const { stalled, failed } = byPipeline.get(name)!;
    lines.push(`gafus_media_stalled_processing{pipeline="${name}"} ${stalled}`);
    lines.push(`gafus_media_failed_tasks{pipeline="${name}"} ${failed}`);
  }
  return lines.join("\n") + "\n";
}
