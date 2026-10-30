import { cdnIsolatedAcceptance } from "./cdn-isolated-acceptance.js";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { localReadonlyCdnSecret } from "@gafus/cdn-upload/local-readonly-cdn";
import { createHash } from "node:crypto";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FeedStoragePort } from "@gafus/core/services/feed";
import { feedSourcePattern, assertFeedObjectKey, assertFeedFinalKey } from "./keys.js";

export interface FeedStorageConfig {
  enabled: boolean;
  isolatedNonprod?: boolean;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnBaseUrl: string;
  cdnSecret: string;
  cdnProvider?: "beget";
}
function safeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
      url.username || url.password || url.port ||
      url.hostname !== "garaquachegasourn.begetcdn.cloud")
    throw new Error("UNSAFE_FEED_CDN");
  return url.origin;
}
export function feedStorageConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): FeedStorageConfig {
  for (const name of ["FEED_ENABLED", "FEED_PROCESSOR_READY"]) {
    if (env[name] !== undefined && env[name] !== "true" && env[name] !== "false")
      throw new Error("INVALID_FEED_FLAG");
  }
  if (env.FEED_BUCKET_PUBLIC === "true") throw new Error("PUBLIC_FEED_BUCKET");
  if (cdnIsolatedAcceptance(env)) return {
    enabled: env.FEED_ENABLED === "true", isolatedNonprod: true,
    bucket: "gafus-refactor-agent2-feed-test", endpoint: "http://127.0.0.1:58390",
    accessKeyId: env.GAFUS_CDN_LOCAL_S3_KEY!, secretAccessKey: env.GAFUS_CDN_LOCAL_S3_SECRET!,
    cdnBaseUrl: "", cdnSecret: "",
  };
  const local = isolatedNonprodS3Config("feed", env);
  if (local) return {
    enabled: env.FEED_ENABLED === "true", isolatedNonprod: true,
    ...local, cdnBaseUrl: "", cdnSecret: "",
  };
  const config: FeedStorageConfig = {
    enabled: env.FEED_ENABLED === "true" && env.FEED_PROCESSOR_READY === "true",
    bucket: env.FEED_BUCKET ?? "",
    endpoint: env.FEED_S3_ENDPOINT ?? "https://s3.cloud.ru",
    accessKeyId: env.FEED_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.FEED_S3_SECRET_ACCESS_KEY ?? "",
    cdnBaseUrl: env.FEED_CDN_BASE_URL ?? "",
    cdnSecret: env.FEED_CDN_SECRET ?? "",
    cdnProvider: env.FEED_CDN_PROVIDER as "beget" | undefined,
  };
  if (config.cdnProvider !== undefined && config.cdnProvider !== "beget")
    throw new Error("INVALID_FEED_CDN_PROVIDER");
  if (config.enabled) {
    validateFeedStorageConfig(config);
    if (config.endpoint === "https://s3.cloud.ru" && env.FEED_CDN_EDGE_TOKEN_VERIFIED !== "true")
      throw new Error("FEED_CDN_EDGE_UNVERIFIED");
    if (Buffer.byteLength(env.FEED_INTERNAL_HMAC_SECRET ?? "") < 32)
      throw new Error("MISSING_FEED_INTERNAL_KEY");
  }
  return config;
}
function validateFeedStorageConfig(config: FeedStorageConfig) {
  if (
    !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(config.bucket) ||
    /^(gafus-media|gafus-public)$/.test(config.bucket) ||
    (config.isolatedNonprod === true
      ? !((config.endpoint === "http://127.0.0.1:9000" && config.bucket === "gafus-refactor-feed-test") ||
          (config.endpoint === "http://127.0.0.1:9500" && config.bucket === "gafus-refactor-web4-feed-test") ||
          (cdnIsolatedAcceptance() && config.endpoint === "http://127.0.0.1:58390" && config.bucket === "gafus-refactor-agent2-feed-test"))
      : config.endpoint !== "https://s3.cloud.ru") ||
    !config.accessKeyId ||
    !config.secretAccessKey ||
    (!config.isolatedNonprod && !/^[A-Za-z0-9_-]{24,32}$/.test(config.cdnSecret))
  )
    throw new Error("INVALID_FEED_STORAGE_CONFIG");
  if (!config.isolatedNonprod) safeOrigin(config.cdnBaseUrl);
}
export function signFeedCdnUrl(
  baseUrl: string,
  key: string,
  expiresAt: Date,
  secret: string,
  now = Date.now(),
  provider?: "beget",
) {
  assertFeedFinalKey(key);
  const origin = safeOrigin(baseUrl);
  const expires = Math.floor(expiresAt.getTime() / 1000);
  if (
    !/^[A-Za-z0-9_-]{24,32}$/.test(secret) ||
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(now / 1000) ||
    expires > Math.floor(now / 1000) + 360
  )
    throw new Error("INVALID_FEED_CDN_SIGNING_INPUT");
  if (provider !== undefined && provider !== "beget")
    throw new Error("CDN_PROVIDER_MISMATCH");
  const path = `/${key}`;
  // Beget Cloud CDN Secure Token (without IP binding):
  // md5 = base64url(MD5(`${expires}${path} ${secret}`)), passed as query parameters.
  // Do not substitute the legacy /md5(...)/ path-based CDNvideo dialect.
  const md5 = createHash("md5").update(`${expires}${path} ${secret}`).digest("base64url");
  return `${origin}${path}?md5=${md5}&expires=${expires}`;
}
export function createFeedStorage(
  config: FeedStorageConfig,
  injectedClient?: Pick<S3Client, "send">,
  runtimeEnv: Record<string, string | undefined> = process.env,
): FeedStoragePort {
  if (config.enabled) validateFeedStorageConfig(config);
  const hasCredentials = Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
  const liveCdnSecret = localReadonlyCdnSecret("feed", runtimeEnv);
  if (
    hasCredentials &&
    (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(config.bucket) ||
      /^(gafus-media|gafus-public)$/.test(config.bucket) ||
      (config.isolatedNonprod === true
        ? !((config.endpoint === "http://127.0.0.1:9000" && config.bucket === "gafus-refactor-feed-test") ||
          (config.endpoint === "http://127.0.0.1:9500" && config.bucket === "gafus-refactor-web4-feed-test") ||
          (cdnIsolatedAcceptance() && config.endpoint === "http://127.0.0.1:58390" && config.bucket === "gafus-refactor-agent2-feed-test"))
        : config.endpoint !== "https://s3.cloud.ru"))
  )
    throw new Error("INVALID_FEED_STORAGE_CONFIG");
  const client =
    injectedClient ??
    (hasCredentials
      ? new S3Client({
          endpoint: config.endpoint,
          region: config.isolatedNonprod ? "us-east-1" : "ru-central-1",
          forcePathStyle: true,
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
          maxAttempts: 2,
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
        })
      : null);
  const requireClient = () => {
    if (!config.enabled || !client) throw new Error("FEED_STORAGE_DISABLED");
    return client;
  };
  return {
    enabled: config.enabled,
    async presignPost(input) {
      const s3 = requireClient();
      const match = feedSourcePattern.exec(input.key);
      const formats: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
      };
      const expires = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      const expectedLimit = input.contentType.startsWith("image/")
        ? 10 * 1024 * 1024
        : 200 * 1024 * 1024;
      if (
        !match ||
        !formats[input.contentType] ||
        match[4] !== formats[input.contentType] ||
        input.maxBytes !== expectedLimit ||
        expires <= 0 ||
        expires > 600
      )
        throw new Error("INVALID_FEED_UPLOAD_POLICY");
      return createPresignedPost(s3 as S3Client, {
        Bucket: config.bucket,
        Key: input.key,
        Expires: expires,
        Fields: { "Content-Type": input.contentType, success_action_status: "204" },
        Conditions: [
          ["content-length-range", 1, input.maxBytes],
          ["eq", "$Content-Type", input.contentType],
          ["eq", "$key", input.key],
          ["eq", "$success_action_status", "204"],
        ],
      });
    },
    async head(key) {
      assertFeedObjectKey(key);
      if (!client) throw new Error("FEED_STORAGE_UNAVAILABLE");
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(5000) },
        );
        if (
          !result.ETag ||
          !Number.isSafeInteger(result.ContentLength) ||
          !result.ContentLength ||
          result.ContentLength < 0 ||
          result.ContentLength > 200 * 1024 * 1024 ||
          !result.ContentType
        )
          throw new Error("INVALID_FEED_OBJECT_METADATA");
        // Multipart video ETags are opaque identifiers, not single-part MD5 hashes.
        if (!/^"[a-fA-F0-9]{32}(?:-[1-9]\d*)?"$/.test(result.ETag))
          throw new Error("INVALID_FEED_ETAG");
        return { etag: result.ETag, bytes: result.ContentLength, contentType: result.ContentType };
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404
        )
          return null;
        throw error;
      }
    },
    async signCdn(input) {
      requireClient();
      if (liveCdnSecret) {
        assertFeedFinalKey(input.key);
        return signFeedCdnUrl("https://garaquachegasourn.begetcdn.cloud", input.key,
          input.expiresAt, liveCdnSecret, Date.now(), "beget");
      }
      if (config.isolatedNonprod) {
        assertFeedFinalKey(input.key); // Never sign incoming/unprocessed uploads.
        const now = Math.floor(Date.now() / 1000);
        const expires = Math.floor(input.expiresAt.getTime() / 1000);
        if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 360)
          throw new Error("INVALID_LOCAL_S3_EXPIRY");
        return getSignedUrl(client as S3Client, new GetObjectCommand({
          Bucket: config.bucket, Key: input.key, ResponseCacheControl: "private, no-store",
        }), { expiresIn: expires - now });
      }
      return signFeedCdnUrl(config.cdnBaseUrl, input.key, input.expiresAt, config.cdnSecret, Date.now(), config.cdnProvider);
    },
  };
}
export function createFeedStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): FeedStoragePort {
  return createFeedStorage(feedStorageConfigFromEnv(env), undefined, env);
}
