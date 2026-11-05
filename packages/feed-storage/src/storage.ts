import { cdnIsolatedAcceptance } from "./cdn-isolated-acceptance.js";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { localReadonlyCdnSecret } from "@gafus/cdn-upload/local-readonly-cdn";
import { createHash } from "node:crypto";
import { S3Client, HeadObjectCommand, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FeedStoragePort } from "@gafus/core/services/feed";
import { feedSourcePattern, feedClientVariantPattern, assertFeedObjectKey, assertFeedFinalKey } from "./keys.js";
import { signClientWebpStaging, verifyClientWebp, copyVerifiedClientWebp,
  verifyClientMp4,copyVerifiedClientMp4 } from "@gafus/cdn-upload";

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
      url.hostname !== "quepraquiecebquomiel.begetcdn.cloud")
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
    enabled: env.FEED_ENABLED === "true",
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
  maxTtlSeconds = 360,
) {
  assertFeedFinalKey(key);
  const origin = safeOrigin(baseUrl);
  const expires = Math.floor(expiresAt.getTime() / 1000);
  if (
    !/^[A-Za-z0-9_-]{24,32}$/.test(secret) ||
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(now / 1000) ||
    (maxTtlSeconds !== 360 && maxTtlSeconds !== 172800) ||
    expires > Math.floor(now / 1000) + maxTtlSeconds
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
  const longLivedUrls = runtimeEnv.FEED_PUBLIC_BROWSER_CACHE_24H_VERIFIED === "true";
  // A 24h browser cache cannot be remotely revoked. Enable only when the
  // public-media deletion-purge pipeline and actual Beget browser header have
  // independently passed release acceptance. Private Gallery never uses it.
  if (longLivedUrls && (
    !config.enabled || config.isolatedNonprod === true ||
    config.endpoint !== "https://s3.cloud.ru" ||
    config.bucket !== "gafus-feed-private" ||
    config.cdnBaseUrl !== "https://quepraquiecebquomiel.begetcdn.cloud" ||
    config.cdnProvider !== "beget" ||
    runtimeEnv.FEED_CDN_EDGE_TOKEN_VERIFIED !== "true" ||
    runtimeEnv.FEED_CDN_BROWSER_CACHE_24H_VERIFIED !== "true" ||
    runtimeEnv.MEDIA_CDN_PURGE_WORKER_ENABLED !== "true" ||
    runtimeEnv.BEGET_CDN_PURGE_API_VERIFIED !== "true" ||
    runtimeEnv.BEGET_CDN_CACHE_KEY_VERIFIED !== "true" ||
    runtimeEnv.BEGET_CDN_PURGE_PROPAGATION_VERIFIED !== "true"
  )) throw new Error("FEED_PUBLIC_BROWSER_CACHE_24H_UNVERIFIED");
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
    longLivedUrls,
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
    async signClientRenditions(input) {
      const s3 = requireClient();
      const source = feedSourcePattern.exec(input.sourceKey);
      const expires = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      if (!source || source[4] !== "webp" || expires < 1 || expires > 600)
        throw Error("FEED_CLIENT_PHOTO_POLICY_INVALID");
      const prefix = input.sourceKey.replace(/source\.webp$/, "");
      const smallKey = `${prefix}s.webp`, mediumKey = `${prefix}m.webp`;
      if (!feedClientVariantPattern.test(smallKey) || !feedClientVariantPattern.test(mediumKey))
        throw Error("FEED_CLIENT_PHOTO_KEYS_INVALID");
      const [small, medium] = await Promise.all([
        signClientWebpStaging(s3 as S3Client, config.bucket, smallKey, 1_750_000, expires),
        signClientWebpStaging(s3 as S3Client, config.bucket, mediumKey, 1_750_000, expires),
      ]);
      return { small, medium };
    },
    async publishClientPhoto(input) {
      const s3 = requireClient();
      const source = feedSourcePattern.exec(input.sourceKey);
      if (!source || source[4] !== "webp") throw Error("FEED_CLIENT_PHOTO_SOURCE_INVALID");
      const stagePrefix = input.sourceKey.replace(/source\.webp$/, "");
      const smallStage = `${stagePrefix}s.webp`, mediumStage = `${stagePrefix}m.webp`;
      const m = /^media\/v2\/([A-Za-z0-9_-]{1,128})\/v1\/image\/s\.webp$/.exec(input.smallKey);
      if (!m || input.thumbKey !== input.smallKey.replace(/s\.webp$/, "m.webp") ||
          input.fullKey !== input.smallKey.replace(/s\.webp$/, "l.webp") ||
          !feedClientVariantPattern.test(smallStage) || !feedClientVariantPattern.test(mediumStage))
        throw Error("FEED_CLIENT_PHOTO_TARGET_INVALID");
      [input.smallKey,input.thumbKey,input.fullKey].forEach(assertFeedFinalKey);
      const [small, medium, full] = await Promise.all([
        verifyClientWebp(s3 as S3Client, config.bucket, smallStage, 360, 1_750_000),
        verifyClientWebp(s3 as S3Client, config.bucket, mediumStage, 720, 1_750_000),
        verifyClientWebp(s3 as S3Client, config.bucket, input.sourceKey, 1440, 1_750_000),
      ]);
      const photos = [small, medium, full];
      if (photos.some((x, i) => i > 0 && (x.width < photos[i-1]!.width ||
          x.height < photos[i-1]!.height ||
          Math.abs(x.width/x.height - photos[i-1]!.width/photos[i-1]!.height) > 0.012)))
        throw Error("FEED_CLIENT_PHOTO_DIMENSIONS_INVALID");
      await Promise.all([
        copyVerifiedClientWebp(s3 as S3Client, config.bucket, smallStage, input.smallKey, small),
        copyVerifiedClientWebp(s3 as S3Client, config.bucket, mediumStage, input.thumbKey, medium),
        copyVerifiedClientWebp(s3 as S3Client, config.bucket, input.sourceKey, input.fullKey, full),
      ]);
      return { width: full.width, height: full.height };
    },
    async signClientVideoPoster(input) {
      const s3=requireClient() as S3Client;
      const source=feedSourcePattern.exec(input.sourceKey);
      const seconds=Math.floor((input.expiresAt.getTime()-Date.now())/1000);
      if(!source||source[4]!=="mp4"||seconds<1||seconds>600)
        throw Error("FEED_CLIENT_VIDEO_POSTER_POLICY_DENIED");
      const stage=input.sourceKey.replace(/source\.mp4$/,"poster.webp");
      if(!feedClientVariantPattern.test(stage))throw Error("FEED_CLIENT_VIDEO_POSTER_KEY_DENIED");
      return signClientWebpStaging(s3,config.bucket,stage,1_750_000,seconds);
    },
    async publishClientVideo(input) {
      const s3=requireClient() as S3Client;
      const source=feedSourcePattern.exec(input.sourceKey);
      if(!source||source[4]!=="mp4"||
        !/^media\/v2\/[A-Za-z0-9_-]{1,128}\/v1\/video\/720\.mp4$/.test(input.finalKey)||
        input.posterKey!==input.finalKey.replace(/video\/720\.mp4$/,"poster.webp"))
        throw Error("FEED_CLIENT_VIDEO_KEY_DENIED");
      assertFeedFinalKey(input.finalKey);assertFeedFinalKey(input.posterKey);
      const stage=input.sourceKey.replace(/source\.mp4$/,"poster.webp");
      if(!feedClientVariantPattern.test(stage))throw Error("FEED_CLIENT_VIDEO_POSTER_KEY_DENIED");
      const [valid,poster]=await Promise.all([
        verifyClientMp4(s3,config.bucket,input.sourceKey,input.bytes),
        verifyClientWebp(s3,config.bucket,stage,480,1_750_000),
      ]);
      if(Math.abs(valid.width/valid.height-poster.width/poster.height)>0.015)
        throw Error("FEED_CLIENT_VIDEO_POSTER_ASPECT_MISMATCH");
      await Promise.all([
        copyVerifiedClientMp4(s3,config.bucket,input.sourceKey,input.finalKey,valid),
        copyVerifiedClientWebp(s3,config.bucket,stage,input.posterKey,poster),
      ]);
      return {width:valid.width,height:valid.height,durationSeconds:valid.durationSeconds};
    },
    async copyGalleryPhotoVariants(input) {
      const s3=requireClient() as S3Client;
      const galleryBucket=runtimeEnv.GALLERY_BUCKET ?? (config.isolatedNonprod ? config.bucket : "");
      if(!galleryBucket||!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(galleryBucket))
        throw Error("FEED_GALLERY_SOURCE_BUCKET_UNAVAILABLE");
      const validId=(s:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(s);
      if(![input.ownerId,input.albumId,input.photoId,input.mediaId].every(validId))
        throw Error("FEED_GALLERY_COPY_ID_INVALID");
      const v2=`gallery/${input.ownerId}/media/${input.photoId}/v2`;
      const legacy=`albums/${input.ownerId}/${input.albumId}/photos/${input.photoId}`;
      if(![v2,legacy].some(prefix=>
          input.thumbKey===`${prefix}/thumb.webp`&&input.fullKey===`${prefix}/full.webp`))
        throw Error("FEED_GALLERY_COPY_SOURCE_UNAUTHORIZED");
      const target=`media/v2/${input.mediaId}/v1/image/`;
      const destinations=[target+"s.webp",target+"m.webp",target+"l.webp"];
      destinations.forEach(assertFeedFinalKey);
      // Existing photos are immutable. Decoder validation ensures no caller
      // substitutes bad MIME, animated/metadata-laden bytes or forged size.
      const [thumb,full]=await Promise.all([
        verifyClientWebp(s3,galleryBucket,input.thumbKey,1920,10*1024*1024),
        verifyClientWebp(s3,galleryBucket,input.fullKey,1920,10*1024*1024),
      ]);
      if(thumb.width>full.width||thumb.height>full.height||
         Math.abs(thumb.width/thumb.height-full.width/full.height)>0.012)
        throw Error("FEED_GALLERY_COPY_ASPECT_INVALID");
      const srcKeys=[input.thumbKey,input.thumbKey,input.fullKey];
      const etags=[thumb.etag,thumb.etag,full.etag];
      const bytes=[thumb.bytes,thumb.bytes,full.bytes];
      await Promise.all(destinations.map(async(dest,i)=>{
        const src=`${galleryBucket}/${srcKeys[i]!.split("/").map(encodeURIComponent).join("/")}`;
        await s3.send(new CopyObjectCommand({Bucket:config.bucket,Key:dest,
          CopySource:src,CopySourceIfMatch:etags[i],
          ContentType:"image/webp",MetadataDirective:"REPLACE",
          CacheControl:"public, max-age=86400"}),
        {abortSignal:AbortSignal.timeout(15_000)});
        const head=await s3.send(new HeadObjectCommand({Bucket:config.bucket,Key:dest}),
          {abortSignal:AbortSignal.timeout(12_000)});
        if(head.ContentType!=="image/webp"||head.ContentLength!==bytes[i]||!head.ETag)
          throw Error("FEED_GALLERY_COPY_DESTINATION_UNVERIFIED");
      }));
      return {width:full.width,height:full.height};
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
        return signFeedCdnUrl("https://quepraquiecebquomiel.begetcdn.cloud", input.key,
          input.expiresAt, liveCdnSecret, Date.now(), "beget", longLivedUrls ? 172800 : 360);
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
      return signFeedCdnUrl(config.cdnBaseUrl, input.key, input.expiresAt,
        config.cdnSecret, Date.now(), config.cdnProvider, longLivedUrls ? 172800 : 360);
    },
  };
}
export function createFeedStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): FeedStoragePort {
  return createFeedStorage(feedStorageConfigFromEnv(env), undefined, env);
}
