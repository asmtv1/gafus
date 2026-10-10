export {};
/**
 * Staging-only user-level A/B report. Never queries production by default.
 * FEED_SMART_AB_REPORT_DATABASE_URL points to a dedicated gafus_*smart_test database.
 */
async function main() {
  const url = process.env.FEED_SMART_AB_REPORT_DATABASE_URL;
  if (!url || process.env.FEED_SMART_AB_REPORT_CONFIRM !== "YES") {
    throw new Error("Provide isolated FEED_SMART_AB_REPORT_DATABASE_URL and FEED_SMART_AB_REPORT_CONFIRM=YES");
  }
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^gafus_[a-z0-9_]*smart_test$/.test(database)) {
    throw new Error("Refusing to read a non-test database");
  }
  process.env.DATABASE_URL = url;
  const { prisma } = await import("@gafus/prisma");
  const { getSmartExperimentReport } = await import("@gafus/core/services/feed");
  try {
    const report = await getSmartExperimentReport(prisma);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Report failed\n");
  process.exitCode = 1;
});
