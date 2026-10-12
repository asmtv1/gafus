export interface GalleryStorageConfig {
  enabled: boolean;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnBaseUrl: string;
  cdnSecret: string;
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
  const enabled = env.GALLERY_ENABLED === "true";
  const config = {
    enabled,
    bucket: env.GALLERY_BUCKET ?? "",
    endpoint: env.GALLERY_S3_ENDPOINT ?? "https://storage.yandexcloud.net",
    accessKeyId: env.GALLERY_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.GALLERY_S3_SECRET_ACCESS_KEY ?? "",
    cdnBaseUrl: env.GALLERY_CDN_BASE_URL ?? "",
    cdnSecret: env.GALLERY_CDN_SECRET ?? "",
  };
  // Cleanup still needs standalone storage credentials even with the product flag off.
  if (enabled) {
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
      !url.hostname.includes(".") ||
      /localhost|yandexcloud\.net$/.test(url.hostname)
    )
      throw new Error("UNSAFE_CDN_URL");
    config.cdnBaseUrl = url.origin;
    if (
      !/^[A-Za-z0-9_-]{24,32}$/.test(config.cdnSecret) ||
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
  c: Pick<GalleryStorageConfig, "bucket" | "endpoint" | "accessKeyId" | "secretAccessKey">,
) {
  if (
    !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(c.bucket) ||
    /^(gafus-media|gafus-public)$/.test(c.bucket) ||
    !c.accessKeyId ||
    !c.secretAccessKey ||
    !["https://storage.yandexcloud.net", "https://s3.cloud.ru"].includes(c.endpoint)
  )
    throw new Error("UNSAFE_GALLERY_STORAGE_CONFIG");
}
