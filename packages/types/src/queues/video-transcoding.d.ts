/**
 * Данные задачи транскодирования видео в HLS
 */
export interface VideoTranscodingJobData {
    videoId: string;
    trainerId: string;
    originalPath: string;
}
/**
 * Результат транскодирования видео
 */
export interface VideoTranscodingResult {
    success: boolean;
    hlsManifestPath?: string;
    error?: string;
}
//# sourceMappingURL=video-transcoding.d.ts.map