import type { GalleryContext } from "./context";
import type { GalleryTx, GalleryUploadClaim, GalleryStorageJobClaim, GalleryCallbackResult } from "./ports";
import type { JobRow, UploadRow } from "./persistence";
export interface GalleryClaimUploadInput {
    uploadId: string;
}
export interface GalleryCompleteUploadInput {
    uploadId: string;
    attemptToken: string;
    sourceETag: string;
    width: number;
    height: number;
    /** V2: authoritative worker metadata, independently checked by Core HEAD. */
    manifest?: {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    };
}
export interface GalleryFailUploadInput {
    uploadId: string;
    attemptToken: string;
    errorCode: string;
    retryable: boolean;
}
export interface GalleryClaimStorageJobsInput {
    limit?: number;
    /** Scope immediate publication to the upload that just completed. */
    uploadId?: string;
    /** Default-off: exact one owner-bound delete job; never bulk claim foreign jobs. */
    exactDelete?: {
        jobId: string;
        ownerId: string;
    };
    /** Exact one owner-bound move, never claim unrelated historical WORK jobs. */
    exactMove?: {
        jobId: string;
        ownerId: string;
    };
}
export interface GalleryCompleteStorageJobInput {
    jobId: string;
    attemptToken: string;
}
export interface GalleryFailStorageJobInput extends GalleryCompleteStorageJobInput {
    errorCode: string;
    retryable: boolean;
}
export interface GalleryMaintenanceInput {
    limit?: number;
}
export interface GalleryMaintenanceResult {
    expiredUploads: number;
    reconciledJobs: number;
    recoveredCleanupJobs: number;
    /** Timer forwards these IDs to claimUpload; no adapter-side DB queries are needed. */
    processUploadIds: string[];
}
export declare function createGalleryWorkerOperations(ctx: GalleryContext): {
    inspectSource: (row: UploadRow) => Promise<import("./ports").GalleryObjectMetadata>;
    cancelMove: (tx: GalleryTx, job: JobRow, at: Date, status?: "cancelled" | "failed") => Promise<void>;
    claimUpload(input: GalleryClaimUploadInput): Promise<GalleryUploadClaim | null>;
    completeUpload(input: GalleryCompleteUploadInput): Promise<GalleryCallbackResult>;
    failUpload(input: GalleryFailUploadInput): Promise<GalleryCallbackResult>;
    claimStorageJobs(input?: GalleryClaimStorageJobsInput): Promise<GalleryStorageJobClaim[]>;
    completeStorageJob(input: GalleryCompleteStorageJobInput): Promise<GalleryCallbackResult>;
    failStorageJob(input: GalleryFailStorageJobInput): Promise<GalleryCallbackResult>;
    maintenance(input?: GalleryMaintenanceInput): Promise<GalleryMaintenanceResult>;
};
