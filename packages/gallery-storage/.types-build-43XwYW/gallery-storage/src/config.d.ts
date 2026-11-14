export interface GalleryStorageConfig {
    enabled: boolean;
    isolatedNonprod?: boolean;
    bucket: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    cdnBaseUrl: string;
    cdnSecret: string;
    cdnProvider?: "beget";
    cdnRedirectEnabled?: boolean;
    cdnOriginRouteEnabled?: boolean;
    cacheableFinalEnabled?: boolean;
}
export declare function galleryStorageConfigFromEnv(env?: Record<string, string | undefined>): GalleryStorageConfig;
export declare function validateGalleryObjectConfig(c: Pick<GalleryStorageConfig, "bucket" | "endpoint" | "accessKeyId" | "secretAccessKey" | "isolatedNonprod">): void;
