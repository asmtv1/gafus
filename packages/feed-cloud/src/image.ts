/** Pure, independently testable feed image preflight and conversion policy.
 * Image bytes are decoded by an injected engine in the isolated worker.
 */
export const FEED_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const FEED_IMAGE_OUTPUT_MAX_BYTES = 1_750_000;
export const FEED_IMAGE_MAX_PIXELS = 50_000_000;
export class FeedImageError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "FeedImageError"; }
}
export interface FeedImageInfo {
  format: string;
  width: number;
  height: number;
  pages?: number;
  orientation?: number;
}
export interface FeedImageVariant { bytes: Uint8Array; width: number; height: number }
export interface FeedImageEngine {
  inspect(source: Uint8Array, pixelLimit: number): Promise<FeedImageInfo>;
  encode(source: Uint8Array, options: {
    autoOrient: true; maxEdge: number; withoutEnlargement: true;
    quality: 82; stripMetadata: true; pixelLimit: number; widthOnly?: boolean;
  }): Promise<FeedImageVariant>;
}
