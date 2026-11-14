/**
 * Video playback entitlement policy. The caller (API composition root) owns
 * SQL read adapters and supplies them as an explicit port. No infrastructure
 * implementation or ORM imports belong in this Core policy.
 */
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("video-access-service");

export interface VideoManifestInfo {
  hlsManifestPath: string | null;
  thumbnailPath: string | null;
  transcodingStatus: string;
  trainerId: string;
}
export interface CheckVideoAccessParams {
  userId: string;
  videoId: string;
}

/** Narrow contract: all returned objects are owner/occurrence-scoped projections;
 * there is no raw client query, unrestricted row accessor or payment bypass.
 */
export interface VideoAccessReadPorts {
  manifest(videoId: string): Promise<VideoManifestInfo | null>;
  owner(videoId: string): Promise<{ trainerId: string } | null>;
  stepOccurrences(videoId: string): Promise<{ id: string; dayId: string }[]>;
  dayOccurrences(dayIds: string[]): Promise<{ id: string; dayId: string }[]>;
  hasPublishedDailyCourseVideo(videoId: string, at: Date): Promise<boolean>;
  allowedCourseStep(
    userId: string,
    dayOnCourseId: string,
    stepOnDayId: string,
    at: Date,
  ): Promise<boolean>;
}

export function createVideoAccessService(reads: VideoAccessReadPorts) {
  return {
    /** For manifests and segments, keep the existing exact metadata DTO. */
    async getVideoManifestInfo(videoId: string): Promise<VideoManifestInfo | null> {
      return reads.manifest(videoId);
    },
    /** Fail closed on missing media or read failure. A reused TrainingDay never
     * confers access to a video from a different course occurrence.
     */
    async checkVideoAccess({ userId, videoId }: CheckVideoAccessParams): Promise<boolean> {
      try {
        const video = await reads.owner(videoId);
        if (!video) {
          logger.warn("Video access check failed: video not found", { userId, videoId });
          return false;
        }
        if (video.trainerId === userId) {
          logger.info("Video access granted: user is owner", { userId, videoId });
          return true;
        }
        const stepLinks = await reads.stepOccurrences(videoId);
        const dayIds = [...new Set(stepLinks.map((link) => link.dayId))];
        if (dayIds.length) {
          const occurrences = await reads.dayOccurrences(dayIds);
          const now = new Date();
          for (const occurrence of occurrences) {
            for (const link of stepLinks) {
              if (link.dayId !== occurrence.dayId) continue;
              if (await reads.allowedCourseStep(userId, occurrence.id, link.id, now)) {
                return true;
              }
            }
          }
        }
        if (await reads.hasPublishedDailyCourseVideo(videoId, new Date())) return true;
        logger.warn("Video access denied: no permissions", {
          userId,
          videoId,
          trainerId: video.trainerId,
        });
        return false;
      } catch (error) {
        logger.error("Video access check error", error as Error, { userId, videoId });
        return false;
      }
    },
  };
}
