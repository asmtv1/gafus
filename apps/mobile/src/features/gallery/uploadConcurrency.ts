/** One bounded transfer pool shared across all mounted Mobile Gallery upload screens.
 * Slots are held through reserve + private S3 POST + authoritative readback. */
export const GALLERY_MOBILE_MAX_PARALLEL_UPLOADS = 5;
let active = 0;
const waiting: (() => void)[] = [];
export async function acquireGalleryUploadSlot(): Promise<() => void> {
  if (active < GALLERY_MOBILE_MAX_PARALLEL_UPLOADS) active++;
  else await new Promise<void>(resolve => waiting.push(resolve));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
}
