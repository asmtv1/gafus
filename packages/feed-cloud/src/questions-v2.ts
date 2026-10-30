/**
 * Questions Photo Media V2 — image-only contract. The database owns status.
 * No chat/feed keys, videos, or client-supplied object paths.
 */
export const QUESTIONS_V2_EDGES = { small: 360, medium: 720 } as const;
export const QUESTIONS_V2_MAX_BYTES = 10 * 1024 * 1024;
export const QUESTIONS_V2_MAX_PIXELS = 50_000_000;
const validId = /^[A-Za-z0-9_-]{1,128}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type QuestionsV2Mime = keyof typeof formats;
export type QuestionsV2Size = keyof typeof QUESTIONS_V2_EDGES;
export interface QuestionsV2Job {
  mediaId: string;
  ownerId: string;
  sourceMime: QuestionsV2Mime;
  sourceBytes: number;
  sourceKey: string;
}
export interface QuestionsV2Variant { key: string; width: number; height: number; bytes: number }
export interface QuestionsV2Manifest {
  kind: "image";
  variants: Record<QuestionsV2Size, QuestionsV2Variant>;
}
export function questionsV2CheckSource(mime: string, bytes: number): QuestionsV2Mime {
  if (!(mime in formats) || !Number.isSafeInteger(bytes) ||
      bytes < 12 || bytes > QUESTIONS_V2_MAX_BYTES)
    throw Error("QUESTIONS_V2_INVALID_SOURCE");
  return mime as QuestionsV2Mime;
}
export function questionsV2Prefix(ownerId: string, mediaId: string) {
  if (!validId.test(ownerId) || !uuid.test(mediaId))
    throw Error("QUESTIONS_V2_INVALID_ID");
  return "questions/v2/" + ownerId + "/" + mediaId;
}
export function questionsV2SourceKey(ownerId: string, mediaId: string, mime: QuestionsV2Mime) {
  questionsV2CheckSource(mime, 12);
  return questionsV2Prefix(ownerId, mediaId) + "/incoming/source." + formats[mime];
}
export function questionsV2FinalKeys(ownerId: string, mediaId: string) {
  // Existing public Questions bucket policy already allows only this prefix.
  // Keep unprocessed originals at questions/v2 (outside public GetObject ACL).
  const base = "questions/uploads/questions/v2/" + ownerId + "/" + mediaId + "/v1/image";
  return { small: base + "/s.webp", medium: base + "/m.webp" };
}
export function questionsV2ValidateJob(job: QuestionsV2Job) {
  questionsV2CheckSource(job.sourceMime, job.sourceBytes);
  if (job.sourceKey !== questionsV2SourceKey(job.ownerId, job.mediaId, job.sourceMime))
    throw Error("QUESTIONS_V2_UNTRUSTED_SOURCE_KEY");
}
export function questionsV2ValidateManifest(job: QuestionsV2Job, manifest: QuestionsV2Manifest) {
  questionsV2ValidateJob(job);
  if (manifest?.kind !== "image" || !manifest.variants ||
      Object.keys(manifest.variants).sort().join(",") !== "medium,small")
    throw Error("QUESTIONS_V2_INVALID_MANIFEST");
  const expected = questionsV2FinalKeys(job.ownerId, job.mediaId);
  const a = manifest.variants.small, b = manifest.variants.medium;
  for (const [name, variant] of [["small", a], ["medium", b]] as const) {
    if (!variant || !Number.isSafeInteger(variant.width) ||
        !Number.isSafeInteger(variant.height) || !Number.isSafeInteger(variant.bytes) ||
        variant.width < 1 || variant.width > QUESTIONS_V2_EDGES[name] ||
        variant.height < 1 || variant.bytes < 12 || variant.bytes > 1_750_000)
      throw Error("QUESTIONS_V2_INVALID_MANIFEST");
  }
  // Tiny sources reuse the small rendition: no duplicate object/PUT.
  if (a.key !== expected.small ||
      (b.key !== expected.medium &&
        !(b.key === expected.small && a.width === b.width && a.height === b.height && a.bytes === b.bytes)))
    throw Error("QUESTIONS_V2_UNTRUSTED_OUTPUT_KEY");
  if (b.width < a.width || (b.width === a.width && b.height !== a.height))
    throw Error("QUESTIONS_V2_INVALID_DIMENSIONS");
}
