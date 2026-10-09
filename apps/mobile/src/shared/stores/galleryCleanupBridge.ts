/**
 * Shared, dependency-free callback bridge for clearing the gallery on logout.
 * Avoid importing the gallery feature graph from the authentication store.
 */
let galleryCleanup: (() => void) | undefined;

export function registerGallerySessionCleanup(cleanup: () => void): void {
  galleryCleanup = cleanup;
}

export function clearRegisteredGallerySession(): void {
  galleryCleanup?.();
}
