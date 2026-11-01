import { cdnIsolatedAcceptance } from "./cdn-isolated-acceptance.js";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
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
export function galleryStorageConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GalleryStorageConfig {
  if (
    env.GALLERY_ENABLED !== "true" &&
    env.GALLERY_ENABLED !== "false" &&
    env.GALLERY_ENABLED !== undefined
  )
    throw new Error("INVALID_GALLERY_FLAG");
  if (cdnIsolatedAcceptance(env)) return {
    enabled: env.GALLERY_ENABLED === "true", isolatedNonprod: true,
    bucket: "gafus-refactor-agent2-gallery-test", endpoint: "http://127.0.0.1:58390",
    accessKeyId: env.GAFUS_CDN_LOCAL_S3_KEY!, secretAccessKey: env.GAFUS_CDN_LOCAL_S3_SECRET!,
    cdnBaseUrl: "", cdnSecret: "",
  };
  const local = isolatedNonprodS3Config("gallery", env);
  const enabled = env.GALLERY_ENABLED === "true";
  if (local) {
    if (env.GALLERY_BUCKET_PUBLIC === "true") throw new Error("PUBLIC_GALLERY_BUCKET");
    return { enabled, isolatedNonprod: true, ...local, cdnBaseUrl: "", cdnSecret: "" };
  }
  const config = {
    enabled,
    bucket: env.GALLERY_BUCKET ?? "",
    endpoint: env.GALLERY_S3_ENDPOINT ?? "https://s3.cloud.ru",
    accessKeyId: env.GALLERY_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.GALLERY_S3_SECRET_ACCESS_KEY ?? "",
    cdnBaseUrl: env.GALLERY_CDN_BASE_URL ?? "",
    cdnSecret: env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? "",
    cdnRedirectEnabled: env.GALLERY_CDN_REDIRECT_ENABLED === "true",
    cdnOriginRouteEnabled: env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED === "true",
    cacheableFinalEnabled: env.GALLERY_CDN_CACHEABLE_FINAL_ENABLED === "true",
    cdnProvider: env.GALLERY_CDN_PROVIDER as "beget" | undefined,
  };
  for (const flag of ["GALLERY_CDN_REDIRECT_ENABLED", "GALLERY_CDN_ORIGIN_ROUTE_ENABLED", "GALLERY_CDN_CACHEABLE_FINAL_ENABLED"]) {
    if (env[flag] !== undefined && !["true", "false"].includes(env[flag]!))
      throw new Error("INVALID_GALLERY_REDIRECT_FLAG");
  }
  if (config.cdnOriginRouteEnabled && (
    !/^[A-Za-z0-9]{32,128}$/.test(env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET ?? "") ||
    !/^[A-Za-z0-9_-]{24,128}$/.test(env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? "") ||
    env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true"))
    throw new Error("GALLERY_CDN_ORIGIN_NOT_VERIFIED");
  if (config.cacheableFinalEnabled && env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true")
    throw new Error("GALLERY_CDN_CACHE_NOT_VERIFIED");
  if (config.cdnRedirectEnabled && !config.cdnOriginRouteEnabled)
    throw new Error("GALLERY_CDN_REDIRECT_REQUIRES_ORIGIN");
  if (config.cdnProvider !== undefined && config.cdnProvider !== "beget")
    throw new Error("INVALID_GALLERY_CDN_PROVIDER");
  // Cleanup still needs standalone storage credentials even with the product flag off.
  if (enabled) {
    if (!config.cdnRedirectEnabled || !config.cdnOriginRouteEnabled)
      throw new Error("GALLERY_REDIRECT_REQUIRED");
    validateGalleryObjectConfig(config);
    if (config.endpoint === "https://s3.cloud.ru" && env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true")
      throw new Error("GALLERY_CDN_EDGE_UNVERIFIED");
    const url = new URL(config.cdnBaseUrl);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.hostname !== "fupiquafifeswu.begetcdn.cloud"
    )
      throw new Error("UNSAFE_CDN_URL");
    config.cdnBaseUrl = url.origin;
    if (
      !/^[A-Za-z0-9_-]{24,128}$/.test(config.cdnSecret) ||
      !env.GALLERY_INTERNAL_BASE_URL ||
      !env.GALLERY_INTERNAL_HMAC_SECRET ||
      Buffer.byteLength(env.GALLERY_INTERNAL_HMAC_SECRET) < 32 ||
      env.GALLERY_PROCESSOR_READY !== "true"
    )
      throw new Error("MISSING_GALLERY_SECRETS");
    const internal = new URL(env.GALLERY_INTERNAL_BASE_URL);
    if (
      internal.protocol !== "https:" ||
      internal.pathname !== "/" ||
      internal.username ||
      internal.password ||
      internal.search ||
      internal.hash
    )
      throw new Error("UNSAFE_INTERNAL_URL");
  }
  if (env.GALLERY_BUCKET_PUBLIC === "true") throw new Error("PUBLIC_GALLERY_BUCKET");
  return config;
}
export function validateGalleryObjectConfig(
  c: Pick<GalleryStorageConfig, "bucket" | "endpoint" | "accessKeyId" | "secretAccessKey" | "isolatedNonprod">,
) {
  if (
    !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(c.bucket) ||
    /^(gafus-media|gafus-public)$/.test(c.bucket) ||
    !c.accessKeyId ||
    !c.secretAccessKey ||
    (c.isolatedNonprod === true
      ? !((c.endpoint === "http://127.0.0.1:9000" && c.bucket === "gafus-refactor-gallery-test") ||
        (c.endpoint === "http://127.0.0.1:9500" && c.bucket === "gafus-refactor-web4-gallery-test") ||
        (cdnIsolatedAcceptance() && c.endpoint === "http://127.0.0.1:58390" && c.bucket === "gafus-refactor-agent2-gallery-test"))
      : c.endpoint !== "https://s3.cloud.ru")
  )
    throw new Error("UNSAFE_GALLERY_STORAGE_CONFIG");
}
