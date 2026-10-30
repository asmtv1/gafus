/**
 * Dedicated photo-only Questions V2 worker. Never handles video or writes DB.
 * Its result is NOT public until Core independently HEAD-verifies outputs.
 */
import sharp from "sharp";
import {
  QUESTIONS_V2_MAX_PIXELS, QUESTIONS_V2_MAX_BYTES,
  questionsV2FinalKeys, questionsV2ValidateJob, questionsV2ValidateManifest,
  type QuestionsV2Job, type QuestionsV2Manifest,
} from "@gafus/feed-cloud";

sharp.concurrency(1);
sharp.cache(false);
export interface QuestionsV2Objects {
  downloadSource(job: QuestionsV2Job, signal: AbortSignal): Promise<Uint8Array>;
  createWebp(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
}
const formatForMime = {
  "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp",
} as const;

export async function processQuestionsV2Photo(
  job: QuestionsV2Job, objects: QuestionsV2Objects, signal: AbortSignal,
): Promise<QuestionsV2Manifest> {
  questionsV2ValidateJob(job);
  signal.throwIfAborted();
  const source = await objects.downloadSource(job, signal); // exactly one GET
  if (source.byteLength !== job.sourceBytes || source.byteLength > QUESTIONS_V2_MAX_BYTES)
    throw Error("QUESTIONS_V2_SOURCE_BYTES_MISMATCH");
  const base = sharp(source, {
    animated: false, failOn: "warning", limitInputPixels: QUESTIONS_V2_MAX_PIXELS,
  });
  const meta = await base.metadata();
  if (meta.format !== formatForMime[job.sourceMime] || !meta.width || !meta.height ||
      (meta.pages ?? 1) !== 1 || meta.width * meta.height > QUESTIONS_V2_MAX_PIXELS)
    throw Error("QUESTIONS_V2_SOURCE_CONTENT_REJECTED");
  signal.throwIfAborted();
  // Orientation 5–8 swaps the display dimensions. resize(width) preserves
  // portrait height instead of incorrectly enforcing a max-longest-edge.
  const orientedWidth = meta.orientation && meta.orientation >= 5 && meta.orientation <= 8
    ? meta.height : meta.width;
  const encode = async (width: number) => {
    const out = await base.clone().rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (out.data.length < 12 || out.data.length > 1_750_000)
      throw Error("QUESTIONS_V2_WEBP_OUTPUT_TOO_LARGE");
    return { bytes: out.data, width: out.info.width, height: out.info.height };
  };
  const smallPromise = encode(360);
  const mediumPromise = orientedWidth <= 360 ? smallPromise : encode(720);
  // Both Sharp pipelines settle before uploads, including errors, so no
  // operations outlive the attempt after one rendition fails.
  const [small, medium] = await Promise.all([smallPromise, mediumPromise]);
  signal.throwIfAborted();
  const keys = questionsV2FinalKeys(job.ownerId, job.mediaId);
  const deduplicated = small.width === medium.width && small.height === medium.height;
  const outputKeys = [keys.small, ...(deduplicated ? [] : [keys.medium])];
  const bytes = [small.bytes, ...(deduplicated ? [] : [medium.bytes])];
  const writes = await Promise.allSettled(outputKeys.map((key, index) =>
    objects.createWebp(key, bytes[index]!, signal)));
  for (const write of writes) if (write.status === "rejected") throw write.reason;
  const manifest: QuestionsV2Manifest = { kind: "image", variants: {
    small: { key: keys.small, width: small.width, height: small.height, bytes: small.bytes.length },
    medium: { key: deduplicated ? keys.small : keys.medium, width: medium.width,
      height: medium.height, bytes: medium.bytes.length },
  }};
  questionsV2ValidateManifest(job, manifest);
  return manifest;
}
