import sharp from "sharp";

/** Infrastructure image engine only. Core owns owner checks, key validation,
 * job leases, retries, publish/rollback and all user-facing state. */
export async function createVetPreview(bytes: Uint8Array): Promise<Uint8Array> {
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error("IMAGE_SIZE");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error", animated: false });
  const meta = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
    !meta.width ||
    !meta.height ||
    meta.width * meta.height > 40_000_000 ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error("IMAGE_FORMAT");
  const output = await sharp(bytes, {
    limitInputPixels: 40_000_000,
    failOn: "error",
    animated: false,
  })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  if (!output.length || output.length > 1_750_000) throw new Error("OUTPUT_TOO_LARGE");
  return output;
}
