import { prisma } from "@gafus/prisma";

/** Infrastructure-only DB lifecycle. External adapters retain Redis/HTTP ownership. */
export async function checkCoreDatabaseReady(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectCoreDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export { getAdminMailDashboard, getAdminMailAlertCount } from "./mailAdminMonitoring";

export { getAdminMediaDashboard, recordMediaDispatch, recordMediaEmptyClaim, kindForCloudruJob } from "./mediaMonitoring";

export { MEDIA_MONITOR_HEARTBEAT_KEY } from "./mediaMonitoring";
export { renderMediaMetricsPrometheus } from "./mediaMonitoring";
export { notifyStoppedMediaWorker } from "./mediaWorkerOutage";
