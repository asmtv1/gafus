import { S3Client } from '@aws-sdk/client-s3';
import type { GalleryObjectMetadata } from '@gafus/core/services/gallery';
import { type GalleryStorageConfig } from './config.js';
export declare const MAX_OBJECT_BYTES: number;
export interface GalleryObjectStore {
    head(key: string, signal?: AbortSignal): Promise<GalleryObjectMetadata | null>;
    read(key: string, etag?: string, signal?: AbortSignal, maxBytes?: number): Promise<{
        bytes: Uint8Array;
        metadata: GalleryObjectMetadata;
    }>;
    create(key: string, bytes: Uint8Array, type: 'image/webp', signal?: AbortSignal): Promise<GalleryObjectMetadata>;
    delete(key: string, signal?: AbortSignal): Promise<void>;
}
export declare function objectMd5(bytes: Uint8Array): string;
export declare function normalizeETag(etag: string): string;
export declare function createGalleryS3Client(config: Pick<GalleryStorageConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'secretAccessKey' | 'isolatedNonprod'>): S3Client;
export declare function createGalleryObjectStore(config: Pick<GalleryStorageConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'secretAccessKey' | 'isolatedNonprod' | 'cacheableFinalEnabled'>, client?: S3Client): GalleryObjectStore;
