/** Safe S3-only finalization of photo renditions already encoded on the user's device.
 * The API validates actual image bytes with Sharp but NEVER transcodes or uploads them.
 */
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import sharp from "sharp";

const MAX_CLIENT_WEBP_BYTES = 2 * 1024 * 1024;
export interface VerifiedClientWebp { width: number; height: number; bytes: number; etag: string }

/** The two device encodes can round the short edge independently by one pixel.
 * Comparing aspect ratios with a fixed decimal epsilon incorrectly rejects
 * valid narrow/wide images (e.g. 360x125 preview of a 379x131 screenshot).
 * Scale by the longest edge and allow only pixel-quantisation error, while
 * still rejecting crops or unrelated images before publishing them.
 */
export function clientWebpRenditionsMatchAspect(
  small: Pick<VerifiedClientWebp, "width" | "height">,
  medium: Pick<VerifiedClientWebp, "width" | "height">,
): boolean {
  const values = [small.width, small.height, medium.width, medium.height];
  if (!values.every(v => Number.isSafeInteger(v) && v > 0) ||
      medium.width < small.width || medium.height < small.height) return false;
  const scale = Math.max(small.width, small.height) / Math.max(medium.width, medium.height);
  // A pixel in each independently encoded rendition may round in opposite
  // directions. At thumbnail resolution this creates <= 1px disagreement.
  return Math.abs(small.width - medium.width * scale) <= 1.000001 &&
    Math.abs(small.height - medium.height * scale) <= 1.000001;
}

export async function signClientWebpStaging(client: S3Client, bucket: string, key: string,
  maxBytes = MAX_CLIENT_WEBP_BYTES, expiresSeconds = 600) {
  if (!key || !bucket || maxBytes < 12 || maxBytes > 10 * 1024 * 1024 ||
      expiresSeconds < 1 || expiresSeconds > 600) throw Error("CLIENT_PHOTO_POLICY_INVALID");
  return createPresignedPost(client, { Bucket: bucket, Key: key, Expires: expiresSeconds,
    Fields: { "Content-Type": "image/webp", success_action_status: "204" },
    Conditions: [["content-length-range", 12, maxBytes + 24 * 1024], ["eq", "$Content-Type", "image/webp"],
      ["eq", "$key", key], ["eq", "$success_action_status", "204"]],
  });
}

/** Enforces compressed byte limit, real codec, dimensions, animation/metadata policy and decode.
 * Never trust client-supplied dimensions, Content-Type, or image headers alone.
 */
export async function verifyClientWebp(client: S3Client, bucket: string, key: string,
  maxEdge: number, maxBytes = MAX_CLIENT_WEBP_BYTES): Promise<VerifiedClientWebp> {
  if (maxEdge < 1 || maxEdge > 1920 || maxBytes < 12 || maxBytes > 10 * 1024 * 1024)
    throw Error("CLIENT_PHOTO_LIMIT_INVALID");
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(12_000) });
  const etag = head.ETag;
  if (!etag || !head.ContentLength || head.ContentLength < 12 ||
      head.ContentLength > maxBytes || head.ContentType !== "image/webp")
    throw Error("CLIENT_PHOTO_UNVERIFIED_HEAD");
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket, Key: key, IfMatch: etag,
  }), { abortSignal: AbortSignal.timeout(15_000) });
  const buffer = await response.Body?.transformToByteArray();
  if (!buffer || buffer.byteLength !== head.ContentLength || buffer.byteLength > maxBytes)
    throw Error("CLIENT_PHOTO_UNVERIFIED_BYTES");
  const image = sharp(buffer, { limitInputPixels: 1920 * 1920, failOn: "warning" });
  const meta = await image.metadata();
  if (meta.format !== "webp" || !meta.width || !meta.height ||
      Math.max(meta.width, meta.height) > maxEdge || meta.pages && meta.pages > 1 ||
      meta.exif || meta.xmp || meta.icc || meta.orientation && meta.orientation !== 1)
    throw Error("CLIENT_PHOTO_UNVERIFIED_IMAGE");
  // Decoding one tiny pixel catches corrupt compressed payloads beyond their header.
  await image.resize(1, 1).toBuffer();
  return { width: meta.width, height: meta.height, bytes: buffer.byteLength, etag };
}

/** S3-side copy fixes the FINAL URL after reservation: the public/private CDN never
 * serves staging keys that a 10-minute presigned POST can still overwrite.
 */
export async function copyVerifiedClientWebp(client: S3Client, bucket: string,
  stagingKey: string, finalKey: string, verified: VerifiedClientWebp,
  cacheControl = "public, max-age=86400") {
  const source = `${bucket}/${stagingKey.split("/").map(encodeURIComponent).join("/")}`;
  await client.send(new CopyObjectCommand({ Bucket: bucket, Key: finalKey,
    CopySource: source, CopySourceIfMatch: verified.etag,
    MetadataDirective: "REPLACE", ContentType: "image/webp",
    CacheControl: cacheControl,
  }), { abortSignal: AbortSignal.timeout(15_000) });
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: finalKey }),
    { abortSignal: AbortSignal.timeout(12_000) });
  if (head.ContentType !== "image/webp" || head.ContentLength !== verified.bytes || !head.ETag)
    throw Error("CLIENT_PHOTO_FINAL_NOT_VERIFIED");
}
