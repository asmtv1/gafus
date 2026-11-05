import { ImageManipulator, manipulateAsync, type Action, type SaveOptions } from "expo-image-manipulator";

/**
 * Keep native Bitmap/UIImage references scoped to exactly one encode.
 * Expo 55 manipulateAsync releases them only on its success path;
 * after a decode/resize/save error subsequent Android retries could retain
 * the failed bitmap in memory. Use the contextual API and release in finally.
 */
export async function encodeUploadImage(
  uri: string,
  actions: Action[],
  options: SaveOptions,
) {
  // Compatibility for existing native/test environments exposing only the
  // legacy API. Expo 55 release builds use the contextual API above.
  if (typeof ImageManipulator?.manipulate !== "function")
    return manipulateAsync(uri, actions, options);
  const context = ImageManipulator.manipulate(uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    for (const action of actions) {
      if ("resize" in action) context.resize(action.resize);
      else throw new Error("PHOTO_UNSUPPORTED_TRANSFORMATION");
    }
    image = await context.renderAsync();
    return await image.saveAsync(options);
  } finally {
    // The image ref must be released before its context. Never leak bitmap
    // memory when renderAsync or saveAsync throws.
    try { image?.release(); } finally { context.release(); }
  }
}
