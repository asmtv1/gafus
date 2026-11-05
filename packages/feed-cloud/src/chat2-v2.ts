/**
 * Chat 2.0 media V2 contract for a FUTURE isolated media job.
 * Reuses the exact Moments V2 image/video transcoders; this module does not
 * upload, enqueue, publish, sign links or modify existing chat messages.
 */
import { FEED_IMAGE_SOURCE_MAX_BYTES } from "./image.js";
import { FEED_VIDEO_MAX_BYTES, FEED_VIDEO_MAX_SECONDS } from "./video.js";


const segment = /^[A-Za-z0-9_-]{1,128}$/;
const mediaIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const CHAT2_V2_IMAGE_EDGES = { small: 360, medium: 1440 } as const;
export const CHAT2_V2_VIDEO_QUALITIES = [360, 720] as const;
export const CHAT2_V2_MAX_DURATION_SECONDS = FEED_VIDEO_MAX_SECONDS;
export const CHAT2_V2_MAX_IMAGE_BYTES = FEED_IMAGE_SOURCE_MAX_BYTES;
export const CHAT2_V2_MAX_VIDEO_BYTES = FEED_VIDEO_MAX_BYTES;

const sources = {
  "image/jpeg": { kind: "image", ext: "jpg", maxBytes: FEED_IMAGE_SOURCE_MAX_BYTES },
  "image/png": { kind: "image", ext: "png", maxBytes: FEED_IMAGE_SOURCE_MAX_BYTES },
  "image/webp": { kind: "image", ext: "webp", maxBytes: FEED_IMAGE_SOURCE_MAX_BYTES },
  "image/heic": { kind: "image", ext: "heic", maxBytes: FEED_IMAGE_SOURCE_MAX_BYTES },
  "image/heif": { kind: "image", ext: "heif", maxBytes: FEED_IMAGE_SOURCE_MAX_BYTES },
  "video/mp4": { kind: "video", ext: "mp4", maxBytes: FEED_VIDEO_MAX_BYTES },
  "video/quicktime": { kind: "video", ext: "mov", maxBytes: FEED_VIDEO_MAX_BYTES },
  "video/webm": { kind: "video", ext: "webm", maxBytes: FEED_VIDEO_MAX_BYTES },
} as const;
export type Chat2V2Mime = keyof typeof sources;
export type Chat2V2Kind = "image" | "video";
export type Chat2JobKind = Chat2V2Kind;
export type Chat2V2Size = keyof typeof CHAT2_V2_IMAGE_EDGES;
export type Chat2V2Quality = typeof CHAT2_V2_VIDEO_QUALITIES[number];
export type Chat2V2Manifest =
  | { kind: "image"; width: number; height: number; keys: Record<Chat2V2Size, string>; imageSizes: Record<Chat2V2Size,{width:number;height:number}> }
  | { kind: "video"; width: number; height: number; durationSeconds: number;
      posterKey?: string; renditions: Array<{ quality: Chat2V2Quality;
        key: string; width: number; height: number; bytes: number }> };

export function chat2V2ClassifySource(mime: string, bytes: number) {
  const source = Object.prototype.hasOwnProperty.call(sources, mime)
    ? sources[mime as Chat2V2Mime] : undefined;
  if (!source || !Number.isSafeInteger(bytes) || bytes < 10 || bytes > source.maxBytes)
    throw new Error("CHAT2_V2_UNSUPPORTED_SOURCE");
  return source;
}

function prefix(roomId: string, ownerId: string, mediaId: string) {
  if (!segment.test(roomId) || !segment.test(ownerId) || !mediaIdPattern.test(mediaId))
    throw new Error("CHAT2_V2_INVALID_ID");
  return `chat2/${roomId}/${ownerId}/${mediaId}`;
}
export function chat2V2SourceKey(roomId: string, ownerId: string, mediaId: string,
  mime: Chat2V2Mime): string {
  const source = sources[mime];
  if (!source) throw new Error("CHAT2_V2_UNSUPPORTED_SOURCE");
  return `${prefix(roomId, ownerId, mediaId)}/incoming/source.${source.ext}`;
}
export function chat2V2FinalKeys(roomId: string, ownerId: string, mediaId: string) {
  const base = `${prefix(roomId, ownerId, mediaId)}/v1`;
  return {
    image: {
      small: `${base}/image/s.webp`,
      medium: `${base}/image/m.webp`,
    },
    video: {
      poster: `${base}/poster.webp`,
      variants: {
        360: `${base}/video/360.mp4`,
        720: `${base}/video/720.mp4`,
      },
    },
  };
}
export interface Chat2V2Job {
  conversationId: string;
  ownerId: string;
  mediaId: string;
  sourceMime: Chat2V2Mime;
  sourceBytes: number;
  sourceKey: string;
  /** Authenticated Core-only claim hint, never supplied by a Web/Mobile client. */
  phase?: "background_360";
}
/** Authorization, media record lookup and signed job claim must happen before calling this. */
export function validateChat2V2Job(job: Chat2V2Job) {
  const source = chat2V2ClassifySource(job.sourceMime, job.sourceBytes);
  if (job.sourceKey !== chat2V2SourceKey(job.conversationId, job.ownerId, job.mediaId, job.sourceMime))
    throw new Error("CHAT2_V2_UNTRUSTED_SOURCE_KEY");
  return source;
}

// A future Job callback must not promote a partial or forged output to READY.
// Storage HEAD checks and the DB compare-and-swap still belong to the job adapter.
export function validateChat2V2Manifest(job: Chat2V2Job, output: Chat2V2Manifest): void {
  validateChat2V2Job(job);
  const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
  const expectedKind = sources[job.sourceMime].kind;
  if (output.kind !== expectedKind || !Number.isSafeInteger(output.width) ||
      !Number.isSafeInteger(output.height) || output.width < 1 || output.height < 1)
    throw new Error("CHAT2_V2_INVALID_MANIFEST");
  if (output.kind === "image") {
    if (output.keys.small !== keys.image.small ||
        output.keys.medium !== keys.image.medium ||
        Object.keys(output.keys).length !== 2 ||
        !output.imageSizes || Object.keys(output.imageSizes).length !== 2 ||
        !(["small","medium"] as const).every(size => Number.isSafeInteger(output.imageSizes[size]?.width) &&
          output.imageSizes[size].width >= 1 && output.imageSizes[size].width <= CHAT2_V2_IMAGE_EDGES[size] &&
          Number.isSafeInteger(output.imageSizes[size]?.height) && output.imageSizes[size].height >= 1 &&
          (size !== "medium" || output.imageSizes[size].height <= CHAT2_V2_IMAGE_EDGES.medium)))
      throw new Error("CHAT2_V2_INVALID_MANIFEST");
    if(output.width !== output.imageSizes.medium.width || output.height !== output.imageSizes.medium.height)
      throw new Error("CHAT2_V2_INVALID_MANIFEST");
    return;
  }
  if ((output.posterKey !== undefined && output.posterKey !== keys.video.poster) ||
      !Number.isFinite(output.durationSeconds) || output.durationSeconds <= 0 ||
      output.durationSeconds > FEED_VIDEO_MAX_SECONDS ||
      output.renditions.length < 1 || output.renditions.length > 2)
    throw new Error("CHAT2_V2_INVALID_MANIFEST");
  const visited = new Set<number>();
  for (const file of output.renditions) {
    if (!CHAT2_V2_VIDEO_QUALITIES.includes(file.quality) ||
        file.key !== keys.video.variants[file.quality] ||
        !Number.isSafeInteger(file.width) || file.width < 1 ||
        !Number.isSafeInteger(file.height) || file.height < 1 ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 24 ||
        visited.has(file.quality))
      throw new Error("CHAT2_V2_INVALID_MANIFEST");
    visited.add(file.quality);
  }
  if (!visited.has(360) && !visited.has(720))
    throw new Error("CHAT2_V2_INVALID_MANIFEST");
}
