import sharp from "sharp";

sharp.concurrency(1);
sharp.cache(false);

export async function convertQuestionImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("IMAGE_SIZE");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 50_000_000, failOn: "warning", animated: false }).metadata();
  } catch { throw new Error("INVALID_IMAGE"); }
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      !meta.width || !meta.height || meta.width * meta.height > 50_000_000 ||
      (meta.pages ?? 1) !== 1) throw new Error("IMAGE_FORMAT");
  const process = async (edge: number) => {
    let dimension = edge;
    for (;;) {
      const result = await sharp(bytes, {limitInputPixels: 50_000_000, failOn: "warning", animated: false})
        .rotate().resize({width: dimension, height: dimension, fit: "inside", withoutEnlargement: true})
        .webp({quality: 82}).toBuffer({resolveWithObject: true});
      if (result.data.length <= 1_750_000)
        return {bytes: result.data, width: result.info.width, height: result.info.height};
      if (dimension <= 256) throw new Error("OUTPUT_TOO_LARGE");
      dimension = Math.max(256, Math.round(dimension * 0.75));
    }
  };
  // Sequential encode bounds memory for 50 MP user input.
  return {thumb: await process(480), full: await process(1920)};
}
