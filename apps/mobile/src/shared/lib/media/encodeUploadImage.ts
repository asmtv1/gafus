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
  let lostNativeRef = false;
  try {
    for (const action of actions) {
      if ("resize" in action) context.resize(action.resize);
      else throw new Error("PHOTO_UNSUPPORTED_TRANSFORMATION");
    }
    image = await context.renderAsync();
    return await image.saveAsync(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/NativeSharedObjectNotFoundException|Unable to find the native shared object/i.test(message))
      throw error;
    // Expo 55 Android can lose a native SharedObject during a context render.
    // Recreate the context once using Expo's own supported wrapper. Never retry
    // network writes or mutate the original; this only creates a local copy.
    lostNativeRef = true;
  } finally {
    // Expo 55 itself releases the context before the image ref. Treat cleanup
    // as best-effort: a stale SharedObject during release must never turn a
    // successfully saved file into an upload failure.
    try { context.release(); } catch { /* native ref already released */ }
    try { image?.release(); } catch { /* native ref already released */ }
  }
  if (lostNativeRef) return manipulateAsync(uri, actions, options);
  throw new Error("PHOTO_ENCODER_UNEXPECTED_STATE");
}
