/**
 * Must run only against a fresh, synthetic PostgreSQL created by
 * scripts/qa/observability-restore-rpo-rto.sh.
 * Verifies a real engine event, with no SQL text/payload in metric labels.
 */
import { prisma } from "../src/client.js";
import {
  renderDatabaseMetrics, renderDependencyMetrics, recordPrismaPoolWaitHistogram, renderPrismaPoolWaitMetrics,
} from "@gafus/logger/server-telemetry";

async function main() {
  if (process.env.A2_OBS_ISOLATED_PG !== "1" ||
      !process.env.DATABASE_URL?.includes("127.0.0.1")) {
    throw new Error("A2_REQUIRES_LOOPBACK_ISOLATED_PG");
  }
  await prisma.courseContentRevision.findMany({ take: 1 });
  const metrics = await prisma.$metrics.json();
  if (!recordPrismaPoolWaitHistogram(metrics.histograms)) {
    throw new Error("PRISMA_ENGINE_POOL_WAIT_HISTOGRAM_UNAVAILABLE");
  }
  const poolMetric = renderPrismaPoolWaitMetrics();
  if (!/db_pool_wait_metrics_fresh 1/.test(poolMetric) ||
      !/db_pool_wait_seconds_count\{source="prisma_engine"\} [1-9]/.test(poolMetric) ||
      /SELECT|password|ownerId|operationId|locator/i.test(poolMetric)) {
    throw new Error("PRISMA_POOL_WAIT_METRIC_REJECTED");
  }
  const response = renderDatabaseMetrics();
  const match = response.match(/db_query_duration_seconds_count\{source="prisma_query_event"\} ([0-9]+)/);
  if (!match || Number(match[1]) < 1) {
    throw new Error("PRISMA_QUERY_EVENT_NOT_CAPTURED");
  }
  if (/SELECT|INSERT|authorization|ownerId|operationId/i.test(response + renderDependencyMetrics())) {
    throw new Error("HIGH_CARDINALITY_OR_SQL_METRIC");
  }
  process.stdout.write("A2_OBS_PRISMA_REAL_QUERY_AND_POOL_WAIT_METRICS_PASS\n");
}
main().catch(error => {
  process.stderr.write("A2_OBS_PRISMA_ENGINE_METRICS_FAILED:" + error?.name + "\n");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
