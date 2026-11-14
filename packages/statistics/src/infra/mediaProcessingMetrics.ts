/** Read-only, low-cardinality observability for the four durable media pipelines.
 * No user IDs, storage keys or signed URLs are emitted. An expired/missing
 * PROCESSING lease is actionable even if a worker died without updating state.
 */
import { prisma } from "@gafus/prisma";

const pipelines = [
  { name: "chat2", table: prisma.chat2V2MediaTask, processing: "PROCESSING", failed: "FAILED" },
  {
    name: "questions",
    table: prisma.questionV2MediaTask,
    processing: "PROCESSING",
    failed: "FAILED",
  },
  { name: "feed", table: prisma.feedUpload, processing: "processing", failed: "failed" },
  { name: "gallery", table: prisma.galleryUpload, processing: "processing", failed: "failed" },
] as const;

export async function renderMediaProcessingMetricsPrometheus(now = new Date()): Promise<string> {
  const lines = [
    "# HELP gafus_media_stalled_processing PROCESSING rows with expired or missing leases",
    "# TYPE gafus_media_stalled_processing gauge",
    "# HELP gafus_media_failed_tasks Durable media rows in terminal FAILED state",
    "# TYPE gafus_media_failed_tasks gauge",
  ];
  for (const pipeline of pipelines) {
    // All four Prisma delegates expose count(); type-erased status literals
    // preserve the generated enum type constraints for Gallery/Feed.
    const table = pipeline.table as unknown as {
      count: (args: { where: object }) => Promise<number>;
    };
    const [stalled, failed] = await Promise.all([
      table.count({
        where: {
          status: pipeline.processing,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      }),
      table.count({ where: { status: pipeline.failed } }),
    ]);
    lines.push(`gafus_media_stalled_processing{pipeline="${pipeline.name}"} ${stalled}`);
    lines.push(`gafus_media_failed_tasks{pipeline="${pipeline.name}"} ${failed}`);
  }
  return lines.join("\n") + "\n";
}
