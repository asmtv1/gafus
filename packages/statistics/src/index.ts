export * from "./types";
export { getAuthoredCoursesWithStats } from "./course/getAuthoredCourses";
export { getCourseStatistics, getDetailedCourseStatistics } from "./course/statistics";
export { getDetailedStepStatistics, getStepStatistics } from "./steps/statistics";
export { getUserProgress } from "./user/progress";


// Infrastructure-only monitoring and storage statistics accessors.
export { renderMediaProcessingMetricsPrometheus } from "./infra/mediaProcessingMetrics";
export { getStorageStats } from "./infra/adminStorageService";
export { isCurrentTrainerUser } from "./infra/trainerTargetAccess";
export { readTrainerVideoMetadataRows } from "./infra/readTrainerVideoMetadataRows";

export { getVideoPlaybackQualityReport, recordVideoPlaybackQuality } from "./infra/videoPlaybackQuality";

export { checkCoreDatabaseReady, disconnectCoreDatabase } from "./infra/databaseHealth";
export { getAdminMailDashboard, getAdminMailAlertCount } from "./infra/mailAdminMonitoring";
export { getMailDeliveryHealth, monitorMailDelivery, renderMailDeliveryMetricsPrometheus } from "./infra/mailDeliveryMonitor";
