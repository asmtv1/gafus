const id = '[A-Za-z0-9_-]{1,128}';
const prefix = `albums/(${id})/(${id})`;
export const sourcePattern = new RegExp(`^${prefix}/incoming/(${id})/source\\.(jpg|png|webp)$`);
export const finalPattern = new RegExp(`^${prefix}/photos/(${id})/(thumb|full)\\.webp$`);
const attemptPattern = new RegExp(`^${prefix}/incoming/(${id})/attempts/(${id})/(thumb|full)\\.webp$`);
const vetPrefix = `users/${id}/pets/${id}/vet-visits/${id}/${id}`;
export const vetPreviewPattern = new RegExp(`^${vetPrefix}/thumb\\.webp$`);
const vetOriginalPattern = new RegExp(`^${vetPrefix}/original\\.(jpg|png|webp|pdf)$`);
export function assertGalleryKey(key: string): void {
  if (typeof key !== 'string' || !(sourcePattern.test(key) || finalPattern.test(key) || attemptPattern.test(key) || vetPreviewPattern.test(key) || vetOriginalPattern.test(key)))
    throw new Error('UNTRUSTED_KEY');
}
export function assertFinalKey(key: string): void {
  if (!finalPattern.test(key) && !vetPreviewPattern.test(key)) throw new Error('UNTRUSTED_FINAL_KEY');
}
export function sourceUploadId(key: string): string | null { return sourcePattern.exec(key)?.[3] ?? null; }
/** Validate the raw route before URL parsing or decoding, which could normalize traversal. */
export function originKey(rawPath: string): string {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.includes('%') || rawPath.includes('\\') || rawPath.includes('?') || rawPath.includes('#'))
    throw new Error('UNTRUSTED_PATH');
  const key = rawPath.slice(1);
  assertFinalKey(key);
  return key;
}
